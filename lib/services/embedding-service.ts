/**
 * Embedding Service
 * Generates embeddings using OpenAI text-embedding-3-small
 *
 * Original: api/app/services/case_intelligence/embedding_service.py
 */

import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { traceEmbedding } from '../observability/langsmith-tracer';

export class EmbeddingService {
  private model: string;

  constructor(model: string = 'text-embedding-3-small') {
    this.model = model;
  }

  /**
   * Generate embedding vector for text
   *
   * Returns: 1536-dimensional vector for text-embedding-3-small
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const execute = async () => {
      const { embedding } = await embed({
        model: openai.embedding(this.model),
        value: text,
      });

      return embedding;
    };

    return traceEmbedding<number[]>(
      {
        model: this.model,
        input: text.length > 500 ? `${text.slice(0, 500)}…` : text,
        metadata: {
          textLength: text.length,
        },
        summary: (embedding) => ({
          dimensions: embedding.length,
          sample: embedding.slice(0, 8),
        }),
      },
      execute,
    );
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
    const model = process.env.CASE_EMBEDDING_MODEL || 'text-embedding-3-small';
    embeddingService = new EmbeddingService(model);
  }
  return embeddingService;
}
