import Exa from "exa-js";
import { config } from "./config";

const exaApiKey = config.exaApiKey || process.env.EXA_API_KEY;

if (config.exaApiKey && !process.env.EXA_API_KEY) {
  process.env.EXA_API_KEY = config.exaApiKey;
}

export const exa = exaApiKey ? new Exa(exaApiKey) : null;
