/**
 * Centralized environment configuration.
 * Validates required environment variables at startup and exports typed config.
 * Import this module early to fail fast on missing configuration.
 */

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
  };
}

// Validate and export config as a singleton
const env = loadEnvConfig();

export { env };
export type { EnvConfig };
