import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag/retrieve";

type ChatRequestBody = {
  message?: string;
};

type ChatResponseBody = {
  message: string;
};

type ErrorResponseBody = {
  error: string;
};

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenerativeAI(apiKey);
}

async function generateAnswer(
  query: string,
  contextChunks: string[],
): Promise<string> {
  const client = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const contextText = contextChunks.join("\n\n---\n\n");

  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: `You are an Indian Legal Information Assistant.

Your role is to provide general legal information based only on the retrieved context below.

Rules:
- Answer clearly and in plain language.
- Prefer facts from the retrieved context.
- Mention relevant helpline numbers when they appear in the context.
- If the context does not contain enough information, say so clearly.
- Do not claim to be a lawyer and do not provide personalized legal advice.
- Add a brief disclaimer that users should consult a qualified legal professional for specific cases.

Retrieved context:
${contextText}`,
  });

  const result = await model.generateContent(query);
  const text = result.response.text();

  return text.trim() || "No response generated.";
}

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
    const contextChunks = await retrieveContext(message);
    const answer = await generateAnswer(message, contextChunks);

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
