/**
 * Migrate existing local images to Cloudflare R2.
 *
 * Scans the database for image_url entries starting with "/images/" and
 * uploads each corresponding local file to R2, then updates the database
 * with the new R2 URL.
 *
 * Tables scanned:
 *   - rounds
 *   - challenges
 *   - group_challenges
 *   - print_orders
 *
 * Usage (inside the server container):
 *   npx tsx src/scripts/migrateImagesToR2.ts             # dry-run (report only)
 *   npx tsx src/scripts/migrateImagesToR2.ts --run       # actually migrate
 */

import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { pool, closePool } from "../config/database";
import { env, isR2Configured } from "../config/env";

const IMAGES_DIR = path.resolve(__dirname, "../../public/images");

/** Extract the filename from an image_url like "/images/abc.png". */
function urlToFilename(imageUrl: string): string {
  return imageUrl.split("/").pop() || "";
}

interface LocalImageRow {
  table: string;
  id: string;
  image_url: string;
}

/**
 * Find all rows with local image URLs (/images/...).
 */
async function findLocalImages(): Promise<LocalImageRow[]> {
  const localImages: LocalImageRow[] = [];

  // Tables with image_url columns
  const tables = ["rounds", "challenges", "group_challenges", "print_orders"];

  for (const table of tables) {
    const result = await pool.query<{ id: string; image_url: string }>(
      `SELECT id, image_url FROM ${table} WHERE image_url LIKE '/images/%'`
    );
    for (const row of result.rows) {
      localImages.push({ table, id: row.id, image_url: row.image_url });
    }
  }

  return localImages;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--run");

  console.log("[migrate-r2] Cloudflare R2 Image Migration\n");

  // Check R2 configuration
  if (!isR2Configured()) {
    console.error("[migrate-r2] ERROR: R2 is not configured.");
    console.error("[migrate-r2] Please set the following environment variables:");
    console.error("  - R2_ACCOUNT_ID");
    console.error("  - R2_ACCESS_KEY_ID");
    console.error("  - R2_SECRET_ACCESS_KEY");
    console.error("  - R2_BUCKET_NAME");
    console.error("  - R2_PUBLIC_URL");
    process.exit(1);
  }

  console.log(`[migrate-r2] R2 Bucket: ${env.R2_BUCKET_NAME}`);
  console.log(`[migrate-r2] R2 Public URL: ${env.R2_PUBLIC_URL}`);
  console.log(`[migrate-r2] Local images dir: ${IMAGES_DIR}\n`);

  // Initialize R2 client
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  // Find all local image references
  console.log("[migrate-r2] Scanning database for local image URLs...\n");
  const localImages = await findLocalImages();

  if (localImages.length === 0) {
    console.log("[migrate-r2] No local images found. Nothing to migrate.");
    return;
  }

  console.log(`[migrate-r2] Found ${localImages.length} local image reference(s):\n`);

  // Group by table for summary
  const byTable: Record<string, number> = {};
  for (const row of localImages) {
    byTable[row.table] = (byTable[row.table] || 0) + 1;
  }
  for (const [table, count] of Object.entries(byTable)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log();

  if (dryRun) {
    console.log("[migrate-r2] Dry run - no changes made.");
    console.log("[migrate-r2] Run with --run to perform the migration.");
    return;
  }

  // Perform migration
  console.log("[migrate-r2] Starting migration...\n");

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < localImages.length; i++) {
    const row = localImages[i];
    const label = `[${i + 1}/${localImages.length}]`;
    const filename = urlToFilename(row.image_url);
    const localPath = path.join(IMAGES_DIR, filename);

    // Check if local file exists
    if (!fs.existsSync(localPath)) {
      console.log(`${label} SKIP  ${row.table}/${row.id} - local file not found: ${filename}`);
      skipped++;
      continue;
    }

    try {
      // Check if already exists in R2
      let existsInR2 = false;
      try {
        await r2Client.send(
          new HeadObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: filename,
          })
        );
        existsInR2 = true;
      } catch {
        // Object doesn't exist, we'll upload it
      }

      if (!existsInR2) {
        // Upload to R2
        const buffer = fs.readFileSync(localPath);
        await r2Client.send(
          new PutObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: filename,
            Body: buffer,
            ContentType: "image/png",
          })
        );
        console.log(`${label} UPLOAD ${filename} (${buffer.length} bytes)`);
      } else {
        console.log(`${label} EXISTS ${filename} (already in R2)`);
      }

      // Update database with R2 URL
      const r2Url = `${env.R2_PUBLIC_URL}/${filename}`;
      await pool.query(`UPDATE ${row.table} SET image_url = $1 WHERE id = $2`, [
        r2Url,
        row.id,
      ]);
      console.log(`${label} UPDATE ${row.table}/${row.id} -> ${r2Url}`);

      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label} FAILED ${row.table}/${row.id}: ${msg}`);
      failed++;
    }
  }

  console.log("\n[migrate-r2] Migration complete.");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (file not found): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  if (migrated > 0 && failed === 0) {
    console.log(
      "\n[migrate-r2] All images migrated successfully!"
    );
    console.log(
      "[migrate-r2] You can safely remove the uploaded-images volume after verifying."
    );
  }
}

main()
  .catch((err) => {
    console.error("[migrate-r2] Unhandled error:", err);
    process.exit(1);
  })
  .finally(() => closePool());
