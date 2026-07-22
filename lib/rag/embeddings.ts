import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

export async function embedText(
  text: string,
  taskType: TaskType,
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const modelName =
    process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  const model = client.getGenerativeModel({ model: modelName });

  const result = await model.embedContent({
    content: {
      role: "user",
      parts: [
        {
          text,
        },
      ],
    },
    taskType,
  });
  
  return result.embedding.values;
}
