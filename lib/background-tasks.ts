// Extract the waitUntil type from the function signature
type WaitUntilFunction = typeof import("@vercel/functions").waitUntil;

type BackgroundTask = Promise<unknown>;

let cachedWaitUntil: WaitUntilFunction | null = null;
let loadWaitUntilPromise: Promise<WaitUntilFunction | null> | null = null;

async function loadWaitUntil(): Promise<WaitUntilFunction | null> {
  if (cachedWaitUntil) {
    return cachedWaitUntil;
  }

  if (!loadWaitUntilPromise) {
    loadWaitUntilPromise = import("@vercel/functions")
      .then((mod) => {
        cachedWaitUntil = mod.waitUntil;
        return cachedWaitUntil;
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[background-tasks] Failed to load @vercel/functions.waitUntil", error);
        }
        return null;
      });
  }

  return loadWaitUntilPromise;
}

export function enqueueBackgroundTask(task: BackgroundTask): void {
  if (cachedWaitUntil) {
    cachedWaitUntil(task);
    return;
  }

  loadWaitUntil()
    .then((waitUntilFn) => {
      if (waitUntilFn) {
        waitUntilFn(task);
      } else {
        console.error('[background-tasks] CRITICAL: waitUntil not available - task will not execute properly');
        console.error('[background-tasks] This indicates @vercel/functions failed to load or is not available');
        console.error('[background-tasks] Event handling may fail silently');
        // Task won't run properly but at least we log it clearly
        task.catch((error) => {
          console.error("[background-tasks] Task rejected without waitUntil:", error);
          console.error("[background-tasks] Stack trace:", error instanceof Error ? error.stack : String(error));
        });
      }
    })
    .catch((error) => {
      console.error("[background-tasks] CRITICAL: Failed to schedule background task", error);
      console.error("[background-tasks] Error details:", error instanceof Error ? error.stack : String(error));
      console.error("[background-tasks] This will cause Slack event handling to fail");
      task.catch((taskError) => {
        console.error("[background-tasks] Task rejected after schedule failure:", taskError);
        console.error("[background-tasks] Task error details:", taskError instanceof Error ? taskError.stack : String(taskError));
      });
    });
}

export function __setWaitUntilForTests(waitUntilFn: WaitUntilFunction | null): void {
  cachedWaitUntil = waitUntilFn;
  loadWaitUntilPromise = null;
}
