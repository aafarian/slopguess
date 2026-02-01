/**
 * Simple SQL migration runner for SlopGuesser.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 * Migrations are .sql files in the migrations/ directory, named with a numeric
 * prefix (e.g., 001_initial_schema.sql). Files ending in .down.sql are ignored
 * during forward migration and used only for rollback.
 *
 * Usage:
 *   npx tsx src/db/migrate.ts          # Run all pending UP migrations
 *   npx tsx src/db/migrate.ts down     # Rollback the most recent migration
 *   npx tsx src/db/migrate.ts status   # Show applied migrations
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

// Load environment variables before importing database config
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { pool, closePool } from "../config/database";

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

// --------------------------------------------------------------------------
// Schema migrations tracking table
// --------------------------------------------------------------------------

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL       PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await pool.query(
    "SELECT filename FROM schema_migrations ORDER BY id ASC"
  );
  return result.rows.map((row: { filename: string }) => row.filename);
}

// --------------------------------------------------------------------------
// Discover migration files
// --------------------------------------------------------------------------

function getUpMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

function getDownFile(upFile: string): string {
  // 001_initial_schema.sql -> 001_initial_schema.down.sql
  return upFile.replace(/\.sql$/, ".down.sql");
}

// --------------------------------------------------------------------------
// Migration commands
// --------------------------------------------------------------------------

async function migrateUp(): Promise<void> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const allFiles = getUpMigrationFiles();
  const pending = allFiles.filter((f) => !applied.includes(f));

  if (pending.length === 0) {
    console.log("[migrate] All migrations are up to date.");
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s) to apply.\n`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`[migrate] Applying: ${file} ...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`[migrate] Applied:  ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[migrate] FAILED:   ${file}`);
      console.error(`[migrate] Error:    ${message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`\n[migrate] All migrations applied successfully.`);
}

async function migrateDown(): Promise<void> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();

  if (applied.length === 0) {
    console.log("[migrate] No migrations to rollback.");
    return;
  }

  const lastApplied = applied[applied.length - 1];
  const downFile = getDownFile(lastApplied);
  const downPath = path.join(MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    console.error(`[migrate] Down migration not found: ${downFile}`);
    console.error("[migrate] Cannot rollback without a .down.sql file.");
    process.exit(1);
  }

  const sql = fs.readFileSync(downPath, "utf-8");

  console.log(`[migrate] Rolling back: ${lastApplied} ...`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "DELETE FROM schema_migrations WHERE filename = $1",
      [lastApplied]
    );
    await client.query("COMMIT");
    console.log(`[migrate] Rolled back: ${lastApplied}`);
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[migrate] Rollback FAILED: ${lastApplied}`);
    console.error(`[migrate] Error: ${message}`);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function migrateStatus(): Promise<void> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const allFiles = getUpMigrationFiles();

  console.log("[migrate] Migration status:\n");

  for (const file of allFiles) {
    const status = applied.includes(file) ? "APPLIED" : "PENDING";
    console.log(`  [${status}]  ${file}`);
  }

  if (allFiles.length === 0) {
    console.log("  (no migration files found)");
  }

  console.log();
}

// --------------------------------------------------------------------------
// CLI entry point
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const command = process.argv[2] || "up";

  try {
    switch (command) {
      case "up":
        await migrateUp();
        break;
      case "down":
        await migrateDown();
        break;
      case "status":
        await migrateStatus();
        break;
      default:
        console.error(`[migrate] Unknown command: ${command}`);
        console.error("[migrate] Usage: migrate [up|down|status]");
        process.exit(1);
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error("[migrate] Unhandled error:", err);
  process.exit(1);
});
