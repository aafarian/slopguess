/**
 * Image storage service.
 *
 * Downloads externally-hosted images (e.g. from OpenAI's temporary URLs)
 * and persists them either to Cloudflare R2 (production) or local disk (dev).
 *
 * When R2 is configured (all R2_* env vars set), images are uploaded to R2
 * and the returned URL is the full public R2 URL.
 *
 * When R2 is not configured, images are saved locally and the returned
 * value is just the filename (caller builds the serving URL).
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../config/logger";
import { env, isR2Configured } from "../config/env";

/** Directory where downloaded images are stored (local fallback). */
const IMAGES_DIR = path.resolve(__dirname, "../../public/images");

/** Initialize R2 client if configured. */
const r2Client = isR2Configured()
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * Upload a buffer to R2.
 *
 * @param buffer - The image data
 * @param filename - The filename to use in R2
 * @returns The full public URL for the uploaded image
 */
async function uploadToR2(buffer: Buffer, filename: string): Promise<string> {
  await r2Client!.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: filename,
      Body: buffer,
      ContentType: "image/png",
    })
  );

  const url = `${env.R2_PUBLIC_URL}/${filename}`;
  logger.info("imageStorage", `Uploaded image to R2 as ${filename}`, {
    filename,
    bytes: buffer.length,
    url,
  });

  return url;
}

/**
 * Save a buffer to local disk.
 *
 * @param buffer - The image data
 * @param filename - The filename to use
 * @returns The local URL path (e.g. "/images/abc.png")
 */
function saveToLocal(buffer: Buffer, filename: string): string {
  // Ensure the images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const filepath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  const url = `/images/${filename}`;
  logger.info("imageStorage", `Persisted image locally as ${filename}`, {
    filename,
    bytes: buffer.length,
    url,
  });

  return url;
}

/**
 * Download an image from a URL and persist it.
 *
 * @param externalUrl - The remote image URL to download
 * @returns Ready-to-use URL (R2 public URL or local /images/ path)
 */
export async function persistImage(externalUrl: string): Promise<string> {
  const response = await fetch(externalUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download image: HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${randomUUID()}.png`;

  if (r2Client) {
    return uploadToR2(buffer, filename);
  } else {
    return saveToLocal(buffer, filename);
  }
}

/**
 * Save a base64-encoded image.
 *
 * @param base64Data - The base64-encoded image data (without data URI prefix)
 * @returns Ready-to-use URL (R2 public URL or local /images/ path)
 */
export async function persistImageFromBase64(
  base64Data: string
): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const filename = `${randomUUID()}.png`;

  if (r2Client) {
    return uploadToR2(buffer, filename);
  } else {
    return saveToLocal(buffer, filename);
  }
}
