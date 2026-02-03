/**
 * Authentication routes.
 * POST /api/auth/register — create a new user account.
 * POST /api/auth/login    — authenticate and receive JWT.
 * GET  /api/auth/me       — return current user (requires auth).
 */

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import * as userService from "../services/userService";
import { toPublicUser } from "../models/user";
import { requireAuth } from "../middleware/auth";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiter";
import { subscriptionService } from "../services/subscriptionService";

const authRouter = Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Basic email regex — covers the vast majority of valid addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidationError {
  field: string;
  message: string;
}

function validateRegistrationInput(body: {
  username?: string;
  email?: string;
  password?: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  // Username: required, 3-20 chars, alphanumeric (plus underscores)
  if (!body.username || typeof body.username !== "string") {
    errors.push({ field: "username", message: "Username is required" });
  } else if (body.username.length < 3 || body.username.length > 20) {
    errors.push({
      field: "username",
      message: "Username must be between 3 and 20 characters",
    });
  }

  // Email: required, valid format
  if (!body.email || typeof body.email !== "string") {
    errors.push({ field: "email", message: "Email is required" });
  } else if (!EMAIL_RE.test(body.email)) {
    errors.push({ field: "email", message: "Invalid email format" });
  }

  // Password: required, 8+ chars
  if (!body.password || typeof body.password !== "string") {
    errors.push({ field: "password", message: "Password is required" });
  } else if (body.password.length < 8) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters",
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

function signToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, env.JWT_SECRET, { expiresIn: "7d" });
}

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

authRouter.post(
  "/register",
  registerLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validate input
      const errors = validateRegistrationInput(req.body);
      if (errors.length > 0) {
        res.status(400).json({
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: errors,
          },
        });
        return;
      }

      const { username, email, password } = req.body as {
        username: string;
        email: string;
        password: string;
      };

      // 2. Check for duplicate username
      const existingUsername = await userService.findByUsername(username);
      if (existingUsername) {
        res.status(409).json({
          error: {
            message: "Username is already taken",
            code: "DUPLICATE_USERNAME",
          },
        });
        return;
      }

      // 3. Check for duplicate email
      const existingEmail = await userService.findByEmail(email);
      if (existingEmail) {
        res.status(409).json({
          error: {
            message: "Email is already registered",
            code: "DUPLICATE_EMAIL",
          },
        });
        return;
      }

      // 4. Create user (password is hashed inside the service)
      const user = await userService.createUser(username, email, password);

      // 5. Create free subscription (best-effort — don't fail registration)
      try {
        await subscriptionService.createFreeSubscription(user.id);
      } catch {
        // Subscription creation is non-critical; user can still use the app
      }

      // 6. Generate JWT
      const token = signToken(user.id, user.username);

      // 7. Return 201 with user + token
      res.status(201).json({ user, token });
    } catch (err: unknown) {
      // Handle unique-constraint violations that slip through the race window
      const pgErr = err as { code?: string; detail?: string };
      if (err instanceof Error && pgErr.code === "23505") {
        const isDuplicateEmail = pgErr.detail?.includes("email");
        res.status(409).json({
          error: {
            message: isDuplicateEmail
              ? "Email is already registered"
              : "Username is already taken",
            code: isDuplicateEmail ? "DUPLICATE_EMAIL" : "DUPLICATE_USERNAME",
          },
        });
        return;
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

interface LoginInput {
  login?: string;
  password?: string;
}

function validateLoginInput(body: LoginInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.login || typeof body.login !== "string" || !body.login.trim()) {
    errors.push({ field: "login", message: "Email or username is required" });
  }

  if (!body.password || typeof body.password !== "string") {
    errors.push({ field: "password", message: "Password is required" });
  }

  return errors;
}

authRouter.post(
  "/login",
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validate input
      const errors = validateLoginInput(req.body);
      if (errors.length > 0) {
        res.status(400).json({
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: errors,
          },
        });
        return;
      }

      const { login, password } = req.body as {
        login: string;
        password: string;
      };

      // 2. Look up user by email or username
      const isEmail = EMAIL_RE.test(login);
      const user = isEmail
        ? await userService.findByEmail(login)
        : await userService.findByUsername(login);

      if (!user) {
        // Generic message — don't reveal whether the account exists
        res.status(401).json({
          error: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        });
        return;
      }

      // 3. Verify password
      const isValid = await userService.verifyPassword(
        password,
        user.password_hash
      );
      if (!isValid) {
        res.status(401).json({
          error: { message: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        });
        return;
      }

      // 4. Generate JWT
      const token = signToken(user.id, user.username);

      // 5. Return user (safe shape) + token
      res.status(200).json({ user: toPublicUser(user), token });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /me  (protected)
// ---------------------------------------------------------------------------

authRouter.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await userService.findById(userId);

      if (!user) {
        res.status(404).json({
          error: { message: "User not found", code: "USER_NOT_FOUND" },
        });
        return;
      }

      res.status(200).json({ user: toPublicUser(user) });
    } catch (err: unknown) {
      next(err);
    }
  }
);

export { authRouter };
