import z from "zod";

export const preInterviewBody = z.object({
  // Optional: the candidate can send a GitHub profile, a resume, or both.
  githubUrl: z.string().optional(),
});
/// {"githubUrl":"https://github.com/AdityaSingh25"}
