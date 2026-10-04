export interface ParallelTaskResult<A, B> {
  first: A;
  second: B;
}

export interface ParallelRunOptions {
  /** Kullanicinin "Durdur" sinyali; abort edilirse iki goreve de iletilir. */
  parentSignal?: AbortSignal;
  /** true ise gorevlerden biri hata verdiginde digerinin sinyali abort edilir. */
  abortOnFailure?: boolean;
}

/**
 * Iki gorevi paralel calistirir.
 *
 * Promise.all'dan farki: bir gorev hata verdiginde DIGER gorevin de bitmesi (settle) beklenir.
 * Boylece cagiran taraf rollback karari verirken arka planda calismaya devam eden
 * bir gorev kalmaz (orn. Google taslagi olusmus ama henuz kaydedilmemis olamaz).
 *
 * Hata durumunda iptal kaynakli ikincil hata degil, ILK gercek hata firlatilir.
 */
export async function runParallelWithAbort<A, B>(
  first: (signal: AbortSignal) => Promise<A>,
  second: (signal: AbortSignal) => Promise<B>,
  options?: ParallelRunOptions,
): Promise<ParallelTaskResult<A, B>> {
  const controller = new AbortController();
  const parentSignal = options?.parentSignal;
  const abortOnFailure = options?.abortOnFailure ?? true;

  const onParentAbort = (): void => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const failure: { error: unknown; hasError: boolean } = { error: undefined, hasError: false };
  const track = async <T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    try {
      return await task(controller.signal);
    } catch (err: unknown) {
      if (!failure.hasError) {
        failure.hasError = true;
        failure.error = err;
      }
      if (abortOnFailure) controller.abort();
      throw err;
    }
  };

  try {
    const [firstResult, secondResult] = await Promise.allSettled([track(first), track(second)]);
    if (failure.hasError) {
      throw failure.error;
    }
    if (firstResult.status === 'fulfilled' && secondResult.status === 'fulfilled') {
      return { first: firstResult.value, second: secondResult.value };
    }
    // Teorik olarak ulasilamaz: rejected sonuc her zaman failure'i doldurur.
    throw new Error('Paralel gorevler beklenmedik sekilde tamamlanamadi.');
  } finally {
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
