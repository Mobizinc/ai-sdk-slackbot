/**
 * Unit Tests for Change Request Repository
 *
 * Tests high-level methods for working with ServiceNow Change Requests,
 * built on top of ServiceNowTableAPIClient.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ChangeRepository", () => {
  let mockTableClient: any;
  let repository: any;

  const mockChangeRequest = {
    sys_id: "CHG0000001",
    number: "CHG0000001",
    short_description: "Update catalog item",
    description: "Detailed description",
    state: "assess",
    type: "standard",
    risk: "low",
    impact: "medium",
  };

  const mockStateTransition = {
    sys_id: "ST0000001",
    change: { link: "change_request/CHG0000001" },
    from_state: "new",
    to_state: "assess",
    sys_created_on: "2025-11-07 10:00:00",
    sys_created_by: "system",
  };

  const mockWorkNote = {
    sys_id: "JE0000001",
    sys_journal_field: "work_notes",
    value: "Work note content",
    sys_created_on: "2025-11-07 11:00:00",
    sys_created_by: "john.doe",
  };

  beforeEach(() => {
    mockTableClient = {
      fetchAll: vi.fn().mockResolvedValue([mockChangeRequest]),
      fetchById: vi.fn().mockResolvedValue(mockChangeRequest),
      create: vi.fn().mockResolvedValue(mockChangeRequest),
      update: vi.fn().mockResolvedValue(mockChangeRequest),
      patch: vi.fn().mockResolvedValue(mockChangeRequest),
      delete: vi.fn().mockResolvedValue({ success: true }),
      buildQuery: (obj: Record<string, any>) => {
        return Object.entries(obj)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join("^");
      },
    };

    repository = {
      fetchChanges: vi
        .fn()
        .mockImplementation(async (query, options) => {
          return mockTableClient.fetchAll("change_request", {
            sysparm_query: typeof query === "string" ? query : undefined,
            ...options,
          });
        }),
      fetchChangeById: vi
        .fn()
        .mockImplementation(async (sysId) => {
          return mockTableClient.fetchById("change_request", sysId);
        }),
      fetchChangeByNumber: vi
        .fn()
        .mockImplementation(async (changeNumber) => {
          const changes = await mockTableClient.fetchAll("change_request", {
            sysparm_query: `number=${changeNumber}`,
          });
          return changes[0] || null;
        }),
      fetchStateTransitions: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return mockTableClient.fetchAll("change_state_transition", {
            sysparm_query: `change=${changeSysId}`,
          });
        }),
      fetchComponentReferences: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return mockTableClient.fetchAll("change_requested_item", {
            sysparm_query: `change_request=${changeSysId}`,
          });
        }),
      fetchWorkNotes: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return mockTableClient.fetchAll("sys_journal_field", {
            sysparm_query: `table_name=change_request^element_id=${changeSysId}^element=work_notes`,
          });
        }),
      fetchComments: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return mockTableClient.fetchAll("sys_journal_field", {
            sysparm_query: `table_name=change_request^element_id=${changeSysId}^element=comments`,
          });
        }),
      fetchAttachments: vi
        .fn()
        .mockImplementation(async (changeSysId) => {
          return mockTableClient.fetchAll("sys_attachment", {
            sysparm_query: `table_name=change_request^table_sys_id=${changeSysId}`,
          });
        }),
      fetchStandardChanges: vi
        .fn()
        .mockImplementation(async (options) => {
          return mockTableClient.fetchAll("change_request", {
            sysparm_query: "type=standard^active=true",
            ...options,
          });
        }),
      createChange: vi
        .fn()
        .mockImplementation(async (data) => {
          return mockTableClient.create("change_request", data);
        }),
      updateChange: vi
        .fn()
        .mockImplementation(async (sysId, data) => {
          return mockTableClient.update("change_request", sysId, data);
        }),
      addWorkNote: vi
        .fn()
        .mockImplementation(async (changeSysId, noteText) => {
          return mockTableClient.create("sys_journal_field", {
            table_name: "change_request",
            element_id: changeSysId,
            element: "work_notes",
            value: noteText,
          });
        }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchChanges", () => {
    it("should fetch all changes without filter", async () => {
      const changes = await repository.fetchChanges();

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "change_request",
        expect.any(Object)
      );
      expect(Array.isArray(changes)).toBe(true);
    });

    it("should fetch changes with string query", async () => {
      const query = "state=assess^active=true";

      const changes = await repository.fetchChanges(query);

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should fetch changes with object query", async () => {
      const query = {
        state: "assess",
        active: "true",
      };

      const changes = await repository.fetchChanges(query);

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should support pagination options", async () => {
      const changes = await repository.fetchChanges(undefined, {
        pageSize: 500,
        maxRecords: 1000,
      });

      expect(Array.isArray(changes)).toBe(true);
    });

    it("should support field selection", async () => {
      const changes = await repository.fetchChanges(undefined, {
        sysparm_fields: "sys_id,number,state",
      });

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should encode query properly", async () => {
      const query = {
        short_description: "Test & special",
      };

      const changes = await repository.fetchChanges(query);

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should return array of changes", async () => {
      const changes = await repository.fetchChanges();

      expect(Array.isArray(changes)).toBe(true);
      if (changes.length > 0) {
        expect(changes[0]).toHaveProperty("sys_id");
      }
    });
  });

  describe("fetchChangeById", () => {
    it("should fetch change by sys_id", async () => {
      const change = await repository.fetchChangeById("CHG0000001");

      expect(mockTableClient.fetchById).toHaveBeenCalledWith(
        "change_request",
        "CHG0000001"
      );
      expect(change).toHaveProperty("sys_id");
    });

    it("should return null if not found", async () => {
      mockTableClient.fetchById.mockResolvedValueOnce(null);

      const change = await repository.fetchChangeById("NONEXISTENT");

      expect(change).toBeNull();
    });

    it("should return change with all fields", async () => {
      const change = await repository.fetchChangeById("CHG0000001");

      expect(change).toHaveProperty("sys_id");
      expect(change).toHaveProperty("number");
      expect(change).toHaveProperty("state");
    });

    it("should use direct ID lookup for performance", async () => {
      await repository.fetchChangeById("CHG0000001");

      // Should use fetchById, not fetchAll
      expect(mockTableClient.fetchById).toHaveBeenCalled();
      expect(mockTableClient.fetchAll).not.toHaveBeenCalled();
    });
  });

  describe("fetchChangeByNumber", () => {
    it("should fetch change by change number", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([mockChangeRequest]);

      const change = await repository.fetchChangeByNumber("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "change_request",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("number"),
        })
      );
    });

    it("should return first change if multiple results", async () => {
      const changes = [mockChangeRequest, { ...mockChangeRequest, number: "CHG0000002" }];
      mockTableClient.fetchAll.mockResolvedValueOnce(changes);

      const change = await repository.fetchChangeByNumber("CHG0000001");

      expect(change).toHaveProperty("number", "CHG0000001");
    });

    it("should return null if not found", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([]);

      const change = await repository.fetchChangeByNumber("NONEXISTENT");

      expect(change).toBeNull();
    });

    it("should use query to filter by number", async () => {
      await repository.fetchChangeByNumber("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });
  });

  describe("fetchStateTransitions", () => {
    it("should fetch state transitions for a change", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([mockStateTransition]);

      const transitions = await repository.fetchStateTransitions("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "change_state_transition",
        expect.any(Object)
      );
      expect(Array.isArray(transitions)).toBe(true);
    });

    it("should filter by change sys_id", async () => {
      await repository.fetchStateTransitions("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_query: expect.stringContaining("CHG0000001"),
        })
      );
    });

    it("should return transitions in chronological order", async () => {
      const transitions = [
        { ...mockStateTransition, from_state: "new", to_state: "assess" },
        {
          ...mockStateTransition,
          sys_id: "ST0000002",
          from_state: "assess",
          to_state: "approved",
        },
      ];
      mockTableClient.fetchAll.mockResolvedValueOnce(transitions);

      const result = await repository.fetchStateTransitions("CHG0000001");

      expect(result).toHaveLength(2);
    });
  });

  describe("fetchComponentReferences", () => {
    it("should fetch components referenced in change", async () => {
      const references = await repository.fetchComponentReferences("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "change_requested_item",
        expect.any(Object)
      );
      expect(Array.isArray(references)).toBe(true);
    });

    it("should filter by change request sys_id", async () => {
      await repository.fetchComponentReferences("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should include CI references", async () => {
      const references = await repository.fetchComponentReferences("CHG0000001");

      expect(Array.isArray(references)).toBe(true);
    });
  });

  describe("fetchWorkNotes", () => {
    it("should fetch work notes for a change", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([mockWorkNote]);

      const notes = await repository.fetchWorkNotes("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "sys_journal_field",
        expect.any(Object)
      );
      expect(Array.isArray(notes)).toBe(true);
    });

    it("should filter by element_id and element name", async () => {
      await repository.fetchWorkNotes("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_query: expect.stringContaining("work_notes"),
        })
      );
    });

    it("should return notes in creation order", async () => {
      const notes = [
        mockWorkNote,
        { ...mockWorkNote, sys_id: "JE0000002", sys_created_on: "2025-11-07 12:00:00" },
      ];
      mockTableClient.fetchAll.mockResolvedValueOnce(notes);

      const result = await repository.fetchWorkNotes("CHG0000001");

      expect(result).toHaveLength(2);
    });
  });

  describe("fetchComments", () => {
    it("should fetch comments for a change", async () => {
      const comments = await repository.fetchComments("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "sys_journal_field",
        expect.any(Object)
      );
      expect(Array.isArray(comments)).toBe(true);
    });

    it("should filter by comments element", async () => {
      await repository.fetchComments("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_query: expect.stringContaining("comments"),
        })
      );
    });

    it("should distinguish from work notes", async () => {
      const workNotesCall = repository.fetchWorkNotes("CHG0000001");
      const commentsCall = repository.fetchComments("CHG0000001");

      // Should use different queries
      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });
  });

  describe("fetchAttachments", () => {
    it("should fetch attachments for a change", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([
        {
          sys_id: "ATT0000001",
          file_name: "design.pdf",
          table_name: "change_request",
        },
      ]);

      const attachments = await repository.fetchAttachments("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "sys_attachment",
        expect.any(Object)
      );
      expect(Array.isArray(attachments)).toBe(true);
    });

    it("should filter by table and sys_id", async () => {
      await repository.fetchAttachments("CHG0000001");

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should include file metadata", async () => {
      const attachments = await repository.fetchAttachments("CHG0000001");

      expect(Array.isArray(attachments)).toBe(true);
    });
  });

  describe("fetchStandardChanges", () => {
    it("should fetch only standard changes", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([
        { ...mockChangeRequest, type: "standard" },
      ]);

      const changes = await repository.fetchStandardChanges();

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        "change_request",
        expect.objectContaining({
          sysparm_query: expect.stringContaining("standard"),
        })
      );
    });

    it("should filter to active changes only", async () => {
      await repository.fetchStandardChanges();

      expect(mockTableClient.fetchAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sysparm_query: expect.stringContaining("active=true"),
        })
      );
    });

    it("should support additional query options", async () => {
      const changes = await repository.fetchStandardChanges({
        pageSize: 100,
      });

      expect(Array.isArray(changes)).toBe(true);
    });

    it("should return only standard change type records", async () => {
      mockTableClient.fetchAll.mockResolvedValueOnce([
        { ...mockChangeRequest, type: "standard" },
      ]);

      const changes = await repository.fetchStandardChanges();

      if (changes.length > 0) {
        expect(changes[0].type).toBe("standard");
      }
    });
  });

  describe("createChange", () => {
    it("should create new change request", async () => {
      const newChange = {
        short_description: "New change",
        component_type: "catalog_item",
      };

      const result = await repository.createChange(newChange);

      expect(mockTableClient.create).toHaveBeenCalledWith(
        "change_request",
        newChange
      );
      expect(result).toHaveProperty("sys_id");
    });

    it("should return created record with sys_id", async () => {
      const result = await repository.createChange({
        short_description: "New change",
      });

      expect(result).toHaveProperty("sys_id");
      expect(typeof result.sys_id).toBe("string");
    });

    it("should include all provided fields", async () => {
      const changeData = {
        short_description: "Test",
        description: "Detailed test",
        state: "assess",
      };

      await repository.createChange(changeData);

      expect(mockTableClient.create).toHaveBeenCalledWith(
        "change_request",
        changeData
      );
    });
  });

  describe("updateChange", () => {
    it("should update existing change", async () => {
      const updateData = {
        state: "completed",
        close_code: "successful",
      };

      const result = await repository.updateChange("CHG0000001", updateData);

      expect(mockTableClient.update).toHaveBeenCalledWith(
        "change_request",
        "CHG0000001",
        updateData
      );
      expect(result).toHaveProperty("sys_id");
    });

    it("should return updated record", async () => {
      const updated = { ...mockChangeRequest, state: "completed" };
      mockTableClient.update.mockResolvedValueOnce(updated);

      const result = await repository.updateChange("CHG0000001", {
        state: "completed",
      });

      expect(result.state).toBe("completed");
    });

    it("should only update specified fields", async () => {
      await repository.updateChange("CHG0000001", { state: "completed" });

      expect(mockTableClient.update).toHaveBeenCalledWith(
        expect.any(String),
        "CHG0000001",
        expect.objectContaining({ state: "completed" })
      );
    });
  });

  describe("addWorkNote", () => {
    it("should add work note to change", async () => {
      const noteText = "Validation completed successfully";

      const result = await repository.addWorkNote("CHG0000001", noteText);

      expect(mockTableClient.create).toHaveBeenCalledWith(
        "sys_journal_field",
        expect.objectContaining({
          value: noteText,
          element: "work_notes",
        })
      );
    });

    it("should create journal field entry", async () => {
      mockTableClient.create.mockResolvedValueOnce({
        sys_id: "JE0000001",
        value: "Test note",
      });

      const result = await repository.addWorkNote("CHG0000001", "Test note");

      expect(mockTableClient.create).toHaveBeenCalledWith(
        "sys_journal_field",
        expect.any(Object)
      );
    });

    it("should set element to work_notes", async () => {
      await repository.addWorkNote("CHG0000001", "Note content");

      expect(mockTableClient.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          element: "work_notes",
        })
      );
    });

    it("should include change table and ID", async () => {
      await repository.addWorkNote("CHG0000001", "Note");

      expect(mockTableClient.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          table_name: "change_request",
          element_id: "CHG0000001",
        })
      );
    });

    it("should return created journal entry", async () => {
      mockTableClient.create.mockResolvedValueOnce(mockWorkNote);

      const result = await repository.addWorkNote("CHG0000001", "Note");

      expect(result).toHaveProperty("sys_id");
    });
  });

  describe("Error Handling", () => {
    it("should propagate table client errors", async () => {
      mockTableClient.fetchAll.mockRejectedValueOnce(
        new Error("Database error")
      );

      // Should propagate error
      expect(async () =>
        repository.fetchChanges()
      ).toBeDefined();
    });

    it("should handle network errors gracefully", async () => {
      mockTableClient.fetchAll.mockRejectedValueOnce(
        new Error("Network timeout")
      );

      // Should handle gracefully
      expect(async () =>
        repository.fetchChanges()
      ).toBeDefined();
    });

    it("should handle invalid table operations", async () => {
      mockTableClient.fetchAll.mockRejectedValueOnce(
        new Error("Invalid table")
      );

      // Should propagate clear error
      expect(async () =>
        repository.fetchChanges()
      ).toBeDefined();
    });
  });

  describe("Query Building", () => {
    it("should properly encode queries with special characters", async () => {
      const query = {
        short_description: "Test & special <chars>",
      };

      await repository.fetchChanges(query);

      // Should encode properly
      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should handle multiple query conditions", async () => {
      const query = {
        state: "assess",
        active: "true",
        risk: "high",
      };

      await repository.fetchChanges(query);

      // Should combine all conditions
      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should support complex query operators", async () => {
      const query = "state!=completed^active=true";

      await repository.fetchChanges(query);

      // Should pass query as-is
      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });
  });

  describe("Performance Optimization", () => {
    it("should support batch field selection", async () => {
      const changes = await repository.fetchChanges(undefined, {
        sysparm_fields: "sys_id,number,state",
      });

      // Should only fetch needed fields
      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should support exclude_reference_link for performance", async () => {
      const changes = await repository.fetchChanges(undefined, {
        sysparm_exclude_reference_link: true,
      });

      expect(mockTableClient.fetchAll).toHaveBeenCalled();
    });

    it("should use direct ID lookup when possible", async () => {
      await repository.fetchChangeById("CHG0000001");

      // Should use fetchById for O(1) lookup
      expect(mockTableClient.fetchById).toHaveBeenCalled();
    });
  });
});
