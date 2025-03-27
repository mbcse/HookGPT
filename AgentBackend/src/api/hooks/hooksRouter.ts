import express, { type Router } from "express";
import { z } from "zod";

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { HooksResponseSchema } from "@/api/hooks/hooksModel";
import { validateRequest } from "@/common/utils/httpHandlers";
import { hooksController } from "./hooksController";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const hooksRegistry = new OpenAPIRegistry();
export const hooksRouter: Router = express.Router();

// Register schemas
hooksRegistry.register("Hooks", HooksResponseSchema);

// Chat endpoint
hooksRegistry.registerPath({
  method: "post",
  path: "/hooks/chat",
  tags: ["Hooks"],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sessionId: z.string(),
            messages: z.array(z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string()
            }))
          })
        }
      }
    }
  },
  responses: createApiResponse(HooksResponseSchema, "Success"),
});

// Initialize session endpoint
hooksRegistry.registerPath({
  method: "post",
  path: "/hooks/init-session",
  tags: ["Hooks"],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            initialMessage: z.string().optional()
          })
        }
      }
    }
  },
  responses: createApiResponse(z.object({
    sessionId: z.string(),
    message: z.string()
  }), "Success"),
});

// Generate reply endpoint
hooksRegistry.registerPath({
  method: "post",
  path: "/hooks/generate-reply",
  tags: ["Hooks"],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sessionId: z.string(),
            messages: z.array(z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string()
            }))
          })
        }
      }
    }
  },
  responses: createApiResponse(HooksResponseSchema, "Success"),
});

// Generate hook code endpoint
hooksRegistry.registerPath({
  method: "post",
  path: "/hooks/generate-hook-code",
  tags: ["Hooks"],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sessionId: z.string(),
            messages: z.array(z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string()
            }))
          })
        }
      }
    }
  },
  responses: createApiResponse(HooksResponseSchema, "Success"),
});

// Register routes
hooksRouter.post("/chat", hooksController.chat);
hooksRouter.post("/init-session", hooksController.initSession);
hooksRouter.post("/generate-reply", hooksController.generateReply);
hooksRouter.post("/generate-hook-code", hooksController.generateHookCode); 