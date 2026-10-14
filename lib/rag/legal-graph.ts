import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getSupportedDomainLabels } from "./domain-config";
import { retrieveRelevantDocuments } from "./langchain-retriever";

const LegalAnswerState = Annotation.Root({
  question: Annotation<string>,
  context: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
});

const answerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an Indian Legal Information Assistant.

You are limited to these domains: {supportedDomains}.
Use only the retrieved context provided below and do not substitute context from another domain.

Rules:
- Answer clearly and in plain language.
- Use only the retrieved context.
- If the context is insufficient, say that clearly.
- Do not claim to be a lawyer.
- Do not provide personalized legal advice.
- End with a brief disclaimer to consult a qualified legal professional for specific cases.

Retrieved context:
{context}`,
  ],
  ["human", "Question: {question}"],
]);

function getChatModel(): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    temperature: 0.2,
  });
}

const retrieveNode = async (state: typeof LegalAnswerState.State) => {
  const documents = await retrieveRelevantDocuments(state.question);

  return {
    context: documents.map(
      (document) =>
        `[Source: ${document.metadata.source}]\n${document.pageContent}`,
    ),
  };
};

const answerNode = async (state: typeof LegalAnswerState.State) => {
  const chain = answerPrompt.pipe(getChatModel()).pipe(new StringOutputParser());

  const answer = await chain.invoke({
    question: state.question,
    context: state.context.join("\n\n---\n\n"),
    supportedDomains: getSupportedDomainLabels().join(", "),
  });

  return {
    answer: answer.trim() || "No response generated.",
  };
};

const legalAnswerGraph = new StateGraph(LegalAnswerState)
  .addNode("retrieve", retrieveNode)
  .addNode("generateAnswer", answerNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generateAnswer")
  .addEdge("generateAnswer", END)
  .compile();

export async function answerLegalQuestion(question: string): Promise<string> {
  const result = await legalAnswerGraph.invoke({
    question,
    context: [],
    answer: "",
  });

  return result.answer;
}