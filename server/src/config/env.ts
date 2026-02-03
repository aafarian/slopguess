/**
 * Centralized environment configuration.
 * Validates required environment variables at startup and exports typed config.
 * Import this module early to fail fast on missing configuration.
 */

import dotenv from "dotenv";
import * as path from "path";

// Auto-load .env from the server root directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

interface EnvConfig {
  /** PostgreSQL connection string */
  DATABASE_URL: string;
  /** Secret key for signing JWT tokens */
  JWT_SECRET: string;
  /** OpenAI API key for image generation */
  OPENAI_API_KEY: string;
  /** Image generation provider */
  IMAGE_PROVIDER: string;
  /** Embedding provider (default: mock) */
  EMBEDDING_PROVIDER: string;
  /** Server port (default: 3001) */
  PORT: number;
  /** Node environment (default: development) */
  NODE_ENV: string;
  /** CORS origin for frontend (default: http://localhost:5173) */
  CORS_ORIGIN: string;
  /** How long a round stays active, in hours (default: 1) */
  ROUND_DURATION_HOURS: number;
  /** How often the scheduler checks for round expiry, in minutes (default: 5) */
  ROUND_CHECK_INTERVAL_MINUTES: number;
  /** Minimum log level: debug, info, warn, error (default: info) */
  LOG_LEVEL: string;
  /** Whether to trust proxy headers (e.g. X-Forwarded-For) when behind nginx/load balancer (default: false) */
  TRUST_PROXY: boolean;
  /** Rate limit window duration in milliseconds (default: 900000 = 15 minutes) */
  RATE_LIMIT_WINDOW_MS: number;
  /** Maximum number of requests per window per IP (default: 300) */
  RATE_LIMIT_MAX: number;
  /** Default difficulty for new rounds (default: normal) */
  DEFAULT_DIFFICULTY: string;
  /** JSON mapping of difficulty names to word counts (default: {"easy":4,"normal":7,"hard":10}) */
  DIFFICULTY_WORD_COUNTS: Record<string, number>;
  /** Secret key for admin API access. If set, admin routes require X-Admin-Key header. */
  ADMIN_API_KEY: string;
  /** Stripe secret key for server-side API calls. Leave empty to disable Stripe in dev. */
  STRIPE_SECRET_KEY: string;
  /** Stripe publishable key for client-side usage. */
  STRIPE_PUBLISHABLE_KEY: string;
  /** Stripe webhook signing secret for verifying webhook events. */
  STRIPE_WEBHOOK_SECRET: string;
  /** Stripe Price ID for the Pro one-time purchase. */
  STRIPE_PRO_PRICE_ID: string;
  /** Whether monetization features (Stripe, ads, Pro tier) are enabled (default: false). */
  MONETIZATION_ENABLED: boolean;
}

/**
 * Required environment variables that must be set for the server to start.
 * Missing any of these will cause a clear error message at startup.
 */
const REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET"] as const;

/**
 * Validates that all required environment variables are present.
 * Throws a descriptive error listing all missing variables.
 */
function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName] || process.env[varName]!.trim() === "") {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    const message = [
      "",
      "=== Missing Required Environment Variables ===",
      "",
      ...missing.map((v) => `  - ${v}`),
      "",
      "Please set these variables in your .env file or environment.",
      "See .env.example for reference.",
      "",
    ].join("\n");

    throw new Error(message);
  }
}

/**
 * Load and validate environment configuration.
 * Call this after dotenv.config() has been invoked.
 */
function loadEnvConfig(): EnvConfig {
  validateEnv();

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER || "mock",
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || "mock",
    PORT: parseInt(process.env.PORT || "3001", 10),
    NODE_ENV: process.env.NODE_ENV || "development",
    CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
    ROUND_DURATION_HOURS: parseFloat(
      process.env.ROUND_DURATION_HOURS || "1"
    ),
    ROUND_CHECK_INTERVAL_MINUTES: parseFloat(
      process.env.ROUND_CHECK_INTERVAL_MINUTES || "5"
    ),
    LOG_LEVEL: (process.env.LOG_LEVEL || "info").toLowerCase(),
    TRUST_PROXY:
      process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1",
    RATE_LIMIT_WINDOW_MS: parseInt(
      process.env.RATE_LIMIT_WINDOW_MS || "900000",
      10
    ),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "300", 10),
    DEFAULT_DIFFICULTY: process.env.DEFAULT_DIFFICULTY || "normal",
    DIFFICULTY_WORD_COUNTS: JSON.parse(
      process.env.DIFFICULTY_WORD_COUNTS ||
        '{"easy":4,"normal":7,"hard":10}'
    ),
    ADMIN_API_KEY: process.env.ADMIN_API_KEY || "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
    STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || "",
    MONETIZATION_ENABLED:
      process.env.MONETIZATION_ENABLED === "true" ||
      process.env.MONETIZATION_ENABLED === "1",
  };
}

// Validate and export config as a singleton
const env = loadEnvConfig();

/**
 * Returns true when the Stripe secret key is configured,
 * indicating that Stripe payment features are available.
 */
function isStripeConfigured(): boolean {
  return env.STRIPE_SECRET_KEY.trim().length > 0;
}

export { env, isStripeConfigured };
export type { EnvConfig };
