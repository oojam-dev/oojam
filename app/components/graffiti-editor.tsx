// The spray-can canvas for the graffiti wall. Draws onto a transparent canvas the size of
// one piece (at 2× for crisp lines), so whatever you paint lands straight on the bricks.
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "~/lib/graffiti";
import { BRICK_STYLE } from "~/components/graffiti-wall-style";

export type GraffitiEditorHandle = {
  /** The drawing as a PNG data URL. */
  toDataUrl(): string;
  clear(): void;
};

type Tool = "spray" | "marker" | "eraser";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "spray", label: "Spray can" },
  { id: "marker", label: "Marker" },
  { id: "eraser", label: "Eraser" },
];

const COLORS: { hex: string; name: string }[] = [
  { hex: "#111111", name: "Black" },
  { hex: "#ffffff", name: "White" },
  { hex: "#e6194b", name: "Red" },
  { hex: "#ff7a00", name: "Orange" },
  { hex: "#ffd60a", name: "Yellow" },
  { hex: "#3ccf4e", name: "Green" },
  { hex: "#00b4d8", name: "Cyan" },
  { hex: "#3a5bff", name: "Blue" },
  { hex: "#9b5de5", name: "Purple" },
  { hex: "#ff4fa3", name: "Pink" },
];

const MAX_UNDO = 20;

type Drip = { x: number; y: number; length: number; max: number; width: number; color: string };

export function GraffitiEditor({
  ref,
  onDirtyChange,
}: {
  ref?: Ref<GraffitiEditorHandle>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("spray");
  const [color, setColor] = useState("#e6194b");
  const [size, setSize] = useState(24);
  const [canUndo, setCanUndo] = useState(false);

  // Mutable drawing state that shouldn't trigger re-renders.
  const live = useRef({
    drawing: false,
    x: 0,
    y: 0,
    stillFrames: 0,
    frame: 0,
    drips: [] as Drip[],
    undo: [] as ImageData[],
    settings: { tool, color, size },
  });
  live.current.settings = { tool, color, size };

  const ctx = () => canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;

  // Tells the parent whether anything is on the canvas, so blank pieces can't be posted.
  function reportDirty() {
    const c = ctx();
    if (!c || !onDirtyChange) return;
    const pixels = c.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    let painted = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) {
        painted = true;
        break;
      }
    }
    onDirtyChange(painted);
  }

  useImperativeHandle(ref, () => ({
    toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
    clear: () => {
      const c = ctx();
      if (!c) return;
      c.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      live.current.undo = [];
      live.current.drips = [];
      setCanUndo(false);
      onDirtyChange?.(false);
    },
  }));

  useEffect(() => () => cancelAnimationFrame(live.current.frame), []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function spray(c: CanvasRenderingContext2D, x: number, y: number) {
    const { color, size } = live.current.settings;
    const radius = size;
    c.globalCompositeOperation = "source-over";
    c.fillStyle = color;
    const dots = Math.round(radius * 1.6);
    for (let i = 0; i < dots; i++) {
      // Squaring the distance packs paint towards the middle, like a real nozzle.
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() ** 1.6 * radius;
      const dot = Math.random() < 0.15 ? 3 : 2;
      c.fillRect(Math.round(x + Math.cos(angle) * r), Math.round(y + Math.sin(angle) * r), dot, dot);
    }
  }

  function tick() {
    const state = live.current;
    const c = ctx();
    if (!c) return;
    if (state.drawing && state.settings.tool === "spray") {
      spray(c, state.x, state.y);
      // Hold the can still for a moment and the paint starts to run.
      state.stillFrames++;
      if (state.stillFrames === 45 && state.drips.length < 40) {
        state.drips.push({
          x: state.x + (Math.random() - 0.5) * state.settings.size,
          y: state.y,
          length: 0,
          max: 20 + Math.random() * 60,
          width: 2 + Math.random() * 3,
          color: state.settings.color,
        });
        state.stillFrames = 20;
      }
    }
    c.globalCompositeOperation = "source-over";
    for (const drip of state.drips) {
      if (drip.length >= drip.max) continue;
      drip.length += 1.2;
      c.fillStyle = drip.color;
      c.beginPath();
      c.arc(drip.x, drip.y + drip.length, drip.width * (1 - (drip.length / drip.max) * 0.4), 0, Math.PI * 2);
      c.fill();
    }
    state.drips = state.drips.filter((d) => d.length < d.max);
    if (state.drawing || state.drips.length > 0) {
      state.frame = requestAnimationFrame(tick);
    } else {
      state.frame = 0;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ctx();
    if (!c || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state = live.current;
    state.undo.push(c.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    setCanUndo(true);
    const p = point(e);
    Object.assign(state, { drawing: true, x: p.x, y: p.y, stillFrames: 0 });
    if (state.settings.tool !== "spray") stroke(c, p.x, p.y, p.x, p.y);
    if (!state.frame) state.frame = requestAnimationFrame(tick);
  }

  function stroke(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const { tool, color, size } = live.current.settings;
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.lineWidth = tool === "eraser" ? size * 1.5 : size / 2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const state = live.current;
    if (!state.drawing) return;
    const c = ctx();
    if (!c) return;
    const p = point(e);
    const moved = Math.hypot(p.x - state.x, p.y - state.y);
    if (state.settings.tool === "spray") {
      // Fill in fast strokes so they don't break up into separate puffs.
      const steps = Math.floor(moved / (state.settings.size / 2));
      for (let i = 1; i <= steps; i++) {
        spray(c, state.x + ((p.x - state.x) * i) / (steps + 1), state.y + ((p.y - state.y) * i) / (steps + 1));
      }
      if (moved > 3) state.stillFrames = 0;
    } else {
      stroke(c, state.x, state.y, p.x, p.y);
    }
    state.x = p.x;
    state.y = p.y;
  }

  function onPointerUp() {
    if (!live.current.drawing) return;
    live.current.drawing = false;
    reportDirty();
  }

  function undo() {
    const c = ctx();
    const previous = live.current.undo.pop();
    if (!c || !previous) return;
    live.current.drips = [];
    c.putImageData(previous, 0, 0);
    setCanUndo(live.current.undo.length > 0);
    reportDirty();
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line" style={BRICK_STYLE}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          role="img"
          aria-label="Drawing canvas for your graffiti. Draw with a mouse, pen or finger."
          className="block aspect-[8/5] w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-4">
        <fieldset>
          <legend className="text-sm font-semibold">Tool</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TOOLS.map((t) => (
              <label
                key={t.id}
                className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm has-checked:border-jam has-checked:bg-jam-soft has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-jam"
              >
                <input
                  type="radio"
                  name="graffiti-tool"
                  value={t.id}
                  checked={tool === t.id}
                  onChange={() => setTool(t.id)}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="graffiti-size" className="block text-sm font-semibold">
            Size <span className="font-normal text-muted">({size})</span>
          </label>
          <input
            id="graffiti-size"
            type="range"
            min={6}
            max={60}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="mt-3 w-40 accent-jam"
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Colour</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <label
              key={c.hex}
              title={c.name}
              className="block h-8 w-8 cursor-pointer rounded-full border-2 border-line has-checked:ring-2 has-checked:ring-jam has-checked:ring-offset-2 has-checked:ring-offset-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-jam"
              style={{ backgroundColor: c.hex }}
            >
              <input
                type="radio"
                name="graffiti-color"
                value={c.hex}
                checked={color === c.hex}
                onChange={() => setColor(c.hex)}
                className="sr-only"
                aria-label={c.name}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-line bg-panel"
            />
            Any colour
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            const c = ctx();
            if (!c) return;
            live.current.undo.push(c.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
            if (live.current.undo.length > MAX_UNDO) live.current.undo.shift();
            setCanUndo(true);
            live.current.drips = [];
            c.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            onDirtyChange?.(false);
          }}
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          Wipe canvas
        </button>
      </div>
    </div>
  );
}
