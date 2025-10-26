/**
 * Unit Tests for Weather Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLegacyAgentTools } from "../../../lib/agent/tools/factory";
import type { CoreMessage } from "../../../lib/instrumented-ai";

describe("Weather Tool", () => {
  let tools: any;
  const mockUpdateStatus = vi.fn();
  const originalFetch = global.fetch;

  const createMockMessages = (): CoreMessage[] => [
    { role: "user", content: "What's the weather?" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create tools
    tools = createLegacyAgentTools({
      messages: createMockMessages(),
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Weather Tool - Success Cases", () => {
    it("should fetch weather data successfully", async () => {
      const mockWeatherData = {
        current: {
          temperature_2m: 22.5,
          weathercode: 3,
          relativehumidity_2m: 65,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockWeatherData),
      } as Response);

      const result = await tools.getWeather.execute({
        latitude: 40.7128,
        longitude: -74.006,
        city: "New York",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://api.open-meteo.com/v1/forecast")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("latitude=40.7128")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("longitude=-74.006")
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is getting weather for New York..."
      );
      expect(result).toEqual({
        temperature: 22.5,
        weatherCode: 3,
        humidity: 65,
        city: "New York",
      });
    });

    it("should handle different city names", async () => {
      const mockWeatherData = {
        current: {
          temperature_2m: 15.3,
          weathercode: 0,
          relativehumidity_2m: 45,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockWeatherData),
      } as Response);

      const result = await tools.getWeather.execute({
        latitude: 51.5074,
        longitude: -0.1278,
        city: "London",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is getting weather for London..."
      );
      expect(result.city).toBe("London");
    });

    it("should request correct weather parameters", async () => {
      const mockWeatherData = {
        current: {
          temperature_2m: 18.0,
          weathercode: 1,
          relativehumidity_2m: 50,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockWeatherData),
      } as Response);

      await tools.getWeather.execute({
        latitude: 48.8566,
        longitude: 2.3522,
        city: "Paris",
      });

      const fetchUrl = (global.fetch as any).mock.calls[0][0];
      expect(fetchUrl).toContain("current=temperature_2m,weathercode,relativehumidity_2m");
      expect(fetchUrl).toContain("timezone=auto");
    });
  });

  describe("Weather Tool - Error Handling", () => {
    it("should handle fetch errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(
        tools.getWeather.execute({
          latitude: 40.7128,
          longitude: -74.006,
          city: "New York",
        })
      ).rejects.toThrow("Network error");
    });

    it("should handle malformed API responses", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ current: {} }),
      } as Response);

      const result = await tools.getWeather.execute({
        latitude: 40.7128,
        longitude: -74.006,
        city: "New York",
      });

      expect(result.city).toBe("New York");
      expect(result.temperature).toBeUndefined();
      expect(result.weatherCode).toBeUndefined();
      expect(result.humidity).toBeUndefined();
    });
  });
});
