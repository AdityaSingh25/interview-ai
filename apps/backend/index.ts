import express from "express";
import { preInterviewBody } from "./types";
import axios from "axios";
import cors from "cors";
import { prisma } from "./db";
import { initSideband } from "./sideband";
import { calculateScore } from "./result";

const app = express();

app.use(express.json());

app.use(cors());

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

app.post("/api/v1/pre-interview", async (req, res) => {
  const { success, data } = preInterviewBody.safeParse(req.body);
  if (!success) {
    res.status(411).json({
      message: "bad body",
    });
    return;
  }

  const githubUrl = data?.githubUrl.endsWith("/")
    ? data?.githubUrl.slice(0, -1)
    : data?.githubUrl;

  const githubUsername = githubUrl?.split("/").pop();

  const userReposInfo = await axios.get(
    `https://api.github.com/users/${githubUsername}/repos`,
  );

  // lets filter only what we need
  const filteredUserRepo = userReposInfo.data.map((x: any) => ({
    description: x.description,
    name: x.name,
    fullName: x.full_name,
  }));

  const interview = await prisma.interview.create({
    data: {
      githubMetada: JSON.stringify(filteredUserRepo),
      status: "Pre",
    },
  });

  return res.json({
    id: interview.id,
  });
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

app.get("/api/v1/result/:interviewId", async (req, res) => {
  prisma.interview
    .findFirst({
      where: {
        id: req.params.interviewId,
      },
      include: {
        conversations: true,
      },
    })
    .then(async (interview) => {
      if (!interview) {
        return res.status(404).json({
          message: "Interview not found!",
        });
      }

      res.json({
        transcript: interview?.conversations.map((conversation) => ({
          type: conversation.type,
          content: conversation.message,
          createdAt: conversation.createdAt,
        })),
        score: interview?.score,
        result: interview?.feedback,
        status: interview?.status,
      });

      if (interview.status != "Done") {
        // making a gemini call here
        const interviewResult = await calculateScore(interview.conversations);

        await prisma.interview.update({
          where: {
            id: req.params.interviewId,
          },
          data: {
            status: "Done",
            feedback: interviewResult.feedback,
            result: interviewResult.score,
          },
        });
      }
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        error: "Internal server error : " + error,
      });
    });
});

app.listen(3001);
