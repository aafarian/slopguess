/**
 * PostgreSQL database connection pool.
 * Uses the `pg` library to create a connection pool configured from DATABASE_URL.
 * Other modules should import `pool` to execute queries.
 */

import { Pool } from "pg";
import { env } from "./env";

/**
 * PostgreSQL connection pool with sensible defaults.
 * - max: 20 connections (suitable for a small-to-medium app)
 * - idleTimeoutMillis: 30 seconds (release idle clients promptly)
 * - connectionTimeoutMillis: 5 seconds (fail fast if DB is unreachable)
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Log pool-level errors (e.g., unexpected disconnects)
pool.on("error", (err) => {
  console.error("[database] Unexpected error on idle client:", err.message);
});

/**
 * Test the database connection by executing a simple query.
 * Returns true if the connection succeeds, false otherwise.
 */
async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[database] Connection test failed:", message);
    return false;
  }
}

/**
 * Gracefully shut down the pool, closing all connections.
 * Call this during server shutdown.
 */
async function closePool(): Promise<void> {
  console.log("[database] Closing connection pool...");
  await pool.end();
  console.log("[database] Connection pool closed.");
}

export { pool, testConnection, closePool };
