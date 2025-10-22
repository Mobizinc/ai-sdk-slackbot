import { randomUUID } from "node:crypto";
import { Client } from "langsmith";

type AiGenerateText = typeof import("ai")["generateText"];
type GenerateTextArgs = Parameters<AiGenerateText>[0];
type GenerateTextReturn = Awaited<ReturnType<AiGenerateText>>;

let cachedClient: Client | null | undefined;

const defaultProjectName = "ai-sdk-slackbot";

function isTracingEnabled(): boolean {
  return (process.env.LANGSMITH_TRACING ?? "").toLowerCase() === "true";
}

function getClient(): Client | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  if (!isTracingEnabled()) {
    cachedClient = null;
    return cachedClient;
  }

  const apiKey = process.env.LANGSMITH_API_KEY?.trim();
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }

  try {
    cachedClient = new Client({
      apiKey,
      apiUrl: process.env.LANGSMITH_API_URL?.trim(),
    });
  } catch (error) {
    cachedClient = null;
    console.warn("[LangSmith] Failed to initialize client:", error);
  }

  if (cachedClient) {
    console.log(
      `[LangSmith] Tracing enabled (project: ${
        process.env.LANGSMITH_PROJECT?.trim() || defaultProjectName
      }).`,
    );
  }

  return cachedClient;
}

export function isLangSmithEnabled(): boolean {
  return !!getClient();
}

function toSafeValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value ?? null;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(toSafeValue);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      toSafeValue(val),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}

function toKvMap(value: unknown): Record<string, unknown> {
  const safe = toSafeValue(value);
  if (safe && typeof safe === "object" && !Array.isArray(safe)) {
    return safe as Record<string, unknown>;
  }
  return { value: safe };
}

function sanitizeMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    const role = (message as any)?.role ?? "unknown";
    const content = (message as any)?.content;

    if (typeof content === "string") {
      return { role, content };
    }

    if (Array.isArray(content)) {
      return {
        role,
        content: content
          .map((part) => {
            if (typeof part === "string") {
              return part;
            }
            if (typeof part === "object" && part && "text" in part) {
              return String((part as any).text);
            }
            if (typeof part === "object" && part && "type" in part) {
              return `[${String((part as any).type)}]`;
            }
            return "[Unsupported part]";
          })
          .join(""),
      };
    }

    return { role, content: "[Unsupported message content]" };
  });
}

function shouldSample(): boolean {
  const sampleRateRaw = process.env.LANGSMITH_SAMPLE_RATE;
  if (!sampleRateRaw) {
    return true;
  }

  const sampleRate = Number(sampleRateRaw);
  if (Number.isFinite(sampleRate) && sampleRate > 0 && sampleRate <= 1) {
    return Math.random() < sampleRate;
  }

  console.warn(
    `[LangSmith] Ignoring invalid LANGSMITH_SAMPLE_RATE="${sampleRateRaw}". Expected number between 0 and 1.`,
  );
  return true;
}

type RunContext = {
  runId?: string;
};

type StartRunOptions = {
  name: string;
  runType: string;
  inputs: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

async function startRun(options: StartRunOptions): Promise<RunContext> {
  const client = getClient();
  if (!client || !shouldSample()) {
    return {};
  }

  const { name, runType, inputs, metadata } = options;
  const projectName = process.env.LANGSMITH_PROJECT?.trim() || defaultProjectName;
  const tags = process.env.LANGSMITH_TAGS
    ? process.env.LANGSMITH_TAGS.split(",").map((tag) => tag.trim()).filter(Boolean)
    : [];

  const runId = randomUUID();

  try {
    await client.createRun({
      id: runId,
      project_name: projectName,
      name,
      run_type: runType,
      inputs,
      extra: {
        tags: ["ai-sdk-slackbot", ...tags],
        metadata: metadata ? toSafeValue(metadata) : undefined,
      },
      start_time: Date.now(),
    });

    return { runId };
  } catch (error) {
    console.warn("[LangSmith] Failed to create run:", error);
    return {};
  }
}

async function finalizeRun(
  context: RunContext,
  outputs?: unknown,
  error?: unknown,
) {
  const client = getClient();
  if (!client || !context.runId) {
    return;
  }

  try {
    await client.updateRun(context.runId, {
      outputs: error || outputs === undefined ? undefined : toKvMap(outputs),
      error: error
        ? error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error)
        : undefined,
      end_time: Date.now(),
    });
  } catch (patchError) {
    console.warn("[LangSmith] Failed to finalize run:", patchError);
  }
}

export async function traceGenerateText(
  args: GenerateTextArgs,
  execute: () => Promise<GenerateTextReturn>,
): Promise<GenerateTextReturn> {
  if (!isLangSmithEnabled()) {
    return execute();
  }

  const telemetry = {
    traceName: (args as any)?.metadata?.traceName,
    metadata: (args as any)?.metadata,
    parameters: {
      model: (args as any)?.model,
      maxTokens: (args as any)?.maxTokens,
      temperature: (args as any)?.temperature,
      topP: (args as any)?.topP,
      presencePenalty: (args as any)?.presencePenalty,
      frequencyPenalty: (args as any)?.frequencyPenalty,
      stopSequences: (args as any)?.stopSequences,
    },
  };

  const runName =
    (telemetry.traceName as string | undefined) ??
    (typeof args === "object" && args && "model" in args && typeof (args as any).model === "string"
      ? String((args as any).model)
      : "generate-text");

  const inputs = {
    model: (args as any)?.model,
    messages: sanitizeMessages((args as any)?.messages),
    parameters: toSafeValue(telemetry.parameters),
  } as Record<string, unknown>;

  const context = await startRun({
    name: runName,
    runType: "llm",
    inputs,
    metadata: telemetry.metadata ? toSafeValue(telemetry.metadata) as Record<string, unknown> : undefined,
  });

  try {
    const result = await execute();
    await finalizeRun(context, result);
    return result;
  } catch (error) {
    await finalizeRun(context, undefined, error);
    throw error;
  }
}

function summarizeEmbeddingOutput(result: unknown): Record<string, unknown> {
  if (Array.isArray(result) && result.every((value) => typeof value === "number")) {
    const vector = result as number[];
    const sample = vector.slice(0, 8);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    const mean = vector.reduce((sum, value) => sum + value, 0) / (vector.length || 1);

    return {
      dimensions: vector.length,
      sample,
      norm,
      mean,
    };
  }

  return toKvMap(result);
}

export async function traceEmbedding<T>(
  args: {
    model?: string;
    input: unknown;
    metadata?: Record<string, unknown>;
    summary?: (result: T) => unknown;
  },
  execute: () => Promise<T>,
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return execute();
  }

  const { model, input, metadata, summary } = args;
  const runName = model ? `embedding:${model}` : "embedding";

  const inputs = {
    model,
    input:
      typeof input === "string"
        ? input.length > 2000
          ? `${input.slice(0, 2000)}…`
          : input
        : toSafeValue(input),
  } as Record<string, unknown>;

  const context = await startRun({
    name: runName,
    runType: "embedding",
    inputs,
    metadata: metadata ? toSafeValue(metadata) as Record<string, unknown> : undefined,
  });

  try {
    const result = await execute();
    const outputSummary = summary ? summary(result) : summarizeEmbeddingOutput(result);
    await finalizeRun(context, outputSummary);
    return result;
  } catch (error) {
    await finalizeRun(context, undefined, error);
    throw error;
  }
}
