import dotenv from "dotenv";

// Load environment variables before anything else
dotenv.config();

// Import env config (validates required vars immediately)
import { env } from "./config/env";
import { logger } from "./config/logger";
import { app } from "./app";
import { testConnection, closePool } from "./config/database";
import { scheduler } from "./services/scheduler";

async function start(): Promise<void> {
  // Test database connectivity before starting the server
  logger.info("server", "Testing database connection...");
  const dbConnected = await testConnection();

  if (dbConnected) {
    logger.info("server", "Database connection successful.");
  } else {
    logger.warn("server", "Database connection failed. Server will start but DB features will be unavailable.");
  }

  // Start the round scheduler (skip in test environment)
  if (env.NODE_ENV !== "test") {
    try {
      await scheduler.startScheduler();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("server", "Failed to start scheduler", { error: message });
      logger.warn("server", "Server will continue without automatic round rotation.");
    }
  }

  const server = app.listen(env.PORT, () => {
    logger.info("server", `Server is running on http://localhost:${env.PORT}`, {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
    });
    logger.info("server", `Health check: http://localhost:${env.PORT}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info("server", `${signal} received. Shutting down gracefully...`);
    scheduler.stopScheduler();
    server.close(async () => {
      await closePool();
      logger.info("server", "Server shut down.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  logger.error("server", "Failed to start", { error: err.message || String(err) });
  process.exit(1);
});
