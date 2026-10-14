import { NextResponse } from "next/server";
import { getKnowledgeDebugSummary } from "@/lib/rag/langchain-documents";

type KnowledgeDebugResponse = {
  knowledgeDir: string;
  matchedFiles: Array<{
    fileName: string;
    domain: string;
  }>;
  chunkCount: number;
};

type ErrorResponse = {
  error: string;
};

export async function GET(): Promise<
  NextResponse<KnowledgeDebugResponse | ErrorResponse>
> {
  try {
    const summary = await getKnowledgeDebugSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Knowledge debug API error:", error);

    return NextResponse.json(
      { error: "Failed to inspect knowledge documents" },
      { status: 500 },
    );
  }
}