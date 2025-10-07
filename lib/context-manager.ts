/**
 * Context Manager for tracking case-related conversations in Slack.
 * Maintains rolling window of messages per case for KB generation.
 */

export interface CaseMessage {
  user: string;
  text: string;
  timestamp: string;
  thread_ts?: string;
}

export interface CaseContext {
  caseNumber: string;
  threadTs: string;
  channelId: string;
  messages: CaseMessage[];
  detectedAt: Date;
  lastUpdated: Date;
  isResolved?: boolean;
  resolvedAt?: Date;
  _notified?: boolean; // Internal flag to prevent duplicate resolution notifications
}

export class ContextManager {
  private contexts: Map<string, CaseContext> = new Map();
  private maxMessagesPerCase: number;
  private maxAgeHours: number;

  constructor(maxMessagesPerCase: number = 20, maxAgeHours: number = 72) {
    this.maxMessagesPerCase = maxMessagesPerCase;
    this.maxAgeHours = maxAgeHours;
  }

  /**
   * Extract case numbers from message text using regex
   */
  extractCaseNumbers(text: string): string[] {
    // Pattern: 3 uppercase letters followed by 7 digits (e.g., SCS0048402)
    const pattern = /\b[A-Z]{3}\d{7}\b/g;
    const matches = text.match(pattern);
    return matches ? [...new Set(matches)] : []; // Remove duplicates
  }

  /**
   * Add or update context for a case
   */
  addMessage(
    caseNumber: string,
    channelId: string,
    threadTs: string,
    message: CaseMessage
  ): void {
    const contextKey = this.getContextKey(caseNumber, threadTs);
    let context = this.contexts.get(contextKey);

    if (!context) {
      // Create new context
      context = {
        caseNumber,
        threadTs,
        channelId,
        messages: [],
        detectedAt: new Date(),
        lastUpdated: new Date(),
      };
      this.contexts.set(contextKey, context);
    }

    // Add message to rolling window
    context.messages.push(message);
    context.lastUpdated = new Date();

    // Keep only last N messages
    if (context.messages.length > this.maxMessagesPerCase) {
      context.messages = context.messages.slice(-this.maxMessagesPerCase);
    }

    // Check for resolution keywords
    this.checkForResolution(context, message);
  }

  /**
   * Check if message contains resolution keywords
   */
  private checkForResolution(context: CaseContext, message: CaseMessage): void {
    if (context.isResolved) return;

    const resolutionKeywords = [
      /\b(fixed|resolved|closed|done|completed)\b/i,
      /\bit('s| is) working\b/i,
      /\bproblem solved\b/i,
      /\bissue resolved\b/i,
    ];

    const hasResolutionKeyword = resolutionKeywords.some((pattern) =>
      pattern.test(message.text)
    );

    if (hasResolutionKeyword) {
      context.isResolved = true;
      context.resolvedAt = new Date();
    }
  }

  /**
   * Get context for a specific case and thread
   */
  getContext(caseNumber: string, threadTs: string): CaseContext | undefined {
    return this.contexts.get(this.getContextKey(caseNumber, threadTs));
  }

  /**
   * Get all contexts for a case number (across threads)
   */
  getContextsForCase(caseNumber: string): CaseContext[] {
    return Array.from(this.contexts.values()).filter(
      (ctx) => ctx.caseNumber === caseNumber
    );
  }

  /**
   * Get all resolved contexts ready for KB generation
   */
  getResolvedContexts(): CaseContext[] {
    return Array.from(this.contexts.values()).filter(
      (ctx) => ctx.isResolved && ctx.messages.length >= 3 // Minimum conversation length
    );
  }

  /**
   * Mark context as processed (for KB generation)
   */
  markAsProcessed(caseNumber: string, threadTs: string): void {
    const key = this.getContextKey(caseNumber, threadTs);
    this.contexts.delete(key);
  }

  /**
   * Clean up old contexts
   */
  cleanupOldContexts(): number {
    const now = new Date();
    const cutoffTime = now.getTime() - this.maxAgeHours * 60 * 60 * 1000;
    let removed = 0;

    for (const [key, context] of this.contexts.entries()) {
      if (context.lastUpdated.getTime() < cutoffTime) {
        this.contexts.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get statistics about tracked contexts
   */
  getStats() {
    return {
      totalContexts: this.contexts.size,
      resolvedContexts: Array.from(this.contexts.values()).filter(
        (ctx) => ctx.isResolved
      ).length,
      oldestContext: this.getOldestContext(),
    };
  }

  /**
   * Generate unique key for case + thread combination
   */
  private getContextKey(caseNumber: string, threadTs: string): string {
    return `${caseNumber}:${threadTs}`;
  }

  /**
   * Get the oldest context being tracked
   */
  private getOldestContext(): Date | null {
    let oldest: Date | null = null;

    for (const context of this.contexts.values()) {
      if (!oldest || context.detectedAt < oldest) {
        oldest = context.detectedAt;
      }
    }

    return oldest;
  }

  /**
   * Get conversation summary for a case
   */
  getSummary(caseNumber: string, threadTs: string): string | null {
    const context = this.getContext(caseNumber, threadTs);
    if (!context || context.messages.length === 0) return null;

    return context.messages
      .map((msg) => `[${msg.timestamp}] ${msg.user}: ${msg.text}`)
      .join("\n");
  }
}

// Global singleton instance
let contextManager: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!contextManager) {
    contextManager = new ContextManager();
  }
  return contextManager;
}
