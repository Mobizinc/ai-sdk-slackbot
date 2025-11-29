// Request batching utility for supervisor operations
interface BatchedRequest {
  workflowId: string;
  reviewer: string;
  timestamp: number;
}

class SupervisorRequestBatcher {
  private batches = new Map<string, BatchedRequest[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_WINDOW_MS = 5000; // 5 seconds
  private readonly MAX_BATCH_SIZE = 10;

  async addRequest(workflowId: string, reviewer: string, processor: (requests: BatchedRequest[]) => Promise<void>): Promise<void> {
    const batchKey = `supervisor_approvals_${reviewer}`;

    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;
    batch.push({ workflowId, reviewer, timestamp: Date.now() });

    // Clear existing timer
    const existingTimer = this.batchTimers.get(batchKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // If batch is full, process immediately
    if (batch.length >= this.MAX_BATCH_SIZE) {
      await this.processBatch(batchKey, processor);
      return;
    }

    // Set new timer
    const timer = setTimeout(async () => {
      await this.processBatch(batchKey, processor);
    }, this.BATCH_WINDOW_MS);

    this.batchTimers.set(batchKey, timer);
  }

  private async processBatch(batchKey: string, processor: (requests: BatchedRequest[]) => Promise<void>): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Remove from pending
    this.batches.delete(batchKey);
    this.batchTimers.delete(batchKey);

    try {
      await processor(batch);
    } catch (error) {
      console.error(`[Supervisor Batcher] Failed to process batch ${batchKey}:`, error);
      // Re-queue failed requests individually
      for (const request of batch) {
        // Individual retry logic would go here
      }
    }
  }

  getPendingCount(): number {
    return Array.from(this.batches.values()).reduce((sum, batch) => sum + batch.length, 0);
  }
}

export const supervisorRequestBatcher = new SupervisorRequestBatcher();