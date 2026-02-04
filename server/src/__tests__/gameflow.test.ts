/**
 * Game Flow Integration Tests — Phase 2
 *
 * Tests covering the core game mechanics WITHOUT requiring a database:
 *
 *   1. Cosine similarity math (pure function)
 *   2. Mock embedding provider (determinism + similarity behavior)
 *   3. Mock image provider (determinism + URL validity)
 *   4. Provider factories (creation + error handling)
 *   5. Score normalization (similarity-to-score mapping)
 *   6. API route wiring via supertest (auth gates, 404s, route existence)
 *
 * All tests are fast, isolated, and require no database or external APIs.
 */

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";
import { closePool } from "../config/database";
import { cosineSimilarity } from "../services/embedding/similarity";
import { MockEmbeddingProvider } from "../services/embedding/mockProvider";
import { MockImageProvider } from "../services/imageGeneration/mockProvider";
import { createEmbeddingProvider } from "../services/embedding";
import { createImageProvider } from "../services/imageGeneration";
import { scoringService } from "../services/scoringService";

/**
 * Clean up the pg pool after all tests complete so the process can exit.
 */
afterAll(async () => {
  await closePool();
});

// ===========================================================================
// 1. Cosine Similarity Math Tests
// ===========================================================================

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
  });

  it("returns 1.0 for parallel vectors with different magnitudes", () => {
    const a = [1, 0, 0];
    const b = [5, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 10);
  });

  it("returns 0.0 for orthogonal vectors in 3D", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 10);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 10);
  });

  it("returns -1.0 for opposite vectors in higher dimensions", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
  });

  it("returns 0 for a zero vector (first argument)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for a zero vector (second argument)", () => {
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("returns 0 when both vectors are zero", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("throws for vectors of different dimensions", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      /dimension mismatch/i
    );
  });

  it("throws for empty vectors", () => {
    expect(() => cosineSimilarity([], [])).toThrow(/empty/i);
  });

  it("throws when first vector is empty", () => {
    expect(() => cosineSimilarity([], [1, 2])).toThrow(/empty/i);
  });

  it("computes correct similarity for known vectors", () => {
    // cos(45 degrees) = sqrt(2)/2 ≈ 0.7071
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT2 / 2, 5);
  });

  it("returns 1.0 for identical multi-dimensional unit vectors", () => {
    const v = [1, 1, 1, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
  });
});

// ===========================================================================
// 2. Mock Embedding Provider Tests
// ===========================================================================

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider();

  it("has the name 'mock'", () => {
    expect(provider.name).toBe("mock");
  });

  it("returns an embedding with the expected structure", async () => {
    const result = await provider.embed("test input");

    expect(result).toHaveProperty("embedding");
    expect(result).toHaveProperty("provider", "mock");
    expect(result).toHaveProperty("model", "mock-hash-v1");
    expect(result).toHaveProperty("dimensions", 128);
    expect(result.embedding).toHaveLength(128);
  });

  it("produces the same embedding for the same text (deterministic)", async () => {
    const result1 = await provider.embed("hello world");
    const result2 = await provider.embed("hello world");

    expect(result1.embedding).toEqual(result2.embedding);
  });

  it("produces different embeddings for different texts", async () => {
    const result1 = await provider.embed("sunshine and rainbows");
    const result2 = await provider.embed("darkness and gloom");

    expect(result1.embedding).not.toEqual(result2.embedding);
  });

  it("produces unit-length vectors (magnitude ≈ 1.0)", async () => {
    const result = await provider.embed("test normalization");
    const magnitude = Math.sqrt(
      result.embedding.reduce((sum, val) => sum + val * val, 0)
    );

    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it("similar texts (shared words) produce higher similarity than unrelated texts", async () => {
    const promptResult = await provider.embed("a big red dog");
    const similarResult = await provider.embed("a big red cat");
    const unrelatedResult = await provider.embed("quantum physics equation");

    const similarSim = cosineSimilarity(
      promptResult.embedding,
      similarResult.embedding
    );
    const unrelatedSim = cosineSimilarity(
      promptResult.embedding,
      unrelatedResult.embedding
    );

    expect(similarSim).toBeGreaterThan(unrelatedSim);
  });

  it("identical texts produce cosine similarity of 1.0", async () => {
    const result1 = await provider.embed("exact match text");
    const result2 = await provider.embed("exact match text");

    const similarity = cosineSimilarity(result1.embedding, result2.embedding);
    expect(similarity).toBeCloseTo(1.0, 10);
  });

  it("embedBatch returns results for all inputs", async () => {
    const texts = ["alpha", "beta", "gamma"];
    const results = await provider.embedBatch(texts);

    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.embedding).toHaveLength(128);
      expect(r.provider).toBe("mock");
    });
  });

  it("embedBatch results match individual embed results", async () => {
    const texts = ["first", "second"];
    const batchResults = await provider.embedBatch(texts);
    const individual0 = await provider.embed("first");
    const individual1 = await provider.embed("second");

    expect(batchResults[0].embedding).toEqual(individual0.embedding);
    expect(batchResults[1].embedding).toEqual(individual1.embedding);
  });
});

// ===========================================================================
// 3. Mock Image Provider Tests
// ===========================================================================

describe("MockImageProvider", () => {
  const provider = new MockImageProvider();

  it("has the name 'mock'", () => {
    expect(provider.name).toBe("mock");
  });

  it("returns a valid URL string", async () => {
    const result = await provider.generate("a sunset over the ocean");

    expect(typeof result.imageUrl).toBe("string");
    expect(result.imageUrl).toMatch(/^https?:\/\//);
    expect(result.imageUrl).toContain("picsum.photos");
  });

  it("returns the correct provider name", async () => {
    const result = await provider.generate("test prompt");

    expect(result.provider).toBe("mock");
  });

  it("includes metadata with the prompt", async () => {
    const prompt = "a painting of a mountain";
    const result = await provider.generate(prompt);

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.prompt).toBe(prompt);
  });

  it("same prompt produces same URL (deterministic)", async () => {
    const prompt = "a cat sitting on a fence";
    const result1 = await provider.generate(prompt);
    const result2 = await provider.generate(prompt);

    expect(result1.imageUrl).toBe(result2.imageUrl);
  });

  it("different prompts produce different URLs", async () => {
    const result1 = await provider.generate("a sunny beach");
    const result2 = await provider.generate("a snowy mountain");

    expect(result1.imageUrl).not.toBe(result2.imageUrl);
  });

  it("URL includes the seed derived from prompt", async () => {
    const result = await provider.generate("deterministic test");

    // URL pattern: https://picsum.photos/seed/{seed}/1024/1024
    expect(result.imageUrl).toMatch(
      /^https:\/\/picsum\.photos\/seed\/\d+\/1024\/1024$/
    );
  });
});

// ===========================================================================
// 4. Provider Factory Tests
// ===========================================================================

describe("createEmbeddingProvider factory", () => {
  it("returns MockEmbeddingProvider for 'mock'", () => {
    const provider = createEmbeddingProvider("mock");
    expect(provider.name).toBe("mock");
  });

  it("is case-insensitive", () => {
    const provider = createEmbeddingProvider("MOCK");
    expect(provider.name).toBe("mock");
  });

  it("throws for unknown provider name", () => {
    expect(() => createEmbeddingProvider("nonexistent")).toThrow(
      /unknown embedding provider/i
    );
  });
});

describe("createImageProvider factory", () => {
  it("returns MockImageProvider for 'mock'", () => {
    const provider = createImageProvider("mock");
    expect(provider.name).toBe("mock");
  });

  it("is case-insensitive", () => {
    const provider = createImageProvider("MOCK");
    expect(provider.name).toBe("mock");
  });

  it("throws for unknown provider name", () => {
    expect(() => createImageProvider("nonexistent")).toThrow(
      /unknown image provider/i
    );
  });
});

// ===========================================================================
// 5. Score Normalization Tests
// ===========================================================================

describe("scoringService.normalizeScore", () => {
  // normalizeScore maps [0.3, 1.0] -> [0, 100]
  // formula: clamp((raw - 0.3) / 0.7, 0, 1) * 100, rounded

  it("maps similarity 1.0 to score 100", () => {
    expect(scoringService.normalizeScore(1.0)).toBe(100);
  });

  it("maps similarity 0.3 to score 0", () => {
    expect(scoringService.normalizeScore(0.3)).toBe(0);
  });

  it("maps similarity 0.65 with power curve", () => {
    // linear = (0.65 - 0.3) / 0.7 = 0.5, curved = pow(0.5, 0.8) ≈ 0.574 -> 57
    expect(scoringService.normalizeScore(0.65)).toBe(57);
  });

  it("maps similarity below 0.3 to score 0 (clamped)", () => {
    expect(scoringService.normalizeScore(0.0)).toBe(0);
    expect(scoringService.normalizeScore(-0.5)).toBe(0);
    expect(scoringService.normalizeScore(-1.0)).toBe(0);
  });

  it("maps similarity above 1.0 to score 100 (clamped)", () => {
    // Shouldn't happen with valid cosine similarity, but test the clamp
    expect(scoringService.normalizeScore(1.5)).toBe(100);
  });

  it("maps similarity 0.65 with power curve exactly", () => {
    // linear = (0.65 - 0.3) / 0.7 = 0.5, curved = pow(0.5, 0.8) ≈ 0.574 -> 57
    expect(scoringService.normalizeScore(0.65)).toBe(57);
  });

  it("maps intermediate values correctly with power curve", () => {
    // linear = (0.44 - 0.3) / 0.7 = 0.2, curved = pow(0.2, 0.8) ≈ 0.277 -> 28
    expect(scoringService.normalizeScore(0.44)).toBe(28);

    // linear = (0.86 - 0.3) / 0.7 = 0.8, curved = pow(0.8, 0.8) ≈ 0.837 -> 84
    expect(scoringService.normalizeScore(0.86)).toBe(84);
  });

  it("returns an integer", () => {
    const score = scoringService.normalizeScore(0.55);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ===========================================================================
// 6. API Route Tests (supertest, no DB required)
// ===========================================================================

describe("API Routes — Round endpoints", () => {
  describe("GET /api/rounds/active", () => {
    it("returns 404 when no active round (DB unavailable returns 500 which is also acceptable)", async () => {
      const res = await request(app).get("/api/rounds/active");

      // Without a DB: 500 (DB error) or 404 (no active round) are both valid
      expect([404, 500]).toContain(res.status);
      expect(res.headers["content-type"]).toMatch(/json/);
    });

    it("route is wired and does not return 404 NOT_FOUND", async () => {
      const res = await request(app).get("/api/rounds/active");

      // The route exists — should never get the catch-all 404 with NOT_FOUND code
      if (res.status === 404) {
        expect(res.body.error.code).toBe("NO_ACTIVE_ROUND");
      }
    });
  });

  describe("POST /api/rounds/:id/guess", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app)
        .post("/api/rounds/00000000-0000-0000-0000-000000000000/guess")
        .send({ guess: "test guess" });

      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.code).toBe("AUTH_REQUIRED");
    });

    it("returns 401 with an invalid JWT token", async () => {
      const res = await request(app)
        .post("/api/rounds/00000000-0000-0000-0000-000000000000/guess")
        .set("Authorization", "Bearer invalid.jwt.token")
        .send({ guess: "test guess" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 401 with a malformed authorization header", async () => {
      const res = await request(app)
        .post("/api/rounds/00000000-0000-0000-0000-000000000000/guess")
        .set("Authorization", "NotBearer sometoken")
        .send({ guess: "test guess" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("GET /api/rounds/history", () => {
    it("route is wired and responds (may be 200 or 500 depending on DB)", async () => {
      const res = await request(app).get("/api/rounds/history");

      // Route exists — should not be the catch-all 404
      expect(res.status).not.toBe(404);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });

  describe("GET /api/rounds/:roundId", () => {
    it("route is wired and responds (may be 404 round-not-found or 500)", async () => {
      const res = await request(app).get(
        "/api/rounds/00000000-0000-0000-0000-000000000000"
      );

      // Either 404 (round not found) or 500 (DB error) — route exists
      expect([404, 500]).toContain(res.status);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });

  describe("GET /api/rounds/:roundId/leaderboard", () => {
    it("route is wired and responds", async () => {
      const res = await request(app).get(
        "/api/rounds/00000000-0000-0000-0000-000000000000/leaderboard"
      );

      expect([404, 500]).toContain(res.status);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });

  describe("GET /api/rounds/:roundId/results", () => {
    it("route is wired and responds", async () => {
      const res = await request(app).get(
        "/api/rounds/00000000-0000-0000-0000-000000000000/results"
      );

      expect([400, 404, 500]).toContain(res.status);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });
});

describe("API Routes — User endpoints", () => {
  describe("GET /api/users/me/history", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/users/me/history");

      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.code).toBe("AUTH_REQUIRED");
    });

    it("returns 401 with an invalid JWT", async () => {
      const res = await request(app)
        .get("/api/users/me/history")
        .set("Authorization", "Bearer bad.token.here");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });
  });

  describe("GET /api/users/me/stats", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/users/me/stats");

      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.code).toBe("AUTH_REQUIRED");
    });

    it("returns 401 with an invalid JWT", async () => {
      const res = await request(app)
        .get("/api/users/me/stats")
        .set("Authorization", "Bearer bad.token.here");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });
  });
});

describe("API Routes — Admin endpoints", () => {
  describe("POST /api/admin/rounds/rotate", () => {
    it("returns 401 without admin key", async () => {
      const res = await request(app).post("/api/admin/rounds/rotate");

      expect(res.headers["content-type"]).toMatch(/json/);
      // Without ADMIN_API_KEY configured, returns 403; without valid key, returns 401
      expect([401, 403]).toContain(res.status);
    });
  });

  describe("GET /api/admin/rounds/next", () => {
    it("returns 401 without admin key", async () => {
      const res = await request(app).get("/api/admin/rounds/next");

      expect(res.headers["content-type"]).toMatch(/json/);
      expect([401, 403]).toContain(res.status);
    });
  });
});
