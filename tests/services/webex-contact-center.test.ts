import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getCapturesByTaskIds,
  downloadRecording,
  type WebexCapture,
  __private as webexPrivate,
} from "../../lib/services/webex-contact-center";

describe("Webex Contact Center - Captures", () => {
  beforeEach(() => {
    vi.useRealTimers();
    // Reset singleton client so tests can inject environment overrides
    webexPrivate.resetClient();
    process.env.WEBEX_CC_ACCESS_TOKEN = "test-token";
    process.env.WEBEX_CC_BASE_URL = "https://api.example.com";
    process.env.WEBEX_CC_CAPTURE_PATH = "v1/captures";
    process.env.WEBEX_CC_ORG_ID = "org-123";
    process.env.WEBEX_CC_CAPTURE_CHUNK_SIZE = "1";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.WEBEX_CC_ACCESS_TOKEN;
    delete process.env.WEBEX_CC_BASE_URL;
    delete process.env.WEBEX_CC_CAPTURE_PATH;
    delete process.env.WEBEX_CC_ORG_ID;
    delete process.env.WEBEX_CC_CAPTURE_CHUNK_SIZE;
  });

  it("fetches captures in chunks and normalizes payload", async () => {
    const payloadChunk1 = {
      items: [
        {
          id: "cap-1",
          taskId: "task-1",
          filepath: "https://downloads.example.com/cap-1",
          status: "completed",
          mediaType: "audio",
          format: "mp3",
          durationMs: 120_000,
        },
      ],
    };

    const payloadChunk2 = {
      items: [
        {
          captureId: "cap-2",
          task_id: "task-2",
          downloadUrl: "https://downloads.example.com/cap-2",
          status: "completed",
          media_type: "audio",
          mediaFormat: "wav",
          durationMillis: 90_000,
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payloadChunk1), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payloadChunk2), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const originalFetch = globalThis.fetch;
    // @ts-expect-error node typings
    globalThis.fetch = fetchMock;

    const captures = await getCapturesByTaskIds(["task-1", "task-2"], 600).finally(
      () => {
        // @ts-expect-error node typings
        globalThis.fetch = originalFetch;
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("taskId=task-1");
    expect(fetchMock.mock.calls[1][0]).toContain("taskId=task-2");

    expect(captures).toHaveLength(2);
    const byId = Object.fromEntries(captures.map((cap) => [cap.id, cap]));

    expect(byId["cap-1"]).toMatchObject<Partial<WebexCapture>>({
      id: "cap-1",
      taskId: "task-1",
      filepath: "https://downloads.example.com/cap-1",
      mediaType: "audio",
      format: "mp3",
      durationMs: 120_000,
    });

    expect(byId["cap-2"]).toMatchObject<Partial<WebexCapture>>({
      id: "cap-2",
      taskId: "task-2",
      filepath: "https://downloads.example.com/cap-2",
      mediaType: "audio",
      format: "wav",
      durationMs: 90_000,
    });
  });

  it("downloads a recording to disk with progress updates", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "webex-test-"));
    const destination = join(tmpDir, "recording.bin");

    const progressSpy = vi.fn();
    const body = new Uint8Array([1, 2, 3, 4, 5, 6]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(body.length),
        },
      }),
    );

    const originalFetch = globalThis.fetch;
    // @ts-expect-error stub
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const size = await downloadRecording("https://downloads.example.com/file", destination, {
      onProgress: progressSpy,
    }).finally(() => {
      // @ts-expect-error restore
      globalThis.fetch = originalFetch;
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(size).toBe(body.length);

    const fileContents = await readFile(destination);
    expect(Array.from(fileContents)).toEqual(Array.from(body));
    expect(progressSpy).toHaveBeenCalled();

    await rm(tmpDir, { recursive: true, force: true });
  });
});
