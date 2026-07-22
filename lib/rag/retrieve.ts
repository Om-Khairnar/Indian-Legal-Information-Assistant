import { TaskType } from "@google/generative-ai";
import { embedText } from "./embeddings";
import { getIndexedChunks } from "./index-store";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function keywordScore(query: string, text: string): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2);

  const textLower = text.toLowerCase();

  return queryTerms.reduce(
    (score, term) => score + (textLower.includes(term) ? 1 : 0),
    0,
  );
}

export async function retrieveContext(
  query: string,
  topK = 4,
): Promise<string[]> {
  const chunks = await getIndexedChunks();

  try {
    const queryEmbedding = await embedText(query, TaskType.RETRIEVAL_QUERY);

    const scored = chunks
      .filter((chunk) => chunk.embedding?.length)
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding!),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    if (scored.length > 0) {
      return scored.map((item) => item.chunk.text);
    }
  } catch (error) {
    console.warn(
      "Embedding retrieval failed, falling back to keyword search:",
      error,
    );
  }

  const keywordMatches = chunks
    .map((chunk) => ({
      chunk,
      score: keywordScore(query, chunk.text),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  if (keywordMatches.length > 0) {
    return keywordMatches.map((item) => item.chunk.text);
  }

  return chunks.slice(0, topK).map((chunk) => chunk.text);
}
