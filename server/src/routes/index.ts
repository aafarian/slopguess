import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";

const router = Router();

// Health check
router.use("/health", healthRouter);

// Authentication
router.use("/auth", authRouter);

export { router };
