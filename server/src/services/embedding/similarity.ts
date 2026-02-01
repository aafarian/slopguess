/**
 * Cosine similarity utility for comparing embedding vectors.
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * producing a value between -1 (opposite) and 1 (identical direction).
 * For normalized embedding vectors, the range is typically [0, 1].
 *
 * Formula: cos(theta) = dot(a, b) / (||a|| * ||b||)
 */

/**
 * Compute the cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity value between -1 and 1
 * @throws Error if vectors have different dimensions
 * @throws Error if either vector is empty
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) {
    throw new Error("Cannot compute cosine similarity of empty vectors");
  }

  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: a has ${a.length} dimensions, b has ${b.length} dimensions`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  // Handle zero vectors: if either vector has zero magnitude, return 0
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
