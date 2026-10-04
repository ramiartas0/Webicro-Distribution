export interface BuildPollingOptions {
  maxWaitMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

function createAbortError(): Error {
  const err = new Error('Apple build isleme beklemesi iptal edildi.');
  err.name = 'AbortError';
  return err;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min} dk ${sec} sn` : `${sec} sn`;
}

export async function waitForBuildProcessing(
  appId: string,
  buildNumber: string,
  token: string | (() => string),
  options?: BuildPollingOptions,
): Promise<string> {
  const maxWaitMs = options?.maxWaitMs ?? 30 * 60 * 1000;
  const initialDelayMs = options?.initialDelayMs ?? 5000;
  const maxDelayMs = options?.maxDelayMs ?? 60000;
  const signal = options?.signal;
  const report = options?.onProgress;
  const resolveToken = (): string => (typeof token === 'function' ? token() : token);
  const startTime = Date.now();
  let delay = initialDelayMs;

  while (Date.now() - startTime < maxWaitMs) {
    if (signal?.aborted) throw createAbortError();

    const res = await fetch(
      `https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}`,
      {
        headers: { Authorization: `Bearer ${resolveToken()}` },
        signal,
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch builds: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data?: { id: string; attributes: { processingState: string } }[];
    };

    const elapsed = formatElapsed(Date.now() - startTime);
    const build = data.data?.[0];
    if (build) {
      const state = build.attributes.processingState;
      if (state === 'VALID') {
        report?.(`Apple build islemeyi tamamladi: VALID (${elapsed})`);
        return build.id;
      }
      if (state === 'FAILED' || state === 'INVALID') {
        throw new Error(`Build processing failed (${state})`);
      }
      report?.(`Apple build isliyor: ${state} (${elapsed})`);
    } else {
      report?.(`Apple build kaydi bekleniyor... (${elapsed})`);
    }

    await abortableSleep(delay, signal);
    delay = Math.min(delay * 2, maxDelayMs);
  }

  throw new Error('Timeout waiting for build to process');
}
