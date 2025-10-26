/**
 * Unit Tests for Resolution Detector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ResolutionDetector,
  getResolutionDetector,
  __resetResolutionDetector,
  __setResolutionDetector,
} from "../lib/passive/detectors/resolution-detector";
import type { CaseContext } from "../lib/context-manager";
import type { CaseDataService } from "../lib/services/case-data";

describe("ResolutionDetector", () => {
  let mockCaseDataService: Partial<CaseDataService>;
  let detector: ResolutionDetector;

  const createMockContext = (
    overrides: Partial<CaseContext> = {}
  ): CaseContext => ({
    caseNumber: "SCS0001234",
    channelId: "C123456",
    threadTs: "1234567890.123456",
    channelName: "test-channel",
    messages: [],
    isResolved: false,
    hasPostedAssistance: false,
    _notified: false,
    ...overrides,
  });

  beforeEach(() => {
    mockCaseDataService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getCase: vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Resolved",
        sys_id: "abc123",
      }),
    };

    detector = new ResolutionDetector({
      caseDataService: mockCaseDataService as CaseDataService,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetResolutionDetector();
  });

  describe("shouldTriggerKBWorkflow", () => {
    it("should return false when not marked as resolved in conversation", async () => {
      const context = createMockContext({ isResolved: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(false);
      expect(result.isValidatedByServiceNow).toBe(false);
      expect(result.reason).toBe("Not marked as resolved in conversation");
    });

    it("should return false when already notified", async () => {
      const context = createMockContext({ isResolved: true, _notified: true });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(false);
      expect(result.isValidatedByServiceNow).toBe(false);
      expect(result.reason).toBe("Already notified about resolution");
    });

    it("should return true when ServiceNow not configured", async () => {
      mockCaseDataService.isConfigured = vi.fn().mockReturnValue(false);
      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(false);
      expect(result.reason).toBe(
        "ServiceNow not configured, using conversation-based detection"
      );
    });

    it("should validate against ServiceNow when configured", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Resolved",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(true);
      expect(result.reason).toBe(
        "Confirmed resolved in both conversation and ServiceNow"
      );
      expect(mockCaseDataService.getCase).toHaveBeenCalledWith("SCS0001234");
    });

    it("should accept closed state from ServiceNow", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Closed",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(true);
    });

    it("should accept case-insensitive resolved state", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "RESOLVED",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(true);
    });

    it("should accept case-insensitive closed state", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "CLOSED",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(true);
    });

    it("should return false when ServiceNow shows non-resolved state", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "In Progress",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(false);
      expect(result.isValidatedByServiceNow).toBe(false);
      expect(result.reason).toBe(
        "Conversation suggests resolution but ServiceNow state does not confirm"
      );
    });

    it("should fallback to conversation when ServiceNow check fails", async () => {
      mockCaseDataService.getCase = vi
        .fn()
        .mockRejectedValue(new Error("ServiceNow API error"));

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(false);
      expect(result.reason).toBe(
        "ServiceNow validation failed, using conversation-based detection"
      );
    });

    it("should return false when case not found in ServiceNow", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue(null);

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(false);
      expect(result.isValidatedByServiceNow).toBe(false);
    });

    it("should handle case with no state field", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        sys_id: "abc123",
        // state is missing
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(false);
      expect(result.isValidatedByServiceNow).toBe(false);
    });

    it("should handle partial match in state field", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Auto-Resolved by System",
        sys_id: "abc123",
      });

      const context = createMockContext({ isResolved: true, _notified: false });

      const result = await detector.shouldTriggerKBWorkflow(context);

      expect(result.isResolved).toBe(true);
      expect(result.isValidatedByServiceNow).toBe(true);
    });
  });

  describe("isResolved", () => {
    it("should return true for resolved case", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Resolved",
        sys_id: "abc123",
      });

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(true);
    });

    it("should return true for closed case", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "Closed",
        sys_id: "abc123",
      });

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(true);
    });

    it("should return false for active case", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue({
        number: "SCS0001234",
        state: "New",
        sys_id: "abc123",
      });

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(false);
    });

    it("should return false when ServiceNow not configured", async () => {
      mockCaseDataService.isConfigured = vi.fn().mockReturnValue(false);

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(false);
      expect(mockCaseDataService.getCase).not.toHaveBeenCalled();
    });

    it("should return false on error", async () => {
      mockCaseDataService.getCase = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(false);
    });

    it("should return false when case not found", async () => {
      mockCaseDataService.getCase = vi.fn().mockResolvedValue(null);

      const result = await detector.isResolved("SCS0001234");

      expect(result).toBe(false);
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      const mockDetector = new ResolutionDetector({
        caseDataService: mockCaseDataService as CaseDataService,
      });
      __setResolutionDetector(mockDetector);

      const instance1 = getResolutionDetector();
      const instance2 = getResolutionDetector();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockDetector1 = new ResolutionDetector({
        caseDataService: mockCaseDataService as CaseDataService,
      });
      __setResolutionDetector(mockDetector1);

      const instance1 = getResolutionDetector();

      __resetResolutionDetector();

      const mockDetector2 = new ResolutionDetector({
        caseDataService: mockCaseDataService as CaseDataService,
      });
      __setResolutionDetector(mockDetector2);

      const instance2 = getResolutionDetector();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customDetector = new ResolutionDetector({
        caseDataService: mockCaseDataService as CaseDataService,
      });
      __setResolutionDetector(customDetector);

      const instance = getResolutionDetector();
      expect(instance).toBe(customDetector);
    });
  });
});
