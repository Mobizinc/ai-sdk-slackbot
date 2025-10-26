/**
 * Embedding Service
 * Generates embeddings using OpenAI text-embedding-3-small
 *
 * Original: api/app/services/case_intelligence/embedding_service.py
 */

import OpenAI from "openai";
import { config } from "../config";

export class EmbeddingService {
  private model: string;
  private client: OpenAI;

  constructor(model: string = config.caseEmbeddingModel || "text-embedding-3-small") {
    this.model = model;
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured for embedding generation");
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding vector for text
   *
   * Returns: 1536-dimensional vector for text-embedding-3-small
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI embedding response missing data");
    }

    return embedding as number[];
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }
}

// Factory function
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    const model = config.caseEmbeddingModel || process.env.CASE_EMBEDDING_MODEL || "text-embedding-3-small";
    if (config.openaiApiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = config.openaiApiKey;
    }
    embeddingService = new EmbeddingService(model);
  }
  return embeddingService;
}
