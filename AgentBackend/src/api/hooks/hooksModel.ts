import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

// Define the response schema for hooks
export const HooksResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  code: z.string(),
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type HooksResponse = z.infer<typeof HooksResponseSchema>; 