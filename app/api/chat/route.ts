import { NextRequest, NextResponse } from "next/server";
import { answerLegalQuestion } from "@/lib/rag/legal-graph";

type ChatRequestBody = {
  message?: string;
};

type ChatResponseBody = { message: string };

type ErrorResponseBody = {
  error: string;
};

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ChatResponseBody | ErrorResponseBody>> {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    const answer = await answerLegalQuestion(message);

    return NextResponse.json({ message: answer });
  } catch (error) {
    console.error("Chat API error:", error);

    if (
      error instanceof Error &&
      error.message === "GEMINI_API_KEY is not configured"
    ) {
      return NextResponse.json(
        { error: "Gemini API key is not configured on the server" },
        { status: 503 },
      );
    }

    if (
      error instanceof Error &&
      error.message === "No supported legal PDF files found in the knowledge folder"
    ) {
      return NextResponse.json(
        {
          error:
            "No supported legal PDFs were found. Add Property, Consumer, or Employment law PDFs to the knowledge folder.",
        },
        { status: 503 },
      );
    }

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "Gemini quota exceeded for this model. Wait about a minute and try again, or set GEMINI_MODEL=gemini-2.5-flash in .env.local.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}
