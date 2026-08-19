/**
 * Renderer-agnostic keyed live data. It deliberately owns no socket and no DOM: transports feed
 * patches in, subscribers compile the immutable snapshots into plots, tables, or export frames.
 */

export type LiveDataStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";
export type LiveDataKey = string | number;

export interface ReconnectPolicy {
  readonly retries?: number;
  readonly delay?: number;
  readonly maxDelay?: number;
  /** Deterministic multiplier applied after every failed attempt (default 2). */
  readonly factor?: number;
}

export interface LiveDataSnapshot<Row> {
  readonly sequence: number;
  readonly status: LiveDataStatus;
  readonly rows: readonly Readonly<Row>[];
  readonly size: number;
  readonly dropped: number;
}

export type LiveDataPatch<Row> =
  | { readonly type: "upsert"; readonly rows: readonly Row[] }
  | { readonly type: "remove"; readonly keys: readonly LiveDataKey[] }
  | { readonly type: "replace"; readonly rows: readonly Row[] }
  | { readonly type: "status"; readonly status: LiveDataStatus };

export interface KeyedLiveDataOptions<Row extends object> {
  /** Row field used as the stable identity across snapshots. */
  readonly key: keyof Row & string;
  /** Keep only the newest N keyed rows. Omit for an unbounded store. */
  readonly window?: number;
  /** Flush enqueued patches in one microtask (default) or only when `flush()` is called. */
  readonly batch?: "microtask" | "manual";
  /** Force an early flush after this many queued patches (default 1,000). */
  readonly maxBatch?: number;
  readonly status?: LiveDataStatus;
}

export interface KeyedLiveDataHandle<Row extends object> {
  readonly key: keyof Row & string;
  readonly size: number;
  readonly status: LiveDataStatus;
  readonly snapshot: LiveDataSnapshot<Row>;
  enqueue(patch: LiveDataPatch<Row>): void;
  upsert(rows: Row | readonly Row[]): void;
  replace(rows: readonly Row[]): void;
  remove(keys: LiveDataKey | readonly LiveDataKey[]): void;
  setStatus(status: LiveDataStatus): void;
  flush(): LiveDataSnapshot<Row>;
  subscribe(listener: (snapshot: LiveDataSnapshot<Row>) => void): () => void;
  close(): void;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, Math.floor(value));
}

function rowKey<Row extends object>(row: Row, field: keyof Row & string): LiveDataKey {
  const value = row[field];
  if (typeof value !== "string" && typeof value !== "number")
    throw new TypeError(`live data key ${field} must be a string or number`);
  if (typeof value === "number" && !Number.isFinite(value))
    throw new TypeError(`live data key ${field} must be finite`);
  return value;
}

/** Bounded exponential backoff shared by WebSocket, SSE, polling, and test transports. */
export function reconnectDelay(attempt: number, policy: ReconnectPolicy = {}): number | undefined {
  const retries = policy.retries ?? Number.POSITIVE_INFINITY;
  const index = Math.max(0, Math.floor(attempt));
  if (index >= retries) return undefined;
  const delay = Math.max(0, policy.delay ?? 500);
  const maximum = Math.max(delay, policy.maxDelay ?? 10_000);
  const factor = Math.max(1, policy.factor ?? 2);
  return Math.min(maximum, delay * factor ** index);
}

export function createKeyedLiveData<Row extends object>(
  options: KeyedLiveDataOptions<Row>,
): KeyedLiveDataHandle<Row> {
  const key = options.key;
  const windowSize =
    options.window === undefined ? Number.POSITIVE_INFINITY : positiveInteger(options.window, 1);
  const maxBatch = positiveInteger(options.maxBatch, 1_000);
  const mode = options.batch ?? "microtask";
  const rows = new Map<LiveDataKey, Readonly<Row>>();
  const order: LiveDataKey[] = [];
  const pending: LiveDataPatch<Row>[] = [];
  const listeners = new Set<(snapshot: LiveDataSnapshot<Row>) => void>();
  let status = options.status ?? "idle";
  let sequence = 0;
  let dropped = 0;
  let scheduled = false;
  let closed = false;
  let current: LiveDataSnapshot<Row> = Object.freeze({
    sequence,
    status,
    rows: Object.freeze([]),
    size: 0,
    dropped: 0,
  });

  const assertOpen = (): void => {
    if (closed) throw new Error("keyed live data handle is closed");
  };

  const put = (row: Row): void => {
    const identity = rowKey(row, key);
    if (rows.has(identity)) {
      const index = order.indexOf(identity);
      if (index >= 0) order.splice(index, 1);
    }
    rows.set(identity, Object.freeze({ ...row }));
    order.push(identity);
  };

  const trim = (): void => {
    while (order.length > windowSize) {
      const identity = order.shift();
      if (identity !== undefined && rows.delete(identity)) dropped += 1;
    }
  };

  const publish = (): LiveDataSnapshot<Row> => {
    sequence += 1;
    current = Object.freeze({
      sequence,
      status,
      rows: Object.freeze(
        order.flatMap((identity) => {
          const row = rows.get(identity);
          return row === undefined ? [] : [row];
        }),
      ),
      size: rows.size,
      dropped,
    });
    for (const listener of listeners) listener(current);
    return current;
  };

  const flush = (): LiveDataSnapshot<Row> => {
    assertOpen();
    scheduled = false;
    if (pending.length === 0) return current;
    const patches = pending.splice(0);
    for (const patch of patches) {
      switch (patch.type) {
        case "upsert":
          patch.rows.forEach(put);
          break;
        case "replace":
          rows.clear();
          order.splice(0);
          patch.rows.forEach(put);
          break;
        case "remove":
          for (const identity of patch.keys) {
            rows.delete(identity);
            const index = order.indexOf(identity);
            if (index >= 0) order.splice(index, 1);
          }
          break;
        case "status":
          status = patch.status;
          break;
      }
    }
    trim();
    return publish();
  };

  const schedule = (): void => {
    if (pending.length >= maxBatch) {
      flush();
      return;
    }
    if (mode === "manual" || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      if (!closed && scheduled) flush();
    });
  };

  const enqueue = (patch: LiveDataPatch<Row>): void => {
    assertOpen();
    pending.push(patch);
    schedule();
  };

  return {
    key,
    get size() {
      return current.size;
    },
    get status() {
      return status;
    },
    get snapshot() {
      return current;
    },
    enqueue,
    upsert(next) {
      const nextRows: readonly Row[] = Array.isArray(next)
        ? (next as readonly Row[])
        : [next as Row];
      enqueue({ type: "upsert", rows: nextRows });
    },
    replace(next) {
      enqueue({ type: "replace", rows: next });
    },
    remove(next) {
      enqueue({ type: "remove", keys: Array.isArray(next) ? next : [next] });
    },
    setStatus(next) {
      enqueue({ type: "status", status: next });
    },
    flush,
    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      if (pending.length > 0) flush();
      closed = true;
      status = "closed";
      listeners.clear();
      pending.splice(0);
    },
  };
}
