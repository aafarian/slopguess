import { Router, Request, Response } from "express";
import { testConnection } from "../config/database";

const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();

  const status = dbConnected ? "ok" : "degraded";
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbConnected ? "connected" : "disconnected",
    },
  });
});

export { healthRouter };
