import { describe, expect, it, vi } from "vitest";
import { createKeyedLiveData, reconnectDelay } from "../src/live.js";

describe("keyed live plot data", () => {
  it("batches keyed patches and retains a bounded newest-first window", async () => {
    const data = createKeyedLiveData<{ id: string; value: number }>({ key: "id", window: 3 });
    const listener = vi.fn();
    data.subscribe(listener);
    data.upsert([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ]);
    data.upsert({ id: "b", value: 20 });
    data.upsert({ id: "d", value: 4 });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(data.snapshot.rows).toEqual([
      { id: "c", value: 3 },
      { id: "b", value: 20 },
      { id: "d", value: 4 },
    ]);
    expect(data.snapshot.dropped).toBe(1);
    expect(Object.isFrozen(data.snapshot.rows)).toBe(true);
  });

  it("supports manual snapshots, replacement, removal, status, and teardown", () => {
    const data = createKeyedLiveData<{ id: number; value: number }>({ key: "id", batch: "manual" });
    data.replace([
      { id: 1, value: 10 },
      { id: 2, value: 20 },
    ]);
    data.remove(1);
    data.setStatus("open");
    expect(data.size).toBe(0);
    expect(data.flush()).toMatchObject({ sequence: 1, status: "open", size: 1 });
    expect(data.snapshot.rows).toEqual([{ id: 2, value: 20 }]);
    data.close();
    expect(() => data.upsert({ id: 3, value: 30 })).toThrow(/closed/);
  });

  it("defines deterministic bounded reconnect delays", () => {
    const policy = { retries: 4, delay: 250, maxDelay: 900, factor: 2 };
    expect([0, 1, 2, 3, 4].map((attempt) => reconnectDelay(attempt, policy))).toEqual([
      250,
      500,
      900,
      900,
      undefined,
    ]);
  });
});
