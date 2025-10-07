import crypto from "crypto";

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
  const secret = process.env.RELAY_WEBHOOK_SECRET;
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

  const signatureHeader = headers.get("x-relay-signature");
  const timestampHeader = headers.get("x-relay-timestamp");

  if (!signatureHeader || !timestampHeader) {
    return {
      ok: false,
      status: 401,
      message: "Missing relay signature headers",
    };
  }

  const timestamp = Number(timestampHeader);
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

  const baseString = `v1:${timestamp}:${rawBody}`;
  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(baseString)
    .digest("hex");
  const expectedSignature = `v1=${expectedDigest}`;

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(signatureHeader, "utf8");

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

  const baseString = `v1:${timestamp}:${rawBody}`;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(baseString)
    .digest("hex");

  return {
    signature: `v1=${digest}`,
    timestamp,
  };
}
