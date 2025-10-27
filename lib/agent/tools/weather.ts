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
    description: "Get the current weather at a location",
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
