export type DocumentChunk = {
  id: string;
  source: string;
  text: string;
  embedding?: number[];
};

export type CachedIndex = {
  version: number;
  sourceHash: string;
  chunks: DocumentChunk[];
};
