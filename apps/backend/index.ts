import express from "express";
import { preInterviewBody } from "./types";
import axios from "axios";
import cors from "cors";
import { prisma } from "./db";
import { initSideband } from "./sideband";
import { calculateScore } from "./result";
import multer from "multer";
import { extractText, getDocumentProxy } from "unpdf";

const app = express();

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // keep in sync with MAX_RESUME_MB
  },
});

// FRONTEND_URL: comma-separated list of allowed origins in production
// (e.g. https://your-frontend.up.railway.app). Unset = allow any origin (local dev).
const allowedOrigins = process.env.FRONTEND_URL?.split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : undefined));

// Parse raw SDP payloads posted from the browser
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

const sessionConfig = JSON.stringify({
  type: "realtime",
  model: "gpt-realtime-2.1-mini",
  audio: {
    output: { voice: "marin" },
    input: {
      transcription: { model: "gpt-4o-mini-transcribe", language: "en" }, // or "gpt-4o-mini-transcribe" (cheaper), "whisper-1"
      noise_reduction: { type: "near_field" }, // laptop/headset mic
      turn_detection: { type: "semantic_vad" },
    },
  },
});

const MAX_RESUME_MB = 5;

async function pdfToText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

// Accepts "https://github.com/user", "github.com/user/" or just "user".
function githubUsernameFrom(input: string): string | null {
  const value = input.trim();
  return (
    value.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i)?.[1] ??
    value.match(/^[A-Za-z0-9-]{1,39}$/)?.[0] ??
    null
  );
}

// Runs multer and turns its errors (e.g. file too big) into a JSON 4xx
// instead of Express's default HTML 500.
const parseResumeUpload: express.RequestHandler = (req, res, next) => {
  upload.single("resume")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const tooBig = error.code === "LIMIT_FILE_SIZE";
      res.status(tooBig ? 413 : 400).json({
        message: tooBig ? `Resume must be ${MAX_RESUME_MB} MB or smaller.` : error.message,
      });
      return;
    }
    if (error) return next(error);
    next();
  });
};

// Needs a GitHub profile, a resume PDF, or both.
app.post("/api/v1/pre-interview", parseResumeUpload, async (req, res) => {
  const { success, data } = preInterviewBody.safeParse(req.body);
  if (!success) {
    return res.status(400).json({ message: "Invalid request." });
  }

  const githubInput = data.githubUrl?.trim() ?? "";
  const resumeFile = req.file;

  if (!githubInput && !resumeFile) {
    return res
      .status(400)
      .json({ message: "Add your GitHub profile, a resume, or both." });
  }

  // GitHub (optional)
  let githubRepos: { name: string; description: string | null; fullName: string }[] = [];
  if (githubInput) {
    const username = githubUsernameFrom(githubInput);
    if (!username) {
      return res.status(400).json({
        message: "That doesn't look like a GitHub profile link (github.com/your-name).",
      });
    }
    try {
      const response = await axios.get(
        `https://api.github.com/users/${username}/repos`,
        { params: { per_page: 100, sort: "updated" } },
      );
      githubRepos = response.data.map((repo: any) => ({
        name: repo.name,
        description: repo.description,
        fullName: repo.full_name,
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return res
          .status(400)
          .json({ message: `GitHub user "${username}" was not found.` });
      }
      console.error("GitHub fetch failed:", error);
      return res.status(502).json({
        message: "Couldn't reach GitHub right now. Try again, or continue with just your resume.",
      });
    }
  }

  // Resume (optional)
  let resumeData: string | null = null;
  if (resumeFile) {
    if (resumeFile.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "The resume must be a PDF." });
    }
    try {
      resumeData = await pdfToText(resumeFile.buffer);
    } catch (error) {
      console.error("PDF parse failed:", error);
      return res
        .status(400)
        .json({ message: "Couldn't read that PDF. Try exporting it again." });
    }
    if (!resumeData) {
      return res.status(400).json({
        message: "No text found in that PDF (is it a scanned image?). Upload a text-based PDF.",
      });
    }
  }

  const interview = await prisma.interview.create({
    data: {
      githubMetada: JSON.stringify(githubRepos),
      status: "Pre",
      resumeData,
    },
  });

  return res.json({ id: interview.id });
});

// by default it will read : GEMINI_API_KEY from the .env
// app.get("/get-ephemeral-token", async (req, res) => {
//   const client = new GoogleGenAI({ httpOptions: { apiVersion: "v1alpha" } });
//   const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

//   try {
//     const token = await client.authTokens.create({
//       config: {
//         uses: 1, // The default
//         expireTime: expireTime, // Default is 30 mins
//         newSessionExpireTime: new Date(
//           Date.now() + 1 * 60 * 1000,
//         ).toISOString(),
//         liveConnectConstraints: {
//           model: "gemini-3.8-live",
//           config: {
//             sessionResumption: {},
//             responseModalities: [Modality.AUDIO],
//           },
//         }, // Default 1 minute in the future
//       },
//     });
//     return res.json({
//       token: token,
//     });
//   } catch (e) {
//     console.log("token error :", e);
//     res.status(500).json({ message: "failed to create token" });
//   }
// });

// An endpoint which creates a Realtime API session.

app.post("/api/v1/session/:interviewId", async (req, res) => {
  const fd = new FormData();
  fd.set("sdp", req.body);
  fd.set("session", sessionConfig);

  const result = await prisma.interview.updateMany({
    where: { id: req.params.interviewId, status: "Pre" },
    data: {
      status: "InProgress",
    },
  });
  if (result.count == 0) {
    return res.status(409).json({
      message: "interview not found or already started",
    });
  }

  try {
    const sdpResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Safety-Identifier": "hashed-user-id",
        },
        body: fd,
      },
    );

    if (!sdpResponse.ok) {
      await prisma.interview.updateMany({
        where: { id: req.params.interviewId, status: "InProgress" },
        data: {
          status: "Pre",
        },
      });
    }
    // Send back the SDP we received from the OpenAI REST API
    const sdp = await sdpResponse.text();
    res.set(
      "Content-Type",
      sdpResponse.ok
        ? "application/sdp"
        : (sdpResponse.headers.get("Content-Type") ?? "text/plain"),
    );

    const location = sdpResponse.headers.get("Location");
    if (location) res.set("Location", location);

    const callId = location?.split("/").pop();

    res.status(sdpResponse.status).send(sdp);
    if (sdpResponse.ok && callId) {
      initSideband(callId as string, req.params.interviewId);
    }
  } catch (error) {
    console.error("Session creation error:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Interviews whose evaluation is running right now. Pollers hit /result every few
// seconds; this makes sure only the first one starts a Gemini call.
// In-memory is fine for a single server process.
const evaluating = new Set<string>();

async function evaluateInterview(interviewId: string) {
  if (evaluating.has(interviewId)) return;
  evaluating.add(interviewId);
  try {
    const messages = await prisma.message.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });
    const { score, feedback } = await calculateScore(messages);
    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "Done", score, feedback },
    });
  } catch (error) {
    // Leave the status as is, so the next poll retries.
    console.error(`Evaluation failed for interview ${interviewId}:`, error);
  } finally {
    evaluating.delete(interviewId);
  }
}

app.get("/api/v1/result/:interviewId", async (req, res) => {
  const interviewId = req.params.interviewId;
  try {
    const interview = await prisma.interview.findFirst({
      where: { id: interviewId },
      include: { conversations: { orderBy: { createdAt: "asc" } } },
    });

    if (!interview) {
      return res.status(404).json({ message: "Interview not found!" });
    }

    // The frontend opens the results page when the call ends, so an
    // InProgress interview being polled here means it's ready to score.
    // Runs in the background; the page keeps polling until status is Done.
    if (interview.status === "InProgress") {
      void evaluateInterview(interviewId);
    }

    return res.json({
      transcript: interview.conversations.map((conversation) => ({
        type: conversation.type,
        content: conversation.message,
        createdAt: conversation.createdAt,
      })),
      score: interview.score,
      feedback: interview.feedback,
      status: interview.status,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("api/v1/resume", async (req, res) => {
  res.download("./file.pdf");
});
// Hosts like Railway/Render assign the port through the PORT env var.
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Backend listening on port ${port}`));
