import express from "express";

import { hooksController } from "@/api/hooks/hooksController";

export function registerHooksRoutes(router: express.Router): void {
  // Initialize a new session
  router.post("/hooks/init-session", hooksController.initSession);
  
  // Chat with the hooks agent
  router.post("/hooks/chat", hooksController.chat);
  
  // Generate a reply only
  router.post("/hooks/generate-reply", hooksController.generateReply);
  
  // Generate hook code only
  router.post("/hooks/generate-hook-code", hooksController.generateHookCode);
} 