import express from "express";
import { preInterviewBody } from "./types";
import axios from "axios";
import cors from "cors";
import { prisma } from "./db";
import { GoogleGenAI, Modality } from "@google/genai";
import { log } from "node:console";

const app = express();

app.use(express.json());

app.use(cors());

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: "gpt-realtime-2.1",
    audio: {
      output: {
        voice: "marin",
      },
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

app.get("/api/v1/get-ephemeral-token", async (req, res) => {
  log("token hit");
  res.set("Cache-Control", "no-store");
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "hashed-user-id",
        },
        body: sessionConfig,
      },
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.listen(3001);
