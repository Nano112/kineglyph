import { describe, expect, it, vi } from "vitest";
import {
  createIncrementalScheduler,
  createWorkerResolver,
  installWorkerResolver,
} from "../src/worker.js";

class Port {
  peer?: Port;
  readonly listeners = new Set<(event: MessageEvent) => void>();
  postMessage(message: unknown): void {
    queueMicrotask(() =>
      this.peer?.listeners.forEach((listener) => listener({ data: message } as MessageEvent)),
    );
  }
  addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }
}

describe("worker and incremental execution", () => {
  it("resolves serializable work across the worker protocol", async () => {
    const main = new Port();
    const worker = new Port();
    main.peer = worker;
    worker.peer = main;
    installWorkerResolver<number, number>(worker, (value) => value * 2);
    const resolver = createWorkerResolver<number, number>(main);
    await expect(resolver.resolve(21)).resolves.toBe(42);
    resolver.destroy();
  });

  it("coalesces bursts and reuses a bounded cache", async () => {
    const compute = vi.fn((value: number) => value * 3);
    const scheduler = createIncrementalScheduler(compute, { key: String, maxEntries: 2 });
    const first = scheduler.submit(1);
    const newest = scheduler.submit(2);
    await expect(first).resolves.toBe(6);
    await expect(newest).resolves.toBe(6);
    expect(compute).toHaveBeenCalledTimes(1);
    await expect(scheduler.submit(2)).resolves.toBe(6);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(scheduler.cacheSize).toBe(1);
    scheduler.destroy();
  });
});
