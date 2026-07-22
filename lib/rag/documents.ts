import fs from "fs/promises";
import path from "path";
import type { DocumentChunk } from "./types";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

export async function loadKnowledgeDocuments(): Promise<
  { source: string; content: string }[]
> {
  const entries = await fs.readdir(KNOWLEDGE_DIR);
  const textFiles = entries.filter((file) => file.endsWith(".txt")).sort();

  return Promise.all(
    textFiles.map(async (file) => ({
      source: file,
      content: await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8"),
    })),
  );
}

export function chunkDocument(
  source: string,
  content: string,
): Omit<DocumentChunk, "embedding">[] {
  const sections = content
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((text, index) => ({
    id: `${source}:${index}`,
    source,
    text: `[Source: ${source}]\n${text}`,
  }));
}

export async function loadAllChunks(): Promise<
  Omit<DocumentChunk, "embedding">[]
> {
  const documents = await loadKnowledgeDocuments();
  return documents.flatMap((document) =>
    chunkDocument(document.source, document.content),
  );
}
