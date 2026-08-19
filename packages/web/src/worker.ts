export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  terminate?(): void;
}

interface WorkerRequest<Input> {
  readonly kind: "kineglyph:resolve";
  readonly id: number;
  readonly input: Input;
}

interface WorkerCancel {
  readonly kind: "kineglyph:cancel";
  readonly id: number;
}

interface WorkerResponse<Output> {
  readonly kind: "kineglyph:result";
  readonly id: number;
  readonly output?: Output;
  readonly error?: string;
}

export interface WorkerResolveOptions {
  readonly signal?: AbortSignal;
  readonly transfer?: readonly Transferable[];
}

export interface WorkerResolver<Input, Output> {
  resolve(input: Input, options?: WorkerResolveOptions): Promise<Output>;
  destroy(): void;
}

function abortReason(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason as unknown;
  return reason instanceof Error
    ? reason
    : new DOMException(typeof reason === "string" ? reason : "Aborted", "AbortError");
}

/** Typed RPC for moving serialization-safe resolve/plot work to an application-owned Worker. */
export function createWorkerResolver<Input, Output>(
  worker: WorkerLike,
): WorkerResolver<Input, Output> {
  let sequence = 0;
  let destroyed = false;
  const pending = new Map<
    number,
    {
      readonly resolve: (value: Output) => void;
      readonly reject: (reason: unknown) => void;
      readonly cleanup: () => void;
    }
  >();
  const onMessage = (event: MessageEvent<WorkerResponse<Output>>): void => {
    const message = event.data;
    if (message?.kind !== "kineglyph:result") return;
    const request = pending.get(message.id);
    if (request === undefined) return;
    pending.delete(message.id);
    request.cleanup();
    if (message.error !== undefined) request.reject(new Error(message.error));
    else request.resolve(message.output as Output);
  };
  worker.addEventListener("message", onMessage as (event: MessageEvent) => void);
  return {
    resolve(input, options = {}) {
      if (destroyed) return Promise.reject(new Error("worker resolver has been destroyed"));
      const id = ++sequence;
      return new Promise<Output>((resolve, reject) => {
        const abort = (): void => {
          if (!pending.delete(id)) return;
          worker.postMessage({ kind: "kineglyph:cancel", id } satisfies WorkerCancel);
          reject(abortReason(options.signal));
        };
        if (options.signal?.aborted === true) {
          reject(abortReason(options.signal));
          return;
        }
        const cleanup = (): void => options.signal?.removeEventListener("abort", abort);
        pending.set(id, { resolve, reject, cleanup });
        options.signal?.addEventListener("abort", abort, { once: true });
        worker.postMessage(
          { kind: "kineglyph:resolve", id, input } satisfies WorkerRequest<Input>,
          options.transfer === undefined ? undefined : [...options.transfer],
        );
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      worker.removeEventListener("message", onMessage as (event: MessageEvent) => void);
      for (const request of pending.values()) {
        request.cleanup();
        request.reject(new Error("worker resolver has been destroyed"));
      }
      pending.clear();
      worker.terminate?.();
    },
  };
}

export interface WorkerScopeLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** Installs the matching worker-side handler. Cancelled work is discarded before delivery. */
export function installWorkerResolver<Input, Output>(
  scope: WorkerScopeLike,
  resolve: (input: Input, signal: AbortSignal) => Output | Promise<Output>,
): void {
  const active = new Map<number, AbortController>();
  scope.addEventListener("message", (event: MessageEvent<WorkerRequest<Input> | WorkerCancel>) => {
    const message = event.data;
    if (message.kind === "kineglyph:cancel") {
      active.get(message.id)?.abort();
      active.delete(message.id);
      return;
    }
    if (message.kind !== "kineglyph:resolve") return;
    const controller = new AbortController();
    active.set(message.id, controller);
    void Promise.resolve(resolve(message.input, controller.signal))
      .then((output) => {
        if (!controller.signal.aborted)
          scope.postMessage({
            kind: "kineglyph:result",
            id: message.id,
            output,
          } satisfies WorkerResponse<Output>);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          scope.postMessage({
            kind: "kineglyph:result",
            id: message.id,
            error: error instanceof Error ? error.message : String(error),
          } satisfies WorkerResponse<Output>);
      })
      .finally(() => active.delete(message.id));
  });
}

export interface IncrementalSchedulerOptions<Input> {
  readonly key: (input: Input) => string;
  readonly maxEntries?: number;
  readonly schedule?: (flush: () => void) => () => void;
}

export interface IncrementalScheduler<Input, Output> {
  submit(input: Input): Promise<Output>;
  clear(): void;
  destroy(): void;
  readonly cacheSize: number;
}

/** Coalesces a burst to its newest input and retains a bounded deterministic result cache. */
export function createIncrementalScheduler<Input, Output>(
  compute: (input: Input) => Output | Promise<Output>,
  options: IncrementalSchedulerOptions<Input>,
): IncrementalScheduler<Input, Output> {
  const cache = new Map<string, Output>();
  let queued: Input | undefined;
  let waiters: Array<{ resolve: (output: Output) => void; reject: (error: unknown) => void }> = [];
  let cancel: (() => void) | undefined;
  let destroyed = false;
  const remember = (key: string, output: Output): void => {
    cache.delete(key);
    cache.set(key, output);
    while (cache.size > (options.maxEntries ?? 32)) cache.delete(cache.keys().next().value!);
  };
  const flush = (): void => {
    cancel = undefined;
    const input = queued;
    queued = undefined;
    const current = waiters;
    waiters = [];
    if (input === undefined) return;
    const key = options.key(input);
    const cached = cache.get(key);
    const task = cached === undefined ? Promise.resolve(compute(input)) : Promise.resolve(cached);
    void task.then(
      (output) => {
        remember(key, output);
        current.forEach((waiter) => waiter.resolve(output));
      },
      (error: unknown) => current.forEach((waiter) => waiter.reject(error)),
    );
  };
  const schedule = (): void => {
    if (cancel !== undefined) return;
    if (options.schedule !== undefined) cancel = options.schedule(flush);
    else {
      let live = true;
      queueMicrotask(() => {
        if (live) flush();
      });
      cancel = () => {
        live = false;
      };
    }
  };
  return {
    submit(input) {
      if (destroyed) return Promise.reject(new Error("incremental scheduler has been destroyed"));
      queued = input;
      schedule();
      return new Promise<Output>((resolve, reject) => waiters.push({ resolve, reject }));
    },
    clear: () => cache.clear(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel?.();
      cancel = undefined;
      const error = new Error("incremental scheduler has been destroyed");
      waiters.forEach((waiter) => waiter.reject(error));
      waiters = [];
      cache.clear();
    },
    get cacheSize() {
      return cache.size;
    },
  };
}
