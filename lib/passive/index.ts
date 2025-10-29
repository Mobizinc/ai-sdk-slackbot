/**
 * Passive Module Public Exports
 *
 * Provides the public API for the refactored passive message handling system.
 * These exports maintain backward compatibility with the original implementation.
 */

export {
  handlePassiveMessage,
  notifyResolution,
  cleanupTimedOutGathering,
  extractCaseNumbers,
} from './handler';

// Export types if needed by consumers
export type { ResolutionCheckResult } from './detectors/resolution-detector';
export type { PostAssistanceParams } from './actions/post-assistance';

// Test helpers - only exported for testing
export { __resetResolutionDetector, __setResolutionDetector } from './detectors/resolution-detector';
export { __resetAddToContextAction, __setAddToContextAction } from './actions/add-to-context';
export { __resetPostAssistanceAction, __setPostAssistanceAction } from './actions/post-assistance';