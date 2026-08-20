import { mountMicrocharts } from "@kineglyph/web/micro";

const COLUMNS = 64;
const SOURCE_ROWS = 48;
const PLOT_ROWS = 24;
const SOURCE_ROWS_PER_PLOT = SOURCE_ROWS / PLOT_ROWS;
const TARGET_FPS = 24;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

const circle = (x, y, cx, cy, radius) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;

const ellipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

const segment = (x, y, x1, y1, x2, y2, width) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const amount = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const nearestX = x1 + amount * dx;
  const nearestY = y1 + amount * dy;
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= width ** 2;
};

const proceduralPixel = (x, y, seconds) => {
  const scene = (seconds % 12) / 3;
  const local = scene % 1;

  if (scene < 1) {
    const bounce = Math.sin(local * Math.PI) * 0.12;
    const appleY = 0.1 - bounce;
    const body =
      ellipse(x, y, -0.13, appleY, 0.34, 0.37) || ellipse(x, y, 0.13, appleY, 0.34, 0.37);
    const notch = circle(x, y, 0, appleY - 0.31, 0.12);
    const stem = segment(x, y, 0.02, appleY - 0.31, 0.11, appleY - 0.51, 0.025);
    const leaf = ellipse(x, y, 0.21, appleY - 0.43, 0.2, 0.07);
    return (body && !notch) || stem || leaf;
  }

  if (scene < 2) {
    const flap = 0.16 + Math.sin(local * Math.PI * 4) * 0.13;
    const travel = -1.15 + local * 2.3;
    const body = ellipse(x, y, travel, 0.02, 0.23, 0.1);
    const leftWing = segment(x, y, travel - 0.04, 0, travel - 0.55, -flap, 0.055);
    const rightWing = segment(x, y, travel + 0.04, 0, travel + 0.55, -flap, 0.055);
    const tail =
      segment(x, y, travel - 0.19, 0.02, travel - 0.42, 0.16, 0.035) ||
      segment(x, y, travel - 0.19, 0.02, travel - 0.42, -0.12, 0.035);
    return body || leftWing || rightWing || tail;
  }

  if (scene < 3) {
    const reveal = -0.9 + local * 1.8;
    const head = circle(x, y, 0.02, -0.02, 0.55);
    const faceCut = ellipse(x, y, 0.3, -0.04, 0.33, 0.42);
    const neck = x > -0.22 && x < 0.16 && y > 0.3 && y < 0.58;
    const eye = ellipse(x, y, 0.04, -0.13, 0.055, 0.025);
    return x < reveal && ((head && !faceCut) || neck || eye);
  }

  const curtain = Math.sin(x * 8 + local * Math.PI * 2) * 0.12;
  const ring = Math.abs(Math.hypot(x, y) - (0.18 + local * 0.52)) < 0.045;
  const horizon = y > curtain && y < curtain + 0.08;
  return ring || horizon;
};

const proceduralFrame = (seconds) =>
  Array.from({ length: SOURCE_ROWS }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => {
      const x = ((column + 0.5) / COLUMNS) * 2 - 1;
      const y = ((row + 0.5) / SOURCE_ROWS) * 1.125 - 0.5625;
      return proceduralPixel(x, y, seconds) ? 1 : 0;
    }),
  );

const plotRowsFor = (sourceRows) =>
  Array.from({ length: PLOT_ROWS }, (_, plotRow) =>
    Array.from({ length: COLUMNS }, (_, column) => {
      let total = 0;
      for (let offset = 0; offset < SOURCE_ROWS_PER_PLOT; offset += 1)
        total += sourceRows[plotRow * SOURCE_ROWS_PER_PLOT + offset][column];
      return total / SOURCE_ROWS_PER_PLOT;
    }),
  );

export function mountMicrochartCinema() {
  const screen = document.querySelector("#cinema-screen");
  if (screen === null) return;

  const toggle = document.querySelector("#cinema-toggle");
  const demo = document.querySelector("#cinema-demo");
  const invertButton = document.querySelector("#cinema-invert");
  const file = document.querySelector("#cinema-file");
  const sourceReadout = document.querySelector("#cinema-source");
  const frameReadout = document.querySelector("#cinema-frame");
  const fpsReadout = document.querySelector("#cinema-fps");
  const video = document.querySelector("#cinema-video");

  const firstFrame = plotRowsFor(proceduralFrame(0));
  screen.innerHTML = firstFrame
    .map(
      (values, row) =>
        `<span data-plot="P${String(row + 1).padStart(2, "0")}" data-kineglyph-microchart="bar" data-kineglyph-key="cinema-${row}">${values.join(",")}</span>`,
    )
    .join("");

  const charts = mountMicrocharts(screen, {
    defer: false,
    type: "bar",
    width: COLUMNS,
    height: 2,
    min: 0,
    max: 1,
    padding: 0.2,
    minimumBarSize: 0,
    fill: "currentColor",
  });
  charts.flush();

  const canvas = document.createElement("canvas");
  canvas.width = COLUMNS;
  canvas.height = SOURCE_ROWS;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  let source = "demo";
  let objectUrl;
  let playing = false;
  let inverted = false;
  let animationFrame;
  let previousFrame = 0;
  let demoOffset = 0;
  let demoStarted = performance.now();
  let sampleWindowStarted = performance.now();
  let framesInWindow = 0;
  let droppedFrames = 0;

  const videoFrame = () => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, COLUMNS, SOURCE_ROWS);
    context.drawImage(video, 0, 0, COLUMNS, SOURCE_ROWS);
    const pixels = context.getImageData(0, 0, COLUMNS, SOURCE_ROWS).data;
    return Array.from({ length: SOURCE_ROWS }, (_, row) =>
      Array.from({ length: COLUMNS }, (_, column) => {
        const offset = (row * COLUMNS + column) * 4;
        const luminance =
          pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
        const value = luminance / 255;
        return inverted ? 1 - value : value;
      }),
    );
  };

  const paint = (rows) => {
    const updates = {};
    rows.forEach((values, row) => {
      updates[`cinema-${row}`] =
        inverted && source === "demo" ? values.map((value) => 1 - value) : values;
    });
    const started = performance.now();
    charts.setMany(updates);
    charts.flush();
    const elapsed = performance.now() - started;
    frameReadout.textContent = `${elapsed < 10 ? elapsed.toFixed(2) : elapsed.toFixed(1)} ms update`;
    if (elapsed > FRAME_INTERVAL) droppedFrames += Math.floor(elapsed / FRAME_INTERVAL);
  };

  const renderCurrentFrame = (timestamp = performance.now()) => {
    if (source === "video" && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      paint(plotRowsFor(videoFrame()));
    else paint(plotRowsFor(proceduralFrame((timestamp - demoStarted) / 1000)));
  };

  const stop = () => {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(animationFrame);
    if (source === "video") video.pause();
    else demoOffset = (performance.now() - demoStarted) / 1000;
    toggle.textContent = "Play";
    toggle.setAttribute("aria-pressed", "false");
  };

  const loadVideoSource = (url, label) => {
    stop();
    source = "video";
    video.src = url;
    video.load();
    sourceReadout.textContent = `Loading ${label}…`;
    video.addEventListener(
      "loadeddata",
      () => {
        sourceReadout.textContent = `${label} · ${video.videoWidth}×${video.videoHeight}`;
        renderCurrentFrame();
      },
      { once: true },
    );
  };

  const loop = (timestamp) => {
    if (!playing) return;
    animationFrame = requestAnimationFrame(loop);
    if (previousFrame === 0) previousFrame = timestamp - FRAME_INTERVAL;
    if (timestamp - previousFrame < FRAME_INTERVAL) return;
    const intervals = Math.floor((timestamp - previousFrame) / FRAME_INTERVAL);
    droppedFrames += Math.max(0, intervals - 1);
    previousFrame += intervals * FRAME_INTERVAL;
    renderCurrentFrame(timestamp);
    framesInWindow += 1;
    if (timestamp - sampleWindowStarted >= 1000) {
      const fps = (framesInWindow * 1000) / (timestamp - sampleWindowStarted);
      fpsReadout.textContent = `${fps.toFixed(1)} fps · ${droppedFrames} dropped`;
      sampleWindowStarted = timestamp;
      framesInWindow = 0;
      droppedFrames = 0;
    }
  };

  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    if (source === "video") {
      try {
        await video.play();
      } catch (error) {
        sourceReadout.textContent = `Could not play: ${error.message}`;
        return;
      }
    } else demoStarted = performance.now() - demoOffset * 1000;
    playing = true;
    previousFrame = 0;
    sampleWindowStarted = performance.now();
    framesInWindow = 0;
    droppedFrames = 0;
    toggle.textContent = "Pause";
    toggle.setAttribute("aria-pressed", "true");
    animationFrame = requestAnimationFrame(loop);
  };

  toggle.addEventListener("click", play);
  invertButton.addEventListener("click", () => {
    inverted = !inverted;
    invertButton.setAttribute("aria-pressed", String(inverted));
    renderCurrentFrame();
  });
  demo.addEventListener("click", () => {
    stop();
    video.removeAttribute("src");
    video.load();
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    source = "demo";
    demoOffset = 0;
    demoStarted = performance.now();
    sourceReadout.textContent = "Procedural silhouette reel";
    renderCurrentFrame();
  });
  file.addEventListener("change", () => {
    const selected = file.files?.[0];
    if (selected === undefined) return;
    stop();
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(selected);
    loadVideoSource(objectUrl, selected.name);
  });
  video.addEventListener("ended", stop);

  renderCurrentFrame();
}
