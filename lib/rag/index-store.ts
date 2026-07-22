import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { TaskType } from "@google/generative-ai";
import { loadAllChunks } from "./documents";
import { embedText } from "./embeddings";
import type { CachedIndex, DocumentChunk } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".rag-cache");
const CACHE_FILE = path.join(CACHE_DIR, "index.json");
const CACHE_VERSION = 2;

function computeSourceHash(
  chunks: Omit<DocumentChunk, "embedding">[],
): string {
  const payload = chunks.map((chunk) => `${chunk.id}:${chunk.text}`).join("\n");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function loadCache(): Promise<CachedIndex | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CachedIndex;
  } catch {
    return null;
  }
}

async function saveCache(index: CachedIndex): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(index));
}

async function buildIndex(): Promise<DocumentChunk[]> {
  const rawChunks = await loadAllChunks();
  const sourceHash = computeSourceHash(rawChunks);
  const cached = await loadCache();

  if (cached?.version === CACHE_VERSION && cached.sourceHash === sourceHash) {
    return cached.chunks;
  }

  const chunks: DocumentChunk[] = [];

  for (const chunk of rawChunks) {
    const embedding = await embedText(chunk.text, TaskType.RETRIEVAL_DOCUMENT);
    chunks.push({ ...chunk, embedding });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await saveCache({
    version: CACHE_VERSION,
    sourceHash,
    chunks,
  });

  return chunks;
}

let indexPromise: Promise<DocumentChunk[]> | null = null;

export function getIndexedChunks(): Promise<DocumentChunk[]> {
  if (!indexPromise) {
    indexPromise = buildIndex();
  }

  return indexPromise;
}
