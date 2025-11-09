import { describe, it, expect, vi, beforeEach } from "vitest";
import * as capacity from "../../lib/projects/capacity";
import * as interestRepo from "../../lib/db/repositories/interest-repository";
import type { ProjectDefinition } from "../../lib/projects/types";

vi.mock("../../lib/db/repositories/interest-repository");

const mockProject: ProjectDefinition = {
  id: "proj-1",
  name: "Test Project",
  summary: "A test project",
  status: "active",
  maxCandidates: 5,
} as any;

const mockProjectUnlimited: ProjectDefinition = {
  id: "proj-2",
  name: "Unlimited Project",
  summary: "A project without capacity limits",
  status: "active",
} as any;

describe("Capacity Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCapacity", () => {
    it("should return true if project has available capacity", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(3);

      const result = await capacity.checkCapacity(mockProject);

      expect(result).toBe(true);
    });

    it("should return false if project is at capacity", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(5);

      const result = await capacity.checkCapacity(mockProject);

      expect(result).toBe(false);
    });

    it("should return false if project exceeds capacity", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(6);

      const result = await capacity.checkCapacity(mockProject);

      expect(result).toBe(false);
    });

    it("should return true if maxCandidates is not set", async () => {
      const result = await capacity.checkCapacity(mockProjectUnlimited);

      expect(result).toBe(true);
    });

    it("should default to allowing applications on error", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockRejectedValue(
        new Error("DB Error")
      );

      const result = await capacity.checkCapacity(mockProject);

      expect(result).toBe(true);
    });
  });

  describe("getProjectCapacityStatus", () => {
    it("should return full status when at capacity", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(5);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([]);

      const status = await capacity.getProjectCapacityStatus(mockProject);

      expect(status.isFull).toBe(true);
      expect(status.canApply).toBe(false);
      expect(status.availableSlots).toBe(0);
      expect(status.currentApplications).toBe(5);
    });

    it("should return available capacity status", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(3);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([]);

      const status = await capacity.getProjectCapacityStatus(mockProject);

      expect(status.isFull).toBe(false);
      expect(status.canApply).toBe(true);
      expect(status.availableSlots).toBe(2);
      expect(status.currentApplications).toBe(3);
    });

    it("should include waitlist size in status", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(5);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([
        { id: "1" } as any,
        { id: "2" } as any,
      ]);

      const status = await capacity.getProjectCapacityStatus(mockProject);

      expect(status.isFull).toBe(true);
      expect(status.waitlistSize).toBe(2);
    });

    it("should show unlimited slots if maxCandidates is null", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(100);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([]);

      const status = await capacity.getProjectCapacityStatus(mockProjectUnlimited);

      expect(status.maxCandidates).toBeNull();
      expect(status.isFull).toBe(false);
      expect(status.availableSlots).toBe(-1); // Indicates unlimited
    });
  });

  describe("formatCapacityMessage", () => {
    it("should format full project message", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 5,
        isFull: true,
        availableSlots: 0,
        waitlistSize: 0,
        canApply: false,
      };

      const message = capacity.formatCapacityMessage(status);

      expect(message).toContain("Project Full");
      expect(message).toContain("🔴");
    });

    it("should show waitlist count when project is full", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 5,
        isFull: true,
        availableSlots: 0,
        waitlistSize: 3,
        canApply: false,
      };

      const message = capacity.formatCapacityMessage(status);

      expect(message).toContain("3 on waitlist");
    });

    it("should show remaining slots", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 2,
        isFull: false,
        availableSlots: 3,
        waitlistSize: 0,
        canApply: true,
      };

      const message = capacity.formatCapacityMessage(status);

      expect(message).toContain("3 slots");
      expect(message).toContain("🟢");
    });

    it("should show warning for single slot", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 4,
        isFull: false,
        availableSlots: 1,
        waitlistSize: 0,
        canApply: true,
      };

      const message = capacity.formatCapacityMessage(status);

      expect(message).toContain("1 slot");
      expect(message).toContain("🟡");
    });

    it("should show unlimited message", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: null,
        currentApplications: 100,
        isFull: false,
        availableSlots: -1,
        waitlistSize: 0,
        canApply: true,
      };

      const message = capacity.formatCapacityMessage(status);

      expect(message).toContain("Unlimited");
    });
  });

  describe("isProjectAcceptingApplications", () => {
    it("should return true for active project with capacity", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(2);

      const result = await capacity.isProjectAcceptingApplications(mockProject);

      expect(result).toBe(true);
    });

    it("should return false if project is full", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(5);

      const result = await capacity.isProjectAcceptingApplications(mockProject);

      expect(result).toBe(false);
    });

    it("should return false if project is not active", async () => {
      const inactiveProject = {
        ...mockProject,
        status: "archived",
      };

      const result = await capacity.isProjectAcceptingApplications(inactiveProject);

      expect(result).toBe(false);
    });

    it("should return false if project has expired", async () => {
      const expiredProject = {
        ...mockProject,
        expiresDate: new Date(Date.now() - 1000),
      };

      const result = await capacity.isProjectAcceptingApplications(expiredProject);

      expect(result).toBe(false);
    });
  });

  describe("shouldPromoteFromWaitlist", () => {
    it("should return true when slots available and waitlist exists", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(3);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([
        { id: "1" } as any,
      ]);

      const result = await capacity.shouldPromoteFromWaitlist(mockProject);

      expect(result).toBe(true);
    });

    it("should return false when no slots available", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(5);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([
        { id: "1" } as any,
      ]);

      const result = await capacity.shouldPromoteFromWaitlist(mockProject);

      expect(result).toBe(false);
    });

    it("should return false when waitlist is empty", async () => {
      vi.spyOn(interestRepo, "getActiveInterestCount").mockResolvedValue(3);
      vi.spyOn(interestRepo, "getWaitlist").mockResolvedValue([]);

      const result = await capacity.shouldPromoteFromWaitlist(mockProject);

      expect(result).toBe(false);
    });

    it("should return false for unlimited project", async () => {
      const result = await capacity.shouldPromoteFromWaitlist(mockProjectUnlimited);

      expect(result).toBe(false);
    });
  });

  describe("calculateNewAvailableSlots", () => {
    it("should return 1 slot when candidate accepted", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 5,
        isFull: true,
        availableSlots: 0,
        waitlistSize: 0,
        canApply: false,
      };

      const result = capacity.calculateNewAvailableSlots(status, "accept");

      expect(result).toBe(1);
    });

    it("should return 0 slots when candidate rejected", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 5,
        isFull: true,
        availableSlots: 0,
        waitlistSize: 0,
        canApply: false,
      };

      const result = capacity.calculateNewAvailableSlots(status, "reject");

      expect(result).toBe(0);
    });

    it("should return 0 slots when candidate abandoned", () => {
      const status: capacity.CapacityStatus = {
        maxCandidates: 5,
        currentApplications: 5,
        isFull: true,
        availableSlots: 0,
        waitlistSize: 0,
        canApply: false,
      };

      const result = capacity.calculateNewAvailableSlots(status, "abandon");

      expect(result).toBe(0);
    });
  });
});
