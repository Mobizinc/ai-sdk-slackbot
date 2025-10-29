import crypto from "crypto";
import { config } from "./config";

interface SignatureResultSuccess {
  ok: true;
  timestamp: number;
}

interface SignatureResultFailure {
  ok: false;
  status: number;
  message: string;
}

export type SignatureVerificationResult =
  | SignatureResultSuccess
  | SignatureResultFailure;

function resolveSecret(): string | null {
  const configured = config.relayWebhookSecret;
  if (configured && !process.env.RELAY_WEBHOOK_SECRET) {
    process.env.RELAY_WEBHOOK_SECRET = configured;
  }
  const secret = configured || process.env.RELAY_WEBHOOK_SECRET;
  if (!secret || secret.trim().length === 0) {
    return null;
  }
  return secret;
}

const DEFAULT_TOLERANCE_SECONDS = 60 * 5;

export function verifyRelaySignature({
  headers,
  rawBody,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}: {
  headers: Headers;
  rawBody: string;
  toleranceSeconds?: number;
}): SignatureVerificationResult {
  const secret = resolveSecret();
  if (!secret) {
    return {
      ok: false,
      status: 500,
      message: "Relay webhook secret is not configured",
    };
  }

  const signatureHeaderRaw = headers.get("x-relay-signature");
  const timestampHeaderRaw = headers.get("x-relay-timestamp");

  if (!signatureHeaderRaw && !timestampHeaderRaw) {
    return {
      ok: false,
      status: 401,
      message: "Missing relay signature headers",
    };
  }

  let providedSignature: string | undefined;
  let timestampValue: string | undefined = timestampHeaderRaw ?? undefined;

  if (signatureHeaderRaw) {
    const parts = signatureHeaderRaw.split(",").map((part) => part.trim());
    for (const part of parts) {
      if (part.startsWith("t=")) {
        timestampValue = part.slice(2);
      } else if (part.startsWith("v1=")) {
        providedSignature = part;
      }
    }
  }

  if (!providedSignature) {
    return {
      ok: false,
      status: 401,
      message: "Relay signature missing v1 hash",
    };
  }

  if (!timestampValue) {
    return {
      ok: false,
      status: 401,
      message: "Relay signature missing timestamp",
    };
  }

  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp)) {
    return {
      ok: false,
      status: 400,
      message: "Invalid relay timestamp header",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return {
      ok: false,
      status: 401,
      message: "Relay request timestamp outside allowable window",
    };
  }

  const baseString = `${timestamp}.${rawBody}`;
  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(baseString)
    .digest("hex");
  const expectedSignature = `v1=${expectedDigest}`;

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(providedSignature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return {
      ok: false,
      status: 401,
      message: "Relay signature mismatch",
    };
  }

  const valid = crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  if (!valid) {
    return {
      ok: false,
      status: 401,
      message: "Relay signature mismatch",
    };
  }

  return { ok: true, timestamp };
}

export function createRelaySignature(
  rawBody: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): { signature: string; timestamp: number } {
  const secret = resolveSecret();
  if (!secret) {
    throw new Error("Relay webhook secret is not configured");
  }

  const baseString = `${timestamp}.${rawBody}`;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(baseString)
    .digest("hex");

  return {
    signature: `t=${timestamp},v1=${digest}`,
    timestamp,
  };
}
