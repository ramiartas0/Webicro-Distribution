export async function waitForBuildProcessing(
  appId: string,
  buildNumber: string,
  token: string,
  options?: { maxWaitMs?: number; initialDelayMs?: number }
): Promise<string> {
  const maxWaitMs = options?.maxWaitMs ?? 30 * 60 * 1000;
  const initialDelayMs = options?.initialDelayMs ?? 5000;
  const startTime = Date.now();
  let delay = initialDelayMs;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(
      `https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch builds: ${res.statusText}`);
    }

    const data = await res.json() as { data: { id: string, attributes: { processingState: string } }[] };

    if (data.data && data.data.length > 0) {
      const build = data.data[0];
      if (build) {
        const state = build.attributes.processingState;
        if (state === 'VALID') {
          return build.id;
        }
        if (state === 'FAILED') {
          throw new Error('Build processing failed');
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 60000);
  }

  throw new Error('Timeout waiting for build to process');
}
