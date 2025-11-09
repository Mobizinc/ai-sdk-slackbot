import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as repo from "../../lib/db/repositories/interest-repository";
import * as db from "../../lib/db/client";

// Mock the database client
vi.mock("../../lib/db/client");

describe("Interest Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createInterest", () => {
    it("should create a new interest record", async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([
          {
            id: "interest-1",
            projectId: "proj-1",
            candidateSlackId: "user-1",
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      });

      const mockDb = {
        insert: mockInsert,
      };

      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.createInterest("proj-1", "user-1", "pending");

      expect(result).toBeDefined();
      expect(result?.projectId).toBe("proj-1");
      expect(result?.candidateSlackId).toBe("user-1");
      expect(result?.status).toBe("pending");
    });

    it("should handle database errors gracefully", async () => {
      const mockDb = {
        insert: vi.fn().mockRejectedValue(new Error("DB Error")),
      };

      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.createInterest("proj-1", "user-1", "pending");

      expect(result).toBeNull();
    });
  });

  describe("findInterest", () => {
    it("should find an existing interest", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "interest-1",
                  projectId: "proj-1",
                  candidateSlackId: "user-1",
                  status: "interviewing",
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.findInterest("proj-1", "user-1");

      expect(result).toBeDefined();
      expect(result?.status).toBe("interviewing");
    });

    it("should return null if no interest found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.findInterest("proj-1", "user-1");

      expect(result).toBeNull();
    });
  });

  describe("hasActiveInterest", () => {
    it("should return true if candidate has active interest", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "interest-1",
                projectId: "proj-1",
                candidateSlackId: "user-1",
                status: "interviewing",
              },
            ]),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.hasActiveInterest("proj-1", "user-1");

      expect(result).toBe(true);
    });

    it("should return false if no active interest", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.hasActiveInterest("proj-1", "user-1");

      expect(result).toBe(false);
    });

    it("should exclude abandoned interests", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.hasActiveInterest("proj-1", "user-1");

      expect(result).toBe(false);
    });
  });

  describe("updateInterestStatus", () => {
    it("should update interest status", async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "interest-1",
                projectId: "proj-1",
                status: "accepted",
                updatedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const mockDb = { update: mockUpdate };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.updateInterestStatus("interest-1", "accepted", "interview-1");

      expect(result).toBeDefined();
      expect(result?.status).toBe("accepted");
    });

    it("should mark abandoned interests with timestamp", async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "interest-1",
                status: "abandoned",
                abandonedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const mockDb = { update: mockUpdate };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.updateInterestStatus("interest-1", "abandoned");

      expect(result?.status).toBe("abandoned");
    });
  });

  describe("getActiveInterestCount", () => {
    it("should count active interests excluding abandoned and waitlist", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "1", status: "pending" },
            { id: "2", status: "interviewing" },
            { id: "3", status: "accepted" },
          ]),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const count = await repo.getActiveInterestCount("proj-1");

      expect(count).toBe(3);
    });

    it("should return 0 if no active interests", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const count = await repo.getActiveInterestCount("proj-1");

      expect(count).toBe(0);
    });
  });

  describe("getWaitlist", () => {
    it("should retrieve waitlist in FIFO order", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: "1", candidateSlackId: "user-1", createdAt: new Date(1000) },
              { id: "2", candidateSlackId: "user-2", createdAt: new Date(2000) },
            ]),
          }),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const waitlist = await repo.getWaitlist("proj-1");

      expect(waitlist).toHaveLength(2);
      expect(waitlist[0].candidateSlackId).toBe("user-1");
      expect(waitlist[1].candidateSlackId).toBe("user-2");
    });
  });

  describe("markAbandoned", () => {
    it("should mark interest as abandoned", async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "interest-1",
                status: "abandoned",
                abandonedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const mockDb = { update: mockUpdate };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const result = await repo.markAbandoned("interest-1");

      expect(result?.status).toBe("abandoned");
    });
  });

  describe("getProjectInterestStats", () => {
    it("should calculate interest statistics", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "1", status: "pending" },
            { id: "2", status: "pending" },
            { id: "3", status: "interviewing" },
            { id: "4", status: "accepted" },
            { id: "5", status: "rejected" },
            { id: "6", status: "abandoned" },
            { id: "7", status: "waitlist" },
          ]),
        }),
      });

      const mockDb = { select: mockSelect };
      vi.spyOn(db, "getDb").mockReturnValue(mockDb as any);

      const stats = await repo.getProjectInterestStats("proj-1");

      expect(stats.pending).toBe(2);
      expect(stats.interviewing).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.abandoned).toBe(1);
      expect(stats.waitlist).toBe(1);
      expect(stats.total).toBe(7);
    });
  });
});
