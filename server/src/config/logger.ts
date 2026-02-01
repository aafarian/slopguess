/**
 * Lightweight structured logger.
 *
 * Provides log-level filtering and structured output:
 * - Production (NODE_ENV=production): JSON lines for machine consumption
 * - Development: Pretty-printed human-readable output
 *
 * Log levels (in order of severity): debug < info < warn < error
 * Set LOG_LEVEL env var to control minimum verbosity (default: "info").
 *
 * Usage:
 *   import { logger } from "../config/logger";
 *   logger.info("server", "Server started", { port: 3001 });
 *   logger.error("database", "Connection failed", { error: message });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Level hierarchy
// ---------------------------------------------------------------------------

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw in LEVEL_PRIORITY) {
    return raw as LogLevel;
  }
  return "info";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPretty(entry: LogEntry): string {
  const { timestamp: _ts, level, component, message, ...extra } = entry;
  const extraStr =
    Object.keys(extra).length > 0 ? " " + JSON.stringify(extra) : "";
  return `[${component}] ${level.toUpperCase()} ${message}${extraStr}`;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// ---------------------------------------------------------------------------
// Core log function
// ---------------------------------------------------------------------------

function log(
  level: LogLevel,
  component: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  const minLevel = getLogLevel();
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...extra,
  };

  const formatted = isProduction() ? formatJson(entry) : formatPretty(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const logger = {
  debug(component: string, message: string, extra?: Record<string, unknown>): void {
    log("debug", component, message, extra);
  },

  info(component: string, message: string, extra?: Record<string, unknown>): void {
    log("info", component, message, extra);
  },

  warn(component: string, message: string, extra?: Record<string, unknown>): void {
    log("warn", component, message, extra);
  },

  error(component: string, message: string, extra?: Record<string, unknown>): void {
    log("error", component, message, extra);
  },
};

export { logger };
export type { LogLevel, LogEntry };
