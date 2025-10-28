/**
 * Weather Tool
 *
 * Provides current weather information using the Open-Meteo API.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type WeatherToolInput = {
  latitude: number;
  longitude: number;
  city: string;
};

const weatherInputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  city: z.string(),
});

export function createWeatherTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "get_weather",
    description: "Fetches real-time weather data for a specific geographic location using the Open-Meteo API. This tool requires both latitude and longitude coordinates along with the city name for context. It returns current temperature in Celsius, weather conditions (via weather code), and relative humidity percentage. Use this tool when users ask about current weather, temperature, or conditions at a location. Note: This tool provides only current weather data, not historical information or extended forecasts beyond the immediate present.",
    inputSchema: weatherInputSchema,
    execute: async ({ latitude, longitude, city }: WeatherToolInput) => {
      updateStatus?.(`is getting weather for ${city}...`);

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
      );

      const weatherData = await response.json() as any;
      return {
        temperature: weatherData.current.temperature_2m,
        weatherCode: weatherData.current.weathercode,
        humidity: weatherData.current.relativehumidity_2m,
        city,
      };
    },
  });
}
