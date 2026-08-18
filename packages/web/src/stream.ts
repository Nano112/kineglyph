export type WebSocketStreamStatus = "connecting" | "open" | "reconnecting" | "closed";

interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

type WebSocketConstructor = new (url: string | URL, protocols?: string | string[]) => WebSocketLike;

export interface WebSocketStreamOptions<T> {
  readonly protocols?: string | readonly string[];
  /** JSON.parse by default. */
  readonly parse?: (data: unknown) => T;
  readonly onMessage: (message: T) => void;
  readonly onStatus?: (status: WebSocketStreamStatus) => void;
  readonly onError?: (error: unknown) => void;
  /** Coalesce bursts to the newest message per animation frame (default true). */
  readonly coalesce?: boolean;
  readonly reconnect?:
    boolean | { readonly retries?: number; readonly delay?: number; readonly maxDelay?: number };
  /** Test/custom-runtime injection; browsers use the native WebSocket constructor. */
  readonly WebSocket?: WebSocketConstructor;
}

export interface WebSocketStream<T> {
  readonly status: WebSocketStreamStatus;
  readonly socket: WebSocketLike | undefined;
  readonly latest: T | undefined;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

const parseJson = <T>(data: unknown): T => {
  if (typeof data !== "string") return data as T;
  return JSON.parse(data) as T;
};

/**
 * A small WebSocket adapter for live figures and microcharts. Bursty feeds are coalesced to one
 * render per frame, and optional bounded exponential reconnect avoids every example reinventing
 * connection lifecycle code.
 */
export function connectWebSocket<T>(
  url: string | URL,
  options: WebSocketStreamOptions<T>,
): WebSocketStream<T> {
  const Constructor: WebSocketConstructor | undefined = options.WebSocket ?? globalThis.WebSocket;
  if (Constructor === undefined) throw new Error("WebSocket is not available in this environment");
  const parse = options.parse ?? parseJson<T>;
  const reconnect = options.reconnect;
  const retryLimit =
    reconnect === true
      ? Infinity
      : reconnect === false || reconnect === undefined
        ? 0
        : (reconnect.retries ?? Infinity);
  const retryDelay = typeof reconnect === "object" ? (reconnect.delay ?? 500) : 500;
  const maxDelay = typeof reconnect === "object" ? (reconnect.maxDelay ?? 10_000) : 10_000;
  // Start from a private sentinel value represented by the only public state that cannot be
  // observed before `open()` runs. This lets the first `connecting` notification fire while still
  // suppressing duplicate status callbacks later.
  let status: WebSocketStreamStatus = "closed";
  let socket: WebSocketLike | undefined;
  let latest: T | undefined;
  let queued: { readonly value: T } | undefined;
  let scheduled = false;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const setStatus = (next: WebSocketStreamStatus): void => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };
  const deliver = (message: T): void => {
    latest = message;
    options.onMessage(message);
  };
  const schedule = (message: T): void => {
    if (options.coalesce === false) return deliver(message);
    queued = { value: message };
    if (scheduled) return;
    scheduled = true;
    const run = (): void => {
      scheduled = false;
      const next = queued;
      queued = undefined;
      if (next !== undefined && !closed) deliver(next.value);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  };

  const open = (): void => {
    if (closed) return;
    setStatus(retries === 0 ? "connecting" : "reconnecting");
    const protocols = options.protocols;
    socket = new Constructor(
      url,
      protocols === undefined
        ? undefined
        : typeof protocols === "string"
          ? protocols
          : [...protocols],
    );
    socket.onopen = () => {
      retries = 0;
      setStatus("open");
    };
    socket.onmessage = (event) => {
      try {
        schedule(parse(event.data));
      } catch (error) {
        options.onError?.(error);
      }
    };
    socket.onerror = (event) => options.onError?.(event);
    socket.onclose = () => {
      socket = undefined;
      if (closed || retries >= retryLimit) {
        setStatus("closed");
        return;
      }
      const delay = Math.min(maxDelay, retryDelay * 2 ** retries);
      retries += 1;
      setStatus("reconnecting");
      reconnectTimer = setTimeout(open, delay);
    };
  };

  open();
  return {
    get status() {
      return status;
    },
    get socket() {
      return socket;
    },
    get latest() {
      return latest;
    },
    send(data) {
      if (socket === undefined || socket.readyState !== 1)
        throw new Error("WebSocket stream is not open");
      socket.send(data);
    },
    close(code, reason) {
      if (closed) return;
      closed = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket?.close(code, reason);
      socket = undefined;
      setStatus("closed");
    },
  };
}
