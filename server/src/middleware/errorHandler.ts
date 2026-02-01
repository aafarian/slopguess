import { Request, Response, NextFunction } from "express";

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;

  // Log the error (always log 500s, conditionally log others)
  if (statusCode === 500) {
    console.error("[server] Unhandled error:", err);
  } else {
    console.warn(`[server] ${statusCode} - ${err.message}`);
  }

  res.status(statusCode).json({
    error: {
      message,
      code: err.code || "INTERNAL_ERROR",
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
      }),
    },
  });
}

export { errorHandler };
export type { AppError };
