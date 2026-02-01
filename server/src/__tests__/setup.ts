/**
 * Test setup file for vitest.
 *
 * Sets environment variables BEFORE any application module is imported.
 * This prevents the env validation in config/env.ts from throwing
 * when DATABASE_URL or JWT_SECRET are not set in the shell environment.
 *
 * The DATABASE_URL here points to a dummy value; tests that need a real
 * database connection should be skipped or wrapped in a conditional.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/slopguesser_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-smoke-tests";
process.env.NODE_ENV = "test";
