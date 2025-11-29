import { describe, it, expect } from "vitest";
import { qualityDetector, QUALITY_WEIGHTS, DEFAULT_EXEMPLAR_QUALITY_THRESHOLD } from "../lib/services/muscle-memory/quality-detector";
import type { SupervisorDecision } from "../lib/supervisor";
import type { InteractiveState } from "../lib/db/schema";

describe("QualityDetector", () => {
  describe("detectSupervisorSignal", () => {
    it("should detect approved supervisor signal", () => {
      const decision: SupervisorDecision = {
        status: "approved",
        reason: "High quality response",
        llmReview: { score: 0.9, concerns: [], approvalRecommended: true },
      };

      const signal = qualityDetector.detectSupervisorSignal(decision);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("supervisor");
      expect(signal?.value).toBe("approved");
      expect(signal?.weight).toBe(QUALITY_WEIGHTS.supervisor);
      expect(signal?.weight).toBe(0.4);
    });

    it("should detect blocked supervisor signal with negative weight", () => {
      const decision: SupervisorDecision = {
        status: "blocked",
        reason: "Low confidence",
      };

      const signal = qualityDetector.detectSupervisorSignal(decision);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("supervisor");
      expect(signal?.value).toBe("rejected");
      expect(signal?.weight).toBe(-0.3);
    });

    it("should return null for decisions without clear approval/rejection", () => {
      const decision: SupervisorDecision = {
        status: "approved",
      };

      const signal = qualityDetector.detectSupervisorSignal(decision);

      expect(signal).not.toBeNull(); // Approved should always return a signal
      expect(signal?.value).toBe("approved");
    });
  });

  describe("detectHumanFeedbackSignal", () => {
    it("should detect positive feedback from approved state", () => {
      const state: InteractiveState = {
        id: "test-id",
        channelId: "C123",
        messageTs: "1234567890.123456",
        stateType: "supervisor_review",
        status: "approved",
        payload: {},
        createdAt: new Date(),
        processedBy: "U123",
        processedAt: new Date(),
      };

      const signal = qualityDetector.detectHumanFeedbackSignal(state);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("human_feedback");
      expect(signal?.value).toBe("positive");
      expect(signal?.weight).toBe(QUALITY_WEIGHTS.human_feedback);
      expect(signal?.weight).toBe(0.3);
    });

    it("should detect negative feedback from rejected state", () => {
      const state: InteractiveState = {
        id: "test-id",
        channelId: "C123",
        messageTs: "1234567890.123456",
        stateType: "supervisor_review",
        status: "rejected",
        payload: {},
        createdAt: new Date(),
        processedBy: "U123",
        processedAt: new Date(),
      };

      const signal = qualityDetector.detectHumanFeedbackSignal(state);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("human_feedback");
      expect(signal?.value).toBe("negative");
      expect(signal?.weight).toBe(-0.3);
    });

    it("should return null for pending state", () => {
      const state: InteractiveState = {
        id: "test-id",
        channelId: "C123",
        messageTs: "1234567890.123456",
        stateType: "supervisor_review",
        status: "pending",
        payload: {},
        createdAt: new Date(),
      };

      const signal = qualityDetector.detectHumanFeedbackSignal(state);

      expect(signal).toBeNull();
    });
  });

  describe("detectOutcomeSignal", () => {
    it("should detect successful outcome", () => {
      const signal = qualityDetector.detectOutcomeSignal("success");

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("outcome");
      expect(signal?.value).toBe("success");
      expect(signal?.weight).toBe(QUALITY_WEIGHTS.outcome);
      expect(signal?.weight).toBe(0.2);
    });

    it("should detect partial success", () => {
      const signal = qualityDetector.detectOutcomeSignal("partial_success");

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("outcome");
      expect(signal?.value).toBe("partial_success");
      expect(signal?.weight).toBe(0.1); // Half weight for partial
    });

    it("should return null for failure outcome", () => {
      const signal = qualityDetector.detectOutcomeSignal("failure");

      expect(signal).toBeNull();
    });

    it("should handle user_corrected outcome", () => {
      const signal = qualityDetector.detectOutcomeSignal("user_corrected");

      expect(signal).not.toBeNull();
      expect(signal?.value).toBe("user_corrected");
      expect(signal?.weight).toBe(0.05); // Reduced weight
    });
  });

  describe("detectImplicitSignals", () => {
    it("should detect clean interaction (no escalations, no corrections)", () => {
      const context = {
        hasEscalations: false,
        hasUserCorrections: false,
        responseTime: 300, // 5 minutes - fast
      };

      const signal = qualityDetector.detectImplicitSignals(context);

      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("implicit");
      expect(signal?.value).toBe("clean_interaction");
      expect(signal?.weight).toBe(QUALITY_WEIGHTS.implicit);
      expect(signal?.weight).toBe(0.1);
    });

    it("should return null when escalations present", () => {
      const context = {
        hasEscalations: true,
        hasUserCorrections: false,
        responseTime: 300,
      };

      const signal = qualityDetector.detectImplicitSignals(context);

      expect(signal).toBeNull();
    });

    it("should return null when user corrections present", () => {
      const context = {
        hasEscalations: false,
        hasUserCorrections: true,
        responseTime: 300,
      };

      const signal = qualityDetector.detectImplicitSignals(context);

      expect(signal).toBeNull();
    });
  });

  describe("aggregateSignals", () => {
    it("should calculate weighted average from multiple signals", () => {
      const signals = [
        { type: "supervisor" as const, value: "approved", weight: 0.4, recordedAt: new Date() },
        { type: "outcome" as const, value: "success", weight: 0.2, recordedAt: new Date() },
        { type: "implicit" as const, value: "clean_interaction", weight: 0.1, recordedAt: new Date() },
      ];

      const assessment = qualityDetector.aggregateSignals(signals);

      expect(assessment.score).toBe(0.7); // 0.4 + 0.2 + 0.1
      expect(assessment.summary.supervisorApproval).toBe(true);
      expect(assessment.summary.outcomeSuccess).toBe(true);
    });

    it("should handle negative signals correctly", () => {
      const signals = [
        { type: "supervisor" as const, value: "approved", weight: 0.4, recordedAt: new Date() },
        { type: "human_feedback" as const, value: "negative", weight: -0.3, recordedAt: new Date() },
      ];

      const assessment = qualityDetector.aggregateSignals(signals);

      expect(assessment.score).toBe(0.1); // 0.4 - 0.3
      expect(assessment.summary.supervisorApproval).toBe(true);
      expect(assessment.summary.humanFeedback).toBe("negative");
    });

    it("should normalize scores between 0 and 1", () => {
      const signals = [
        { type: "supervisor" as const, value: "approved", weight: 0.4, recordedAt: new Date() },
        { type: "human_feedback" as const, value: "positive", weight: 0.3, recordedAt: new Date() },
        { type: "outcome" as const, value: "success", weight: 0.2, recordedAt: new Date() },
        { type: "implicit" as const, value: "clean_interaction", weight: 0.1, recordedAt: new Date() },
      ];

      const assessment = qualityDetector.aggregateSignals(signals);

      expect(assessment.score).toBe(1.0); // Perfect score
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(1);
    });

    it("should floor negative totals at 0", () => {
      const signals = [
        { type: "supervisor" as const, value: "rejected", weight: -0.3, recordedAt: new Date() },
        { type: "human_feedback" as const, value: "negative", weight: -0.3, recordedAt: new Date() },
      ];

      const assessment = qualityDetector.aggregateSignals(signals);

      expect(assessment.score).toBe(0); // Should not go below 0
    });
  });

  describe("calculateQualityScore", () => {
    it("should calculate score from boolean indicators", () => {
      const indicators = {
        supervisorApproval: true,
        outcomeSuccess: true,
        humanFeedback: "positive" as const,
      };

      const score = qualityDetector.calculateQualityScore(indicators);

      // 0.4 (supervisor) + 0.2 (outcome) + 0.3 (human) = 0.9
      expect(score).toBe(0.9);
    });

    it("should handle partial indicators", () => {
      const indicators = {
        supervisorApproval: true,
        outcomeSuccess: false,
      };

      const score = qualityDetector.calculateQualityScore(indicators);

      expect(score).toBe(0.4); // Only supervisor signal
    });

    it("should handle negative feedback", () => {
      const indicators = {
        supervisorApproval: true,
        humanFeedback: "negative" as const,
      };

      const score = qualityDetector.calculateQualityScore(indicators);

      expect(score).toBe(0.1); // 0.4 - 0.3
    });
  });

  describe("quality threshold constant", () => {
    it("should have default threshold of 0.6", () => {
      expect(DEFAULT_EXEMPLAR_QUALITY_THRESHOLD).toBe(0.6);
    });

    it("should require both supervisor and outcome for threshold", () => {
      // Supervisor alone (0.4) doesn't meet 0.6
      const supervisorOnly = qualityDetector.calculateQualityScore({
        supervisorApproval: true,
      });
      expect(supervisorOnly).toBeLessThan(DEFAULT_EXEMPLAR_QUALITY_THRESHOLD);

      // Supervisor + outcome (0.4 + 0.2 = 0.6) meets threshold
      const supervisorAndOutcome = qualityDetector.calculateQualityScore({
        supervisorApproval: true,
        outcomeSuccess: true,
      });
      expect(supervisorAndOutcome).toBeGreaterThanOrEqual(DEFAULT_EXEMPLAR_QUALITY_THRESHOLD);
    });
  });
});
