import "express-async-errors"; // Must be imported before any route handlers
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { router as apiRouter } from "./routes/index";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

const app = express();

// Security headers
app.use(helmet());

// CORS configuration - allow frontend dev server
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

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
