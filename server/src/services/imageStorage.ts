/**
 * Image storage service.
 *
 * Downloads externally-hosted images (e.g. from OpenAI's temporary URLs)
 * to local disk so they persist beyond the provider's expiration window.
 *
 * In dev, images are saved to server/public/images/ and served via
 * express.static. In prod, the same local path can be swapped for a
 * cloud storage upload by changing this module.
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { logger } from "../config/logger";

/** Directory where downloaded images are stored. */
const IMAGES_DIR = path.resolve(__dirname, "../../public/images");

/**
 * Download an image from a URL and save it to local disk.
 *
 * @param externalUrl - The remote image URL to download
 * @returns The local filename (e.g. "abc123.png") suitable for building a serving URL
 */
export async function persistImage(externalUrl: string): Promise<string> {
  // Ensure the images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const filename = `${randomUUID()}.png`;
  const filepath = path.join(IMAGES_DIR, filename);

  const response = await fetch(externalUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download image: HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  logger.info("imageStorage", `Persisted image as ${filename}`, {
    filename,
    bytes: buffer.length,
  });

  return filename;
}
