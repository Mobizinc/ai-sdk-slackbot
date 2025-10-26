/**
 * ServiceNow Error Types
 *
 * Domain-specific error types for ServiceNow operations
 */

/**
 * Base error class for all ServiceNow-related errors
 */
export class ServiceNowError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "ServiceNowError";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceNowError);
    }
  }
}

/**
 * Error thrown when ServiceNow authentication fails
 */
export class ServiceNowAuthError extends ServiceNowError {
  constructor(message: string, cause?: Error) {
    super(message, 401, undefined, cause);
    this.name = "ServiceNowAuthError";
  }
}

/**
 * Error thrown when ServiceNow configuration is invalid or missing
 */
export class ServiceNowConfigError extends ServiceNowError {
  constructor(message: string, cause?: Error) {
    super(message, undefined, undefined, cause);
    this.name = "ServiceNowConfigError";
  }
}

/**
 * Error thrown when a ServiceNow resource is not found
 */
export class ServiceNowNotFoundError extends ServiceNowError {
  constructor(
    resource: string,
    identifier: string,
    endpoint?: string,
  ) {
    super(`${resource} not found: ${identifier}`, 404, endpoint);
    this.name = "ServiceNowNotFoundError";
  }
}

/**
 * Error thrown when ServiceNow request validation fails
 */
export class ServiceNowValidationError extends ServiceNowError {
  constructor(
    message: string,
    public validationErrors?: Record<string, string>,
    endpoint?: string,
  ) {
    super(message, 400, endpoint);
    this.name = "ServiceNowValidationError";
  }
}

/**
 * Error thrown when ServiceNow rate limit is exceeded
 */
export class ServiceNowRateLimitError extends ServiceNowError {
  constructor(
    message: string,
    public retryAfter?: number,
    endpoint?: string,
  ) {
    super(message, 429, endpoint);
    this.name = "ServiceNowRateLimitError";
  }
}

/**
 * Error thrown when ServiceNow service is unavailable
 */
export class ServiceNowServiceUnavailableError extends ServiceNowError {
  constructor(
    message: string,
    endpoint?: string,
    cause?: Error,
  ) {
    super(message, 503, endpoint, cause);
    this.name = "ServiceNowServiceUnavailableError";
  }
}

/**
 * Error thrown when ServiceNow request times out
 */
export class ServiceNowTimeoutError extends ServiceNowError {
  constructor(
    message: string,
    endpoint?: string,
    cause?: Error,
  ) {
    super(message, 408, endpoint, cause);
    this.name = "ServiceNowTimeoutError";
  }
}

/**
 * Parse ServiceNow error response and create appropriate error
 */
export function parseServiceNowError(
  response: Response,
  endpoint: string,
  body?: string,
): ServiceNowError {
  const statusCode = response.status;

  // Try to parse error body
  let errorMessage = `ServiceNow request failed with status ${statusCode}`;
  try {
    if (body) {
      const errorData = JSON.parse(body);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    }
  } catch {
    // If parsing fails, use the raw body as message
    if (body) {
      errorMessage = `${errorMessage}: ${body.slice(0, 500)}`;
    }
  }

  // Return appropriate error type based on status code
  switch (statusCode) {
    case 401:
    case 403:
      return new ServiceNowAuthError(errorMessage);

    case 404:
      return new ServiceNowNotFoundError("Resource", endpoint, endpoint);

    case 400:
      return new ServiceNowValidationError(errorMessage, undefined, endpoint);

    case 429:
      const retryAfter = response.headers.get("Retry-After");
      return new ServiceNowRateLimitError(
        errorMessage,
        retryAfter ? parseInt(retryAfter) : undefined,
        endpoint,
      );

    case 503:
    case 502:
    case 504:
      return new ServiceNowServiceUnavailableError(errorMessage, endpoint);

    case 408:
      return new ServiceNowTimeoutError(errorMessage, endpoint);

    default:
      return new ServiceNowError(errorMessage, statusCode, endpoint);
  }
}
