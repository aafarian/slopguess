import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { wordBankRouter } from "./wordBank";

const router = Router();

// Health check
router.use("/health", healthRouter);

// Authentication
router.use("/auth", authRouter);

// Word bank (admin/utility)
router.use("/words", wordBankRouter);

export { router };
