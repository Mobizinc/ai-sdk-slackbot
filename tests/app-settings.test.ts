import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAppSetting, setAppSetting, getAppSettingWithFallback, APP_SETTING_KEYS } from "../lib/services/app-settings";
import { getDb } from "../lib/db/client";

// Mock dependencies
vi.mock("../lib/db/client");

describe("App Settings Service", () => {
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
      execute: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAppSetting", () => {
    it("should retrieve app setting by key", async () => {
      // Arrange
      const key = "ai_model_provider";
      const expectedValue = "openai";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ value: expectedValue }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await getAppSetting(key);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toBe(expectedValue);
    });

    it("should return null when setting not found", async () => {
      // Arrange
      const key = "nonexistent_setting";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await getAppSetting(key);

      // Assert
      expect(result).toBeNull();
    });

    it("should throw error when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const key = "test_setting";

      // Act & Assert
      await expect(getAppSetting(key)).rejects.toThrow("Neon database is not configured");
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      const key = "test_setting";

      mockDb.select.mockImplementation(() => {
        throw new Error("Database query failed");
      });

      // Act & Assert
      await expect(getAppSetting(key)).rejects.toThrow("Database query failed");
    });

    it("should ensure table exists before querying", async () => {
      // Arrange
      const key = "test_setting";
      const expectedValue = "test_value";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ value: expectedValue }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      await getAppSetting(key);

      // Assert
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "app_settings"')
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "idx_app_settings_updated"')
      );
    });
  });

  describe("setAppSetting", () => {
    it("should create or update app setting", async () => {
      // Arrange
      const key = "test_setting";
      const value = "test_value";

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        set: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await setAppSetting(key, value);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsert.values).toHaveBeenCalledWith({ key, value });
      expect(mockInsert.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.any(Object),
          set: {
            value,
            updatedAt: expect.any(Date),
          },
        })
      );
    });

    it("should ensure table exists before setting", async () => {
      // Arrange
      const key = "test_setting";
      const value = "test_value";

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        set: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await setAppSetting(key, value);

      // Assert
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "app_settings"')
      );
    });

    it("should throw error when database is not available", async () => {
      // Arrange
      vi.mocked(getDb).mockReturnValue(null);
      const key = "test_setting";
      const value = "test_value";

      // Act & Assert
      await expect(setAppSetting(key, value)).rejects.toThrow("Neon database is not configured");
    });

    it("should handle database errors gracefully", async () => {
      // Arrange
      const key = "test_setting";
      const value = "test_value";

      mockDb.insert.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      // Act & Assert
      await expect(setAppSetting(key, value)).rejects.toThrow("Database connection failed");
    });
  });

  describe("getAppSettingWithFallback", () => {
    it("should return setting value when it exists", async () => {
      // Arrange
      const key = "existing_setting";
      const expectedValue = "actual_value";
      const fallback = "fallback_value";

      vi.spyOn(require("../lib/services/app-settings"), 'getAppSetting')
        .mockResolvedValue(expectedValue);

      // Act
      const result = await getAppSettingWithFallback(key, fallback);

      // Assert
      expect(result).toBe(expectedValue);
    });

    it("should return fallback when setting does not exist", async () => {
      // Arrange
      const key = "missing_setting";
      const fallback = "fallback_value";

      vi.spyOn(require("../lib/services/app-settings"), 'getAppSetting')
        .mockResolvedValue(null);

      // Act
      const result = await getAppSettingWithFallback(key, fallback);

      // Assert
      expect(result).toBe(fallback);
    });

    it("should return null when setting does not exist and no fallback provided", async () => {
      // Arrange
      const key = "missing_setting";

      vi.spyOn(require("../lib/services/app-settings"), 'getAppSetting')
        .mockResolvedValue(null);

      // Act
      const result = await getAppSettingWithFallback(key);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null when setting is undefined and no fallback provided", async () => {
      // Arrange
      const key = "undefined_setting";

      vi.spyOn(require("../lib/services/app-settings"), 'getAppSetting')
        .mockResolvedValue(undefined);

      // Act
      const result = await getAppSettingWithFallback(key);

      // Assert
      expect(result).toBeNull();
    });

    it("should return fallback when setting is empty string", async () => {
      // Arrange
      const key = "empty_setting";
      const fallback = "fallback_value";

      vi.spyOn(require("../lib/services/app-settings"), 'getAppSetting')
        .mockResolvedValue("");

      // Act
      const result = await getAppSettingWithFallback(key, fallback);

      // Assert
      expect(result).toBe(fallback);
    });
  });

  describe("APP_SETTING_KEYS", () => {
    it("should contain expected setting keys", () => {
      // Assert
      expect(APP_SETTING_KEYS).toEqual({
        leaderboardChannel: "mobiz_leaderboard_channel",
        queueReportChannel: "mobiz_queue_report_channel",
      });
    });

    it("should have readonly keys", () => {
      // Assert
      expect(() => {
        (APP_SETTING_KEYS as any).leaderboardChannel = "modified";
      }).toThrow();
    });
  });

  describe("Integration scenarios", () => {
    it("should handle setting and getting configuration", async () => {
      // Arrange
      const key = "test_integration";
      const value = "integration_value";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ value }]),
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        set: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await setAppSetting(key, value);
      const retrievedValue = await getAppSetting(key);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.select).toHaveBeenCalled();
      expect(retrievedValue).toBe(value);
    });

    it("should handle concurrent operations", async () => {
      // Arrange
      const key = "concurrent_setting";
      const value1 = "value1";
      const value2 = "value2";

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        set: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      // Act
      await Promise.all([
        setAppSetting(key, value1),
        setAppSetting(key, value2),
      ]);

      // Assert
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it("should use predefined setting keys", async () => {
      // Arrange
      const channelValue = "C1234567890";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ value: channelValue }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      const result = await getAppSetting(APP_SETTING_KEYS.leaderboardChannel);

      // Assert
      expect(result).toBe(channelValue);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("Table creation", () => {
    it("should create table and index only once", async () => {
      // Arrange
      const key = "test_setting";
      const expectedValue = "test_value";

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ value: expectedValue }]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      // Act
      await getAppSetting(key);
      await getAppSetting(key); // Second call

      // Assert
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "app_settings"')
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS "idx_app_settings_updated"')
      );
      // Should only create table/index once
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });
});