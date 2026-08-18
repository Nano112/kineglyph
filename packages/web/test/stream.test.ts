import { afterEach, describe, expect, it, vi } from "vitest";
import { connectWebSocket } from "../src/stream.js";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: unknown[] = [];

  constructor(url: string | URL) {
    this.url = String(url);
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  message(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
});

describe("connectWebSocket", () => {
  it("parses JSON and coalesces a burst to the newest update", async () => {
    vi.useFakeTimers();
    const messages: unknown[] = [];
    const statuses: string[] = [];
    const stream = connectWebSocket<{ value: number }>("wss://example.test/live", {
      WebSocket: FakeSocket,
      onMessage: (message) => messages.push(message),
      onStatus: (status) => statuses.push(status),
    });
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message('{"value":1}');
    socket.message('{"value":2}');
    await vi.runAllTimersAsync();
    expect(messages).toEqual([{ value: 2 }]);
    expect(stream.latest).toEqual({ value: 2 });
    expect(statuses).toEqual(["connecting", "open"]);
    stream.send("ping");
    expect(socket.sent).toEqual(["ping"]);
    stream.close();
    expect(stream.status).toBe("closed");
  });

  it("reports parse failures and can deliver every message", () => {
    const messages: number[] = [];
    const errors: unknown[] = [];
    connectWebSocket<number>("wss://example.test/live", {
      WebSocket: FakeSocket,
      coalesce: false,
      parse: (data) => {
        if (data === "bad") throw new Error("bad payload");
        return Number(data);
      },
      onMessage: (message) => messages.push(message),
      onError: (error) => errors.push(error),
    });
    const socket = FakeSocket.instances[0]!;
    socket.message("1");
    socket.message("2");
    socket.message("bad");
    expect(messages).toEqual([1, 2]);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});
