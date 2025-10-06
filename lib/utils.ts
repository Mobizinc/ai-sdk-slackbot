import Exa from "exa-js";

const exaApiKey = process.env.EXA_API_KEY;

export const exa = exaApiKey ? new Exa(exaApiKey) : null;
