import "express-async-errors"; // Must be imported before any route handlers
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import * as path from "path";
import { router as apiRouter } from "./routes/index";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { generalLimiter } from "./middleware/rateLimiter";
import { sanitizeBody } from "./middleware/sanitize";
import { env } from "./config/env";

const app = express();

// Trust proxy headers (X-Forwarded-For, etc.) when running behind nginx/load balancer.
// Required for accurate IP detection in rate limiting and request logging.
if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

// Security headers
app.use(helmet());

// CORS configuration - allow frontend dev server
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Serve persisted images (and any other static assets) from server/public/
app.use(express.static(path.join(__dirname, "../public")));

// Stripe webhook needs the raw body (Buffer) for signature verification.
// Mount express.raw() on the webhook path BEFORE the global JSON parser so
// the body is captured as a Buffer and express.json() skips it.
app.use("/api/subscriptions/webhook", express.raw({ type: "application/json" }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Input sanitization (trim, strip HTML, enforce field length limits)
app.use(sanitizeBody);

// Request logging
app.use(requestLogger);

// General rate limiting (100 req / 15 min per IP)
app.use(generalLimiter);

// API routes
app.use("/api", apiRouter);

// Catch-all 404 for any /api route that was not matched above
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: "Not found",
      code: "NOT_FOUND",
    },
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export { app };
