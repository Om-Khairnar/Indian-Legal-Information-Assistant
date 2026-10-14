import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  detectSupportedDomain,
  type SupportedDomain,
} from "./domain-config";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const PDF_WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);

PDFParse.setWorker(pathToFileURL(PDF_WORKER_PATH).href);

type LegalDocumentMetadata = {
  source: string;
  domain: SupportedDomain;
};

export type LoadedPdfFile = {
  fileName: string;
  domain: SupportedDomain;
  buffer: Buffer;
};

async function loadSupportedPdfFiles(): Promise<LoadedPdfFile[]> {
  const entries = await fs.readdir(KNOWLEDGE_DIR);

  const pdfFiles = entries
    .filter((fileName) => fileName.toLowerCase().endsWith(".pdf"))
    .map((fileName) => ({
      fileName,
      domain: detectSupportedDomain(fileName),
    }))
    .filter(
      (
        entry,
      ): entry is {
        fileName: string;
        domain: SupportedDomain;
      } => entry.domain !== null,
    )
    .sort((left, right) => left.fileName.localeCompare(right.fileName));

  return Promise.all(
    pdfFiles.map(async ({ fileName, domain }) => ({
      fileName,
      domain,
      buffer: await fs.readFile(path.join(KNOWLEDGE_DIR, fileName)),
    })),
  );
}

export async function getKnowledgeDebugSummary(): Promise<{
  knowledgeDir: string;
  matchedFiles: Array<{ fileName: string; domain: SupportedDomain }>;
  chunkCount: number;
}> {
  const files = await loadSupportedPdfFiles();
  const documents = await loadLangChainDocuments();

  return {
    knowledgeDir: KNOWLEDGE_DIR,
    matchedFiles: files.map(({ fileName, domain }) => ({ fileName, domain })),
    chunkCount: documents.length,
  };
}

export async function loadLangChainDocuments(): Promise<
  Document<LegalDocumentMetadata>[]
> {
  const files = await loadSupportedPdfFiles();

  if (files.length === 0) {
    throw new Error(
      "No supported legal PDF files found in the knowledge folder",
    );
  }

  const baseDocuments = await Promise.all(
    files.map(async ({ fileName, domain, buffer }) => {
      const parser = new PDFParse({ data: buffer });

      try {
        const parsed = await parser.getText();

        return new Document<LegalDocumentMetadata>({
          pageContent: parsed.text,
          metadata: {
            source: fileName,
            domain,
          },
          id: fileName,
        });
      } finally {
        await parser.destroy();
      }
    }),
  );

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 200,
  });

  const splitDocuments = await splitter.splitDocuments(baseDocuments);

  return splitDocuments.map(
    (document) =>
      new Document<LegalDocumentMetadata>({
        pageContent: document.pageContent,
        metadata: {
          source: String(document.metadata.source),
          domain: document.metadata.domain as SupportedDomain,
        },
        id: document.id,
      }),
  );
}