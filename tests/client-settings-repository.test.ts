import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClientSettingsRepository, getClientSettingsRepository } from "../lib/db/repositories/client-settings-repository";
import { getDb } from "../lib/db/client";
import type { NewClientSettings, NewCatalogRedirectLog } from "../lib/db/schema";

// Mock dependencies
vi.mock("../lib/db/client");

describe("ClientSettingsRepository", () => {
  let repository: ClientSettingsRepository;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock database
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);

    repository = new ClientSettingsRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getClientSettings", () => {
    it("should retrieve settings by client ID", async () => {
      // Arrange
      const clientId = "client_123";
      const expectedSettings = {
        id: 1,
        clientId: "client_123",
        clientName: "Test Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.5,
        catalogRedirectAutoClose: false,
        customCatalogMappings: [],
        features: {},
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([expectedSettings]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getClientSettings(clientId);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should return null when settings not found", async () => {
      // Arrange
      const clientId = "nonexistent_client";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getClientSettings(clientId);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const clientId = "client_123";

      // Act
      const result = await repository.getClientSettings(clientId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("getClientSettingsByName", () => {
    it("should retrieve settings by client name", async () => {
      // Arrange
      const clientName = "Test Corp";
      const expectedSettings = {
        id: 1,
        clientId: "client_123",
        clientName: "Test Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.5,
        catalogRedirectAutoClose: false,
        customCatalogMappings: [],
        features: {},
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([expectedSettings]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getClientSettingsByName(clientName);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should return null when settings not found by name", async () => {
      // Arrange
      const clientName = "Unknown Corp";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getClientSettingsByName(clientName);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("upsertClientSettings", () => {
    it("should create new client settings", async () => {
      // Arrange
      const settings: NewClientSettings = {
        clientId: "client_123",
        clientName: "Test Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.5,
        catalogRedirectAutoClose: false,
        customCatalogMappings: [],
        features: {},
      };

      const expectedSettings = {
        id: 1,
        ...settings,
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock getClientSettings to return null (not found)
      vi.spyOn(repository, 'getClientSettings').mockResolvedValue(null);

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedSettings]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      const result = await repository.upsertClientSettings(settings);

      // Assert
      expect(repository.getClientSettings).toHaveBeenCalledWith(settings.clientId);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should update existing client settings", async () => {
      // Arrange
      const settings: NewClientSettings = {
        clientId: "client_123",
        clientName: "Test Corp Updated",
        catalogRedirectEnabled: false,
        catalogRedirectConfidenceThreshold: 0.7,
        catalogRedirectAutoClose: true,
        customCatalogMappings: [],
        features: {},
      };

      const existingSettings = {
        id: 1,
        clientId: "client_123",
        clientName: "Test Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.5,
        catalogRedirectAutoClose: false,
        customCatalogMappings: [],
        features: {},
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const expectedSettings = {
        id: 1,
        ...settings,
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        updatedAt: new Date(),
      };

      // Mock getClientSettings to return existing settings
      vi.spyOn(repository, 'getClientSettings').mockResolvedValue(existingSettings);

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedSettings]),
      };

      mockDb.update.mockReturnValue(mockUpdate);

      // Act
      const result = await repository.upsertClientSettings(settings);

      // Assert
      expect(repository.getClientSettings).toHaveBeenCalledWith(settings.clientId);
      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should throw error when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      const settings: NewClientSettings = {
        clientId: "client_123",
        clientName: "Test Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.5,
        catalogRedirectAutoClose: false,
        customCatalogMappings: [],
        features: {},
      };

      // Act & Assert
      await expect(repository.upsertClientSettings(settings)).rejects.toThrow("Database not available");
    });
  });

  describe("updateClientSettings", () => {
    it("should update specific client settings fields", async () => {
      // Arrange
      const clientId = "client_123";
      const updates = {
        catalogRedirectEnabled: false,
        catalogRedirectConfidenceThreshold: 0.8,
      };

      const expectedSettings = {
        id: 1,
        clientId: "client_123",
        clientName: "Test Corp",
        ...updates,
        supportContactInfo: null,
        notes: null,
        createdBy: null,
        updatedBy: null,
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedSettings]),
      };

      mockDb.update.mockReturnValue(mockUpdate);

      // Act
      const result = await repository.updateClientSettings(clientId, updates);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should return null when updating non-existent settings", async () => {
      // Arrange
      const clientId = "nonexistent_client";
      const updates = { catalogRedirectEnabled: false };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };

      mockDb.update.mockReturnValue(mockUpdate);

      // Act
      const result = await repository.updateClientSettings(clientId, updates);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const clientId = "client_123";
      const updates = { catalogRedirectEnabled: false };

      // Act
      const result = await repository.updateClientSettings(clientId, updates);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("getAllClientSettings", () => {
    it("should retrieve all client settings", async () => {
      // Arrange
      const expectedSettings = [
        {
          id: 1,
          clientId: "client_123",
          clientName: "Test Corp",
          catalogRedirectEnabled: true,
          catalogRedirectConfidenceThreshold: 0.5,
          catalogRedirectAutoClose: false,
          customCatalogMappings: [],
          features: {},
          supportContactInfo: null,
          notes: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          clientId: "client_456",
          clientName: "Another Corp",
          catalogRedirectEnabled: false,
          catalogRedirectConfidenceThreshold: 0.7,
          catalogRedirectAutoClose: true,
          customCatalogMappings: [],
          features: {},
          supportContactInfo: null,
          notes: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(expectedSettings),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getAllClientSettings();

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should return empty array when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      // Act
      const result = await repository.getAllClientSettings();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("getClientsWithRedirectEnabled", () => {
    it("should retrieve clients with catalog redirect enabled", async () => {
      // Arrange
      const expectedSettings = [
        {
          id: 1,
          clientId: "client_123",
          clientName: "Test Corp",
          catalogRedirectEnabled: true,
          catalogRedirectConfidenceThreshold: 0.5,
          catalogRedirectAutoClose: false,
          customCatalogMappings: [],
          features: {},
          supportContactInfo: null,
          notes: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(expectedSettings),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await repository.getClientsWithRedirectEnabled();

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedSettings);
    });

    it("should return empty array when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);

      // Act
      const result = await repository.getClientsWithRedirectEnabled();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("logRedirect", () => {
    it("should log catalog redirect successfully", async () => {
      // Arrange
      const logData: NewCatalogRedirectLog = {
        caseNumber: "CASE001",
        caseSysId: "sys_123",
        clientId: "client_123",
        clientName: "Test Corp",
        requestType: "onboarding",
        confidence: 0.9,
        confidenceThreshold: 0.5,
        catalogItemsProvided: 1,
        caseClosed: true,
        catalogItemNames: ["HR Onboarding"],
        matchedKeywords: ["onboarding", "new hire"],
        submittedBy: "user@example.com",
        shortDescription: "New employee setup",
        category: "HR",
        subcategory: "Onboarding",
      };

      const mockInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await repository.logRedirect(logData);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsert.values).toHaveBeenCalledWith(logData);
    });

    it("should not throw error when logging fails", async () => {
      // Arrange
      const logData: NewCatalogRedirectLog = {
        caseNumber: "CASE001",
        caseSysId: "sys_123",
        clientId: "client_123",
        clientName: "Test Corp",
        requestType: "onboarding",
        confidence: 0.9,
        confidenceThreshold: 0.5,
        catalogItemsProvided: 1,
        caseClosed: true,
        catalogItemNames: ["HR Onboarding"],
        matchedKeywords: ["onboarding", "new hire"],
        submittedBy: "user@example.com",
        shortDescription: "New employee setup",
        category: "HR",
        subcategory: "Onboarding",
      };

      mockDb.insert.mockImplementation(() => {
        throw new Error("Database error");
      });

      // Act & Assert - should not throw
      await expect(repository.logRedirect(logData)).resolves.toBeUndefined();
    });

    it("should return early when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const logData: NewCatalogRedirectLog = {
        caseNumber: "CASE001",
        caseSysId: "sys_123",
        clientId: "client_123",
        clientName: "Test Corp",
        requestType: "onboarding",
        confidence: 0.9,
        confidenceThreshold: 0.5,
        catalogItemsProvided: 1,
        caseClosed: true,
        catalogItemNames: ["HR Onboarding"],
        matchedKeywords: ["onboarding", "new hire"],
        submittedBy: "user@example.com",
        shortDescription: "New employee setup",
        category: "HR",
        subcategory: "Onboarding",
      };

      // Act
      await repository.logRedirect(logData);

      // Assert
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("deleteClientSettings", () => {
    it("should delete client settings successfully", async () => {
      // Arrange
      const clientId = "client_123";

      const mockDelete = {
        where: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.delete.mockReturnValue(mockDelete);

      // Act
      const result = await repository.deleteClientSettings(clientId);

      // Assert
      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should return false when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const clientId = "client_123";

      // Act
      const result = await repository.deleteClientSettings(clientId);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when deletion fails", async () => {
      // Arrange
      const clientId = "client_123";

      mockDb.delete.mockImplementation(() => {
        throw new Error("Delete failed");
      });

      // Act
      const result = await repository.deleteClientSettings(clientId);

      // Assert
      expect(result).toBe(false);
    });
  });
});

describe("getClientSettingsRepository", () => {
  it("should return singleton instance", () => {
    const repo1 = getClientSettingsRepository();
    const repo2 = getClientSettingsRepository();
    expect(repo1).toBe(repo2);
  });

  it("should return ClientSettingsRepository instance", () => {
    const repo = getClientSettingsRepository();
    expect(repo).toBeInstanceOf(ClientSettingsRepository);
  });
});