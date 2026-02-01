/**
 * Word bank routes (admin/utility).
 *
 * GET /api/words          — list all words (paginated)
 * GET /api/words/categories — list all categories with counts
 * GET /api/words/random    — get random words (for testing/demo)
 */

import { Router, Request, Response } from "express";
import { wordBankService } from "../services/wordBankService";

const wordBankRouter = Router();

/**
 * GET /api/words
 * List all words with pagination.
 * Query params: ?page=1&limit=50
 */
wordBankRouter.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));

  const result = await wordBankService.getAllWords(page, limit);

  res.json({
    words: result.words,
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /api/words/categories
 * List all categories with word counts.
 */
wordBankRouter.get("/categories", async (_req: Request, res: Response) => {
  const categories = await wordBankService.getCategories();
  res.json({ categories });
});

/**
 * GET /api/words/random
 * Get a random selection of words (for testing/demo).
 * Query params: ?count=5
 */
wordBankRouter.get("/random", async (req: Request, res: Response) => {
  const count = Math.min(20, Math.max(1, parseInt(req.query.count as string, 10) || 5));
  const words = await wordBankService.getRandomSubset(count);

  // Also show what prompt would be assembled
  const prompt = wordBankService.assemblePromptFromEntries(words);

  res.json({
    words,
    prompt,
    count: words.length,
  });
});

export { wordBankRouter };
