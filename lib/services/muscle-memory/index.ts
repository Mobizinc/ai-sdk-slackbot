/**
 * Muscle Memory Module
 * Exports all muscle memory services for agent learning and semantic retrieval
 *
 * Usage:
 *   import { muscleMemoryService, retrievalService } from '../services/muscle-memory';
 */

// Core services
export { qualityDetector, QualityDetector } from "./quality-detector";
export { collectionService, CollectionService } from "./collection-service";
export { muscleMemoryService, MuscleMemoryService } from "./muscle-memory-service";
export { retrievalService, RetrievalService } from "./retrieval-service";

// Types
export type { QualitySignal, QualitySignalType, QualityAssessment } from "./quality-detector";
export type { InteractionCapture, CaptureDecision } from "./collection-service";
export type { MuscleMemoryExemplarSummary, RetrievalOptions } from "./retrieval-service";
export type { CaptureResult } from "./muscle-memory-service";

// Constants
export { QUALITY_WEIGHTS, DEFAULT_EXEMPLAR_QUALITY_THRESHOLD } from "./quality-detector";
