/**
 * Error Handler Utility
 * Provides contextual error messages and recovery guidance for Slack notifications
 */

export enum ErrorCategory {
  NETWORK = "network",
  TIMEOUT = "timeout",
  PERMISSION = "permission",
  VALIDATION = "validation",
  RATE_LIMIT = "rate_limit",
  SERVICE_NOW = "servicenow",
  SLACK_API = "slack_api",
  LLM = "llm",
  DATABASE = "database",
  UNKNOWN = "unknown",
}

export interface ErrorContext {
  operation: string; // What was being attempted (e.g., "KB generation", "Case classification")
  caseNumber?: string;
  userId?: string;
  details?: Record<string, any>;
}

export interface ErrorHandlerResult {
  category: ErrorCategory;
  userMessage: string;
  technicalMessage: string;
  recoverySteps: string[];
  retryable: boolean;
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * Error handler class for consistent error processing and user guidance
 */
export class ErrorHandler {
  /**
   * Process an error and return contextual guidance
   */
  static handle(error: unknown, context: ErrorContext): ErrorHandlerResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const category = this.categorizeError(error, errorMessage);

    const result: ErrorHandlerResult = {
      category,
      userMessage: this.getUserMessage(category, context, errorMessage),
      technicalMessage: this.getTechnicalMessage(error, context),
      recoverySteps: this.getRecoverySteps(category, context),
      retryable: this.isRetryable(category),
      severity: this.getSeverity(category, context),
    };

    // Log error for debugging
    this.logError(result, error, context);

    return result;
  }

  /**
   * Categorize error based on error object and message
   */
  private static categorizeError(error: unknown, message: string): ErrorCategory {
    // Timeout errors
    if (message.includes("timeout") || message.includes("timed out")) {
      return ErrorCategory.TIMEOUT;
    }

    // Network errors
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("ETIMEDOUT") ||
      message.includes("network") ||
      message.includes("fetch failed")
    ) {
      return ErrorCategory.NETWORK;
    }

    // Permission errors
    if (
      message.includes("permission") ||
      message.includes("forbidden") ||
      message.includes("unauthorized") ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return ErrorCategory.PERMISSION;
    }

    // Rate limit errors
    if (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    ) {
      return ErrorCategory.RATE_LIMIT;
    }

    // ServiceNow specific errors
    if (
      message.includes("ServiceNow") ||
      message.includes("SNOW") ||
      message.includes("case not found") ||
      message.includes("incident not found")
    ) {
      return ErrorCategory.SERVICE_NOW;
    }

    // Slack API errors
    if (
      message.includes("slack") ||
      message.includes("channel_not_found") ||
      message.includes("message_not_found") ||
      message.includes("invalid_auth")
    ) {
      return ErrorCategory.SLACK_API;
    }

    // LLM/AI errors
    if (
      message.includes("LLM") ||
      message.includes("OpenAI") ||
      message.includes("model") ||
      message.includes("generation failed") ||
      message.includes("completion")
    ) {
      return ErrorCategory.LLM;
    }

    // Database errors
    if (
      message.includes("database") ||
      message.includes("postgres") ||
      message.includes("SQL") ||
      message.includes("query failed")
    ) {
      return ErrorCategory.DATABASE;
    }

    // Validation errors
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("required") ||
      message.includes("missing")
    ) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Generate user-friendly error message
   */
  private static getUserMessage(
    category: ErrorCategory,
    context: ErrorContext,
    errorMessage: string
  ): string {
    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.TIMEOUT]: `⏱️ **Operation Timed Out**\n\nThe ${context.operation} took too long to complete. This usually happens when the AI service is under heavy load.`,

      [ErrorCategory.NETWORK]: `🌐 **Network Issue**\n\nCouldn't connect to the required service for ${context.operation}. This might be a temporary connectivity problem.`,

      [ErrorCategory.PERMISSION]: `🔒 **Permission Denied**\n\nThe system doesn't have permission to complete ${context.operation}. This might require administrator intervention.`,

      [ErrorCategory.RATE_LIMIT]: `🚦 **Rate Limit Reached**\n\nToo many requests in a short time. The ${context.operation} was blocked to prevent overload.`,

      [ErrorCategory.SERVICE_NOW]: `📋 **ServiceNow Error**\n\nCouldn't access ServiceNow data for ${context.operation}. ${context.caseNumber ? `Case ${context.caseNumber} might not exist or you may not have access.` : "The case might not exist or be accessible."}`,

      [ErrorCategory.SLACK_API]: `💬 **Slack Communication Error**\n\nCouldn't send or update the Slack message for ${context.operation}. The channel or thread might no longer be accessible.`,

      [ErrorCategory.LLM]: `🤖 **AI Service Error**\n\nThe AI service encountered an issue during ${context.operation}. This could be due to service capacity or an invalid request.`,

      [ErrorCategory.DATABASE]: `💾 **Database Error**\n\nCouldn't save or retrieve data for ${context.operation}. The database might be temporarily unavailable.`,

      [ErrorCategory.VALIDATION]: `⚠️ **Invalid Input**\n\nThe request for ${context.operation} contains invalid or missing information.`,

      [ErrorCategory.UNKNOWN]: `❌ **Unexpected Error**\n\nAn unexpected error occurred during ${context.operation}.`,
    };

    return messages[category];
  }

  /**
   * Generate technical error message for logging
   */
  private static getTechnicalMessage(error: unknown, context: ErrorContext): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    let message = `[${context.operation}] ${errorMessage}`;

    if (context.caseNumber) {
      message += ` | Case: ${context.caseNumber}`;
    }

    if (context.userId) {
      message += ` | User: ${context.userId}`;
    }

    if (stack) {
      message += `\n${stack}`;
    }

    return message;
  }

  /**
   * Generate recovery steps based on error category
   */
  private static getRecoverySteps(
    category: ErrorCategory,
    context: ErrorContext
  ): string[] {
    const steps: Record<ErrorCategory, string[]> = {
      [ErrorCategory.TIMEOUT]: [
        "Wait a few minutes and try again",
        "If the problem persists, the AI service might be experiencing high load",
        "Consider breaking down complex requests into smaller operations",
      ],

      [ErrorCategory.NETWORK]: [
        "Check your internet connection",
        "Retry the operation in a few moments",
        "If this persists, contact your system administrator",
      ],

      [ErrorCategory.PERMISSION]: [
        "Verify you have the necessary permissions",
        "Contact your administrator to check service account permissions",
        "Ensure API tokens and credentials are up to date",
      ],

      [ErrorCategory.RATE_LIMIT]: [
        "Wait 30-60 seconds before trying again",
        "Avoid making rapid repeated requests",
        "If urgent, contact your administrator about rate limit increases",
      ],

      [ErrorCategory.SERVICE_NOW]: [
        context.caseNumber
          ? `Verify case ${context.caseNumber} exists in ServiceNow`
          : "Verify the case exists in ServiceNow",
        "Check that you have read access to the case",
        "Ensure ServiceNow integration credentials are configured",
        "Try accessing the case directly in ServiceNow",
      ],

      [ErrorCategory.SLACK_API]: [
        "Verify the Slack channel/thread still exists",
        "Check that the bot has been added to the channel",
        "Ensure the bot has permission to post messages",
        "Try mentioning the bot again to refresh the connection",
      ],

      [ErrorCategory.LLM]: [
        "The AI service might be temporarily overloaded - try again in a moment",
        "If the request was complex, try simplifying it",
        "Check that your request doesn't violate content policies",
        "Contact support if this error persists",
      ],

      [ErrorCategory.DATABASE]: [
        "The database might be temporarily unavailable",
        "Try again in a few moments",
        "If this persists, contact your system administrator",
      ],

      [ErrorCategory.VALIDATION]: [
        "Check that all required information is provided",
        "Verify the format of case numbers, IDs, or other inputs",
        "Review the error message for specific validation issues",
      ],

      [ErrorCategory.UNKNOWN]: [
        "Try the operation again",
        "If the error persists, note the exact error message",
        "Contact support with details about what you were trying to do",
      ],
    };

    return steps[category];
  }

  /**
   * Determine if error is retryable
   */
  private static isRetryable(category: ErrorCategory): boolean {
    const retryable = new Set([
      ErrorCategory.TIMEOUT,
      ErrorCategory.NETWORK,
      ErrorCategory.RATE_LIMIT,
      ErrorCategory.LLM,
      ErrorCategory.DATABASE,
    ]);

    return retryable.has(category);
  }

  /**
   * Determine error severity
   */
  private static getSeverity(
    category: ErrorCategory,
    context: ErrorContext
  ): "low" | "medium" | "high" | "critical" {
    // Critical operations (system-level failures)
    if (category === ErrorCategory.DATABASE || category === ErrorCategory.PERMISSION) {
      return "critical";
    }

    // High severity (service failures)
    if (
      category === ErrorCategory.SERVICE_NOW ||
      category === ErrorCategory.SLACK_API
    ) {
      return "high";
    }

    // Medium severity (temporary issues)
    if (
      category === ErrorCategory.TIMEOUT ||
      category === ErrorCategory.RATE_LIMIT ||
      category === ErrorCategory.LLM
    ) {
      return "medium";
    }

    // Low severity (validation, network)
    return "low";
  }

  /**
   * Log error appropriately based on severity
   */
  private static logError(
    result: ErrorHandlerResult,
    error: unknown,
    context: ErrorContext
  ): void {
    const logPrefix = `[Error Handler] [${result.category}] [${result.severity}]`;

    if (result.severity === "critical") {
      console.error(logPrefix, result.technicalMessage);
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
    } else if (result.severity === "high") {
      console.error(logPrefix, result.technicalMessage);
    } else if (result.severity === "medium") {
      console.warn(logPrefix, result.technicalMessage);
    } else {
      console.log(logPrefix, result.technicalMessage);
    }
  }

  /**
   * Format error for Slack Block Kit display
   */
  static formatForSlack(result: ErrorHandlerResult): any[] {
    const blocks: any[] = [];

    // Error header
    const severityEmoji = {
      low: "ℹ️",
      medium: "⚠️",
      high: "🚨",
      critical: "🔴",
    }[result.severity];

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `${severityEmoji} Error`,
        emoji: true,
      },
    });

    // User-friendly message
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: result.userMessage,
      },
    });

    // Divider
    blocks.push({
      type: "divider",
    });

    // Recovery steps
    const recoveryText =
      "**What you can do:**\n" +
      result.recoverySteps.map((step, i) => `${i + 1}. ${step}`).join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: recoveryText,
      },
    });

    // Retryable indicator
    if (result.retryable) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🔄 _This operation can be retried_",
          },
        ],
      });
    }

    return blocks;
  }

  /**
   * Get simple error text (for non-Block Kit messages)
   */
  static getSimpleMessage(result: ErrorHandlerResult): string {
    let message = result.userMessage + "\n\n";
    message += "**What you can do:**\n";
    message += result.recoverySteps.map((step, i) => `${i + 1}. ${step}`).join("\n");

    if (result.retryable) {
      message += "\n\n🔄 _This operation can be retried_";
    }

    return message;
  }
}

/**
 * Convenience function for quick error handling
 */
export function handleError(
  error: unknown,
  operation: string,
  context?: Partial<ErrorContext>
): ErrorHandlerResult {
  return ErrorHandler.handle(error, {
    operation,
    ...context,
  });
}
