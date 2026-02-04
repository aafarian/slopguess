/**
 * Repair missing images.
 *
 * Scans the database for rounds (and challenges / group challenges) whose
 * image_url points to a file that no longer exists on disk.  For each broken
 * reference it regenerates the image via the configured IMAGE_PROVIDER (must
 * be "openai" in production) using the original prompt, persists the new file,
 * and updates the database row.
 *
 * Usage (inside the server container):
 *   node dist/scripts/repairImages.js          # dry-run (report only)
 *   node dist/scripts/repairImages.js --run     # actually regenerate
 */

import * as fs from "fs";
import * as path from "path";
import { pool, closePool } from "../config/database";
import { env } from "../config/env";
import { createImageProvider } from "../services/imageGeneration";
import { persistImage, persistImageFromBase64 } from "../services/imageStorage";

const IMAGES_DIR = path.resolve(__dirname, "../../public/images");

/** Pause for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the filename from an image_url like "/images/abc.png". */
function urlToFilename(imageUrl: string): string {
  return imageUrl.split("/").pop() || "";
}

interface BrokenRow {
  table: string;
  id: string;
  prompt: string;
  image_url: string;
}

async function findBrokenImages(): Promise<BrokenRow[]> {
  const broken: BrokenRow[] = [];

  // Rounds
  const rounds = await pool.query<{ id: string; prompt: string; image_url: string }>(
    `SELECT id, prompt, image_url FROM rounds WHERE image_url IS NOT NULL`
  );
  for (const row of rounds.rows) {
    const file = path.join(IMAGES_DIR, urlToFilename(row.image_url));
    if (!fs.existsSync(file)) {
      broken.push({ table: "rounds", ...row });
    }
  }

  // Challenges
  const challenges = await pool.query<{ id: string; prompt: string; image_url: string }>(
    `SELECT id, prompt, image_url FROM challenges WHERE image_url IS NOT NULL`
  );
  for (const row of challenges.rows) {
    const file = path.join(IMAGES_DIR, urlToFilename(row.image_url));
    if (!fs.existsSync(file)) {
      broken.push({ table: "challenges", ...row });
    }
  }

  // Group challenges
  const gc = await pool.query<{ id: string; prompt: string; image_url: string }>(
    `SELECT id, prompt, image_url FROM group_challenges WHERE image_url IS NOT NULL`
  );
  for (const row of gc.rows) {
    const file = path.join(IMAGES_DIR, urlToFilename(row.image_url));
    if (!fs.existsSync(file)) {
      broken.push({ table: "group_challenges", ...row });
    }
  }

  return broken;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--run");

  console.log(`[repair] Scanning for broken image references...`);
  console.log(`[repair] Images directory: ${IMAGES_DIR}\n`);

  const broken = await findBrokenImages();

  if (broken.length === 0) {
    console.log("[repair] No broken images found. Everything looks good.");
    return;
  }

  console.log(`[repair] Found ${broken.length} broken image reference(s):\n`);
  for (const row of broken) {
    console.log(`  ${row.table}  ${row.id}  ${row.image_url}`);
    console.log(`    prompt: "${row.prompt.slice(0, 80)}${row.prompt.length > 80 ? "..." : ""}"`);
  }

  if (dryRun) {
    console.log(
      `\n[repair] Dry run — no changes made. Run with --run to regenerate images.`
    );
    console.log(
      `[repair] Estimated cost: ~$${(broken.length * 0.04).toFixed(2)}–$${(broken.length * 0.08).toFixed(2)} ` +
        `(${broken.length} DALL-E 3 image(s))`
    );
    return;
  }

  // Actual regeneration
  console.log(`\n[repair] Regenerating ${broken.length} image(s)...`);
  console.log(`[repair] Provider: ${env.IMAGE_PROVIDER}\n`);

  const imageProvider = createImageProvider(env.IMAGE_PROVIDER);
  let repaired = 0;
  let failed = 0;

  for (let i = 0; i < broken.length; i++) {
    const row = broken[i];
    const label = `[${i + 1}/${broken.length}]`;

    try {
      console.log(`${label} Generating image for ${row.table} ${row.id}...`);

      const result = await imageProvider.generate(row.prompt);
      let filename: string;
      if (result.imageBase64) {
        filename = await persistImageFromBase64(result.imageBase64);
      } else if (result.imageUrl) {
        filename = await persistImage(result.imageUrl);
      } else {
        throw new Error("Image generation returned no image data");
      }
      const newUrl = `/images/${filename}`;

      await pool.query(
        `UPDATE ${row.table} SET image_url = $1 WHERE id = $2`,
        [newUrl, row.id]
      );

      console.log(`${label} OK  ${newUrl}`);
      repaired++;

      // Rate-limit: DALL-E 3 allows ~7 req/min on Tier 1.
      // Wait 10s between requests to stay safe.
      if (i < broken.length - 1) {
        console.log(`${label} Waiting 10s (rate limit)...`);
        await sleep(10_000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label} FAILED  ${row.table} ${row.id}: ${msg}`);
      failed++;

      // On rate limit (429), wait longer before continuing
      if (msg.includes("rate limit")) {
        console.log(`${label} Rate limited — waiting 60s...`);
        await sleep(60_000);
      }
    }
  }

  console.log(`\n[repair] Done. Repaired: ${repaired}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error("[repair] Unhandled error:", err);
    process.exit(1);
  })
  .finally(() => closePool());
