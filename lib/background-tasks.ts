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
        task.catch((error) => {
          console.error("[background-tasks] Task rejected without waitUntil", error);
        });
      }
    })
    .catch((error) => {
      console.error("[background-tasks] Failed to schedule task", error);
      task.catch((taskError) => {
        console.error("[background-tasks] Task rejected after schedule failure", taskError);
      });
    });
}

export function __setWaitUntilForTests(waitUntilFn: WaitUntilFunction | null): void {
  cachedWaitUntil = waitUntilFn;
  loadWaitUntilPromise = null;
}
