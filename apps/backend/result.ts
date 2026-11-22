import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const outputSchema = z.object({
  feedback: z
    .string()
    .describe(
      "Feedback for the candidate: what went well, what to improve, with concrete examples from their answers",
    ),
  score: z
    .int()
    .min(0)
    .max(10)
    .describe("Score for the candidate's interview, from 0 to 10"),
});

export type InterviewResult = z.infer<typeof outputSchema>;

type TranscriptMessage = {
  type: "Assistant" | "User";
  message: string;
  createdAt: Date;
};

const RESULT_PROMPT = `You are an expert technical interviewer evaluating a candidate's interview.
Below is the transcript of a voice interview between an AI interviewer and the candidate.
The candidate's lines come from speech-to-text, so ignore small transcription errors.

Give the candidate a score from 0 to 10 based on the quality, depth and clarity of their answers.
Then give feedback: what they did well and what they should improve, citing their actual answers.
Speak to the candidate directly ("you").`;

export async function calculateScore(
  messages: TranscriptMessage[],
): Promise<InterviewResult> {
  const candidateSpoke = messages.some(
    (m) => m.type === "User" && m.message.trim(),
  );
  if (!candidateSpoke) {
    return {
      score: 0,
      feedback:
        "No answers were recorded in this interview, so there is nothing to evaluate.",
    };
  }

  const transcript = [...messages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(
      (m) => `${m.type === "User" ? "Candidate" : "Interviewer"}: ${m.message}`,
    )
    .join("\n");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: unknown;

  // Gemini models sometimes return 503 "high demand" (or 429/500). When that
  // happens, fall through to the next model instead of failing the evaluation.
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `${RESULT_PROMPT}\n\n## Transcript\n${transcript}`,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(outputSchema), // JSON Schema from Zod
          // Scoring a short transcript doesn't need deep reasoning; default
          // thinking made each call take 40s+ and time out on Railway.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          // An overloaded model can hang instead of erroring; give up and try the next one.
          abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        },
      });

      if (!response.text) {
        throw new Error(`${model} returned an empty evaluation`);
      }
      return outputSchema.parse(JSON.parse(response.text));
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      if (status !== undefined && !RETRYABLE_STATUS.has(status)) throw error;
      console.warn(
        `Evaluation with ${model} failed (${status ?? "bad output"}), trying next model`,
      );
    }
  }
  throw lastError;
}

// Tried in order. All are listed for this API key (checked with ai.models.list()).
// Lite first: much faster (~7s vs 40s+) and plenty for scoring a transcript.
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
];
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MODEL_TIMEOUT_MS = 60_000;
