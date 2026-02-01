import { Router } from "express";
import { healthRouter } from "./health";

const router = Router();

// Health check
router.use("/health", healthRouter);

export { router };
