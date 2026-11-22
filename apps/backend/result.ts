import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const outputSchema = z.object({
  feedback: z.string().describe("Feedback for the user"),
  score: z
    .int()
    .describe("score for the user out of 10 for the user interview"),
});

export async function calculateScore(
  messages: { type: "Assistant" | "User"; message: string; createdAt: Date }[],
) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const RESULT_PROMPT = `
    You are an expert evaluator. Your job is to evaluate the users interview. Give them a score out of 10 and also let them know any feedback you have about their interview.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: RESULT_PROMPT,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(outputSchema), // JSON Schema from Zod
    },
  });

  console.log(response.text);
  const result = outputSchema.parse(JSON.parse(response.text!));
  return result;
}
