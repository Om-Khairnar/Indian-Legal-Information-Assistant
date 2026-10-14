import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { inferSupportedDomain } from "./domain-config";
import { loadLangChainDocuments } from "./langchain-documents";

type IndexedChunk = {
  id: string;
  content: string;
  metadata: {
    source: string;
    domain: string;
  };
  embedding: number[];
};

type CachedIndex = {
  version: number;
  sourceHash: string;
  chunks: IndexedChunk[];
};

const CACHE_DIR = path.join(process.cwd(), ".rag-cache");
const CACHE_FILE = path.join(CACHE_DIR, "langchain-index.json");
const CACHE_VERSION = 1;

function getEmbeddingsClient(): GoogleGenerativeAIEmbeddings {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  });
}

function computeSourceHash(documents: Document[]): string {
  const payload = documents
    .map(
      (document) =>
        `${document.id ?? ""}:${document.metadata.source}:${document.pageContent}`,
    )
    .join("\n");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

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

async function loadCache(): Promise<CachedIndex | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CachedIndex;
  } catch {
    return null;
  }
}

async function saveCache(cache: CachedIndex): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
}

async function buildIndex(): Promise<IndexedChunk[]> {
  const documents = await loadLangChainDocuments();
  const sourceHash = computeSourceHash(documents);
  const cached = await loadCache();

  if (cached?.version === CACHE_VERSION && cached.sourceHash === sourceHash) {
    return cached.chunks;
  }

  const embeddings = getEmbeddingsClient();
  const vectors = await embeddings.embedDocuments(
    documents.map((document) => document.pageContent),
  );

  const chunks = documents.map((document, index) => ({
    id: document.id ?? `${document.metadata.source}:${index}`,
    content: document.pageContent,
    metadata: {
      source: String(document.metadata.source),
      domain: String(document.metadata.domain),
    },
    embedding: vectors[index],
  }));

  await saveCache({
    version: CACHE_VERSION,
    sourceHash,
    chunks,
  });

  return chunks;
}

let indexPromise: Promise<IndexedChunk[]> | null = null;

async function getIndex(): Promise<IndexedChunk[]> {
  if (!indexPromise) {
    indexPromise = buildIndex();
  }

  return indexPromise;
}

export async function retrieveRelevantDocuments(
  query: string,
  topK = 4,
): Promise<Document[]> {
  const [embeddings, chunks] = await Promise.all([getEmbeddingsClient(), getIndex()]);
  const queryEmbedding = await embeddings.embedQuery(query);
  const inferredDomain = inferSupportedDomain(query);
  const filteredChunks = inferredDomain
    ? chunks.filter((chunk) => chunk.metadata.domain === inferredDomain)
    : chunks;

  const candidateChunks = filteredChunks.length > 0 ? filteredChunks : chunks;

  return candidateChunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(
      ({ chunk }) =>
        new Document({
          id: chunk.id,
          pageContent: chunk.content,
          metadata: chunk.metadata,
        }),
    );
}