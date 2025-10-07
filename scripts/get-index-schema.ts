#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function getIndexSchema() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME;

  const url = `${endpoint}/indexes/${indexName}?api-version=2024-07-01`;

  const response = await fetch(url, {
    headers: {
      "api-key": apiKey!,
      "Content-Type": "application/json",
    },
  });

  const schema = await response.json();

  console.log("Index Schema Fields:\n");
  schema.fields?.forEach((field: any) => {
    console.log(`  ${field.name} (${field.type})`);
  });
}

getIndexSchema().catch(console.error);
