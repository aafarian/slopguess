import dotenv from "dotenv";

// Load environment variables before anything else
dotenv.config();

// Import env config (validates required vars immediately)
import { env } from "./config/env";
import { app } from "./app";
import { testConnection, closePool } from "./config/database";

async function start(): Promise<void> {
  // Test database connectivity before starting the server
  console.log("[server] Testing database connection...");
  const dbConnected = await testConnection();

  if (dbConnected) {
    console.log("[server] Database connection successful.");
  } else {
    console.warn(
      "[server] WARNING: Database connection failed. Server will start but DB features will be unavailable."
    );
  }

  const server = app.listen(env.PORT, () => {
    console.log(
      `[server] Server is running on http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
    console.log(
      `[server] Health check: http://localhost:${env.PORT}/api/health`
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      console.log("[server] Server shut down.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("[server] Failed to start:", err.message || err);
  process.exit(1);
});
