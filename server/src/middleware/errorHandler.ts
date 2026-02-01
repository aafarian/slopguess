import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { monitoringService } from "../services/monitoringService";

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;
  const requestId = (req as unknown as Record<string, unknown>).requestId as string | undefined;

  // Track error metrics for monitoring
  monitoringService.recordError();

  // Log the error with request context
  if (statusCode === 500) {
    logger.error("server", "Unhandled error", {
      requestId,
      statusCode,
      error: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  } else {
    logger.warn("server", `${statusCode} - ${err.message}`, {
      requestId,
      statusCode,
      code: err.code,
    });
  }

  res.status(statusCode).json({
    error: {
      message,
      code: err.code || "INTERNAL_ERROR",
      requestId,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
      }),
    },
  });
}

export { errorHandler };
export type { AppError };
