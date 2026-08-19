import { describe, expect, it } from "vitest";
import { asciicast, parseAsciicast } from "./asciicast.js";
import { figure } from "./figure.js";
import { fragmentNodeIds } from "./fragment.js";

const V3 = `{"version":3,"term":{"cols":80,"rows":24},"title":"Build"}
# relative intervals
[0.25,"o","$ npm test\\r\\n"]
[2.5,"o","running\\r  " ]
[0.25,"o","48 passed\\r\\n"]
[0.1,"m","tests complete"]
[0.1,"x","0"]`;

const V2 = `{"version":2,"width":100,"height":30,"title":"Legacy"}
[0.5,"o","hello"]
[1.5,"o"," world\\n"]
[2.0,"r","120x40"]`;

describe("parseAsciicast", () => {
  it("normalizes relative v3 intervals, markers, exit status, speed, and idle limiting", () => {
    const recording = parseAsciicast(V3, { idleTimeLimit: 1, speed: 2 });
    expect(recording).toMatchObject({
      version: 3,
      columns: 80,
      rows: 24,
      title: "Build",
      exitStatus: 0,
    });
    expect(recording.events.map((event) => event.time)).toEqual([125, 625, 750, 800, 850]);
    expect(recording.markers).toEqual([{ time: 800, label: "tests complete" }]);
  });

  it("normalizes absolute v2 timestamps", () => {
    const recording = parseAsciicast(V2);
    expect(recording).toMatchObject({ version: 2, columns: 100, rows: 30, duration: 2000 });
    expect(recording.events.map((event) => event.time)).toEqual([500, 1500, 2000]);
  });

  it("reports malformed and unsupported recordings with their source line", () => {
    expect(() => parseAsciicast("# nope\n{}")).toThrow(/first line.*header/i);
    expect(() => parseAsciicast('{"version":4}\n')).toThrow(/unsupported version 4/);
    expect(() => parseAsciicast('{"version":3,"term":{"cols":80,"rows":24}}\nnope')).toThrow(
      /line 2/,
    );
  });
});

describe("asciicast", () => {
  it("compiles a recording into one portable terminal fragment with seekable text", () => {
    const result = asciicast(V3, { id: "build-cast", visibleRows: 8 });
    expect(result.handles).toEqual({
      root: "build-cast:terminal",
      screen: "build-cast:terminal-screen",
      text: "build-cast:terminal-line-1-text",
    });
    expect(fragmentNodeIds(result.fragment)).toEqual(
      expect.arrayContaining([
        "build-cast:terminal",
        "build-cast:terminal-chrome",
        "build-cast:terminal-screen",
        "build-cast:terminal-line-1-text",
      ]),
    );
    const text = result.fragment.nodes[0];
    expect(JSON.stringify(text)).toContain("48 passed");
    expect(result.fragment.tracks?.[0]).toMatchObject({
      target: "build-cast:terminal-line-1-text",
      property: "progress",
    });
    expect(result.fragment.tracks?.[0]?.keyframes.at(-1)?.value).toBe(1);
    expect(result.fragment.summary).toContain("asciicast v3");
  });

  it("composes through figure.add without rewriting its stable handles", () => {
    const recording = asciicast(V3, { id: "build-cast" });
    const scene = figure("recording", { title: "Recording" }, (f) => {
      const player = f.add(recording);
      f.root(f.stack([player]));
      f.sequence([f.reveal(player)]);
    });
    expect(JSON.stringify(scene.root)).toContain(recording.handles.text);
    expect(scene.timeline?.tracks.some((track) => track.target === recording.handles.text)).toBe(
      true,
    );
  });
});
