// The graffiti wall: signed-in visitors spray a piece, pick a free spot on the brick grid and
// leave it there, linked to a website of their choice. Hover a piece to see who painted it.
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { memo, useEffect, useRef, useState } from "react";
import { data, useFetcher, type ShouldRevalidateFunctionArgs } from "react-router";

import type { Route } from "./+types/wall";
import { GraffitiEditor, type GraffitiEditorHandle } from "~/components/graffiti-editor";
import { BRICK_STYLE } from "~/components/graffiti-wall-style";
import { getDb } from "~/db/client.server";
import { graffitiPieces, graffitiReports } from "~/db/schema";
import {
  canPlace,
  CELL_PX,
  dataUrlBytes,
  findFreeSpot,
  linkLabel,
  MAX_PNG_BYTES,
  PIECE_COLS,
  PIECE_ROWS,
  wallSize,
} from "~/lib/graffiti";
import { isSerializationFailure, parseLink, parsePngDataUrl } from "~/lib/graffiti.server";
import { getViewer, requireViewer, signInUrl } from "~/lib/oojam-identity.server";
import { createRateLimiter, enforceRateLimit } from "~/lib/rate-limit.server";
import { reporterKey, shouldHide } from "~/lib/ugc.server";

/** Pieces one artist can have on the wall at once. */
const MAX_PIECES_PER_ARTIST = 25;
/** A drawing is at most ~700 kB of base64 plus a few small fields. */
const MAX_BODY_BYTES = 1_000_000;

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Graffiti wall · oojam" },
    { name: "description", content: "A wall everyone can spray. Sign in with GitHub, paint a piece and put it up." },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = getViewer(request);
  const pieces = await getDb()
    .select({
      id: graffitiPieces.id,
      x: graffitiPieces.x,
      y: graffitiPieces.y,
      w: graffitiPieces.w,
      h: graffitiPieces.h,
      login: graffitiPieces.login,
      linkUrl: graffitiPieces.linkUrl,
    })
    .from(graffitiPieces)
    .where(isNull(graffitiPieces.hiddenAt))
    .orderBy(asc(graffitiPieces.id));
  return {
    pieces,
    size: wallSize(pieces),
    viewer: viewer ? { login: viewer.login } : null,
    signInHref: signInUrl("/wall"),
  };
}

// The wall needs a fresh look after a lost race for a spot (409), not only after successes.
export function shouldRevalidate({ actionStatus, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}

type ActionResult = { error?: string; painted?: number; reported?: number };

const paintLimiter = createRateLimiter({ capacity: 6, refillPerMinute: 0.2 });
const reportLimiter = createRateLimiter({ capacity: 10, refillPerMinute: 2 });

const fail = (error: string, status: number) => data<ActionResult>({ error }, { status });

/** enforceRateLimit throws a 429; turn it into an error message the page can show. */
function overIpLimit(request: Request, limiter: typeof paintLimiter, scope: string): boolean {
  try {
    enforceRateLimit(request, limiter, scope);
    return false;
  } catch (e) {
    if (e instanceof Response && e.status === 429) return true;
    throw e;
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("That piece is too detailed to save. Try fewer layers of spray.", 413);
  }
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "paint") return paint(request, form);
  if (intent === "report") return report(request, form);
  return fail("Unknown action.", 400);
}

async function paint(request: Request, form: FormData) {
  const viewer = requireViewer(request);
  if (overIpLimit(request, paintLimiter, "wall-paint") || !paintLimiter.take(`wall-paint-user|${viewer.githubId}`).ok) {
    return fail("Easy there! The paint needs to dry. You can add another piece in a few minutes.", 429);
  }

  const image = parsePngDataUrl(form.get("image"));
  if (!image.ok) return fail(image.error, 400);
  const link = parseLink(form.get("link"), `https://github.com/${viewer.login}`);
  if (!link.ok) return fail(link.error, 400);
  const x = Number(form.get("x"));
  const y = Number(form.get("y"));
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return fail("Pick a spot on the wall first.", 400);
  const spot = { x, y, w: PIECE_COLS, h: PIECE_ROWS };

  try {
    // Serializable, so two people can't both claim the same free spot at once.
    const result = await getDb().transaction(
      async (tx): Promise<ActionResult> => {
        const [mine] = await tx
          .select({ n: count() })
          .from(graffitiPieces)
          .where(and(eq(graffitiPieces.githubId, viewer.githubId), isNull(graffitiPieces.hiddenAt)));
        if ((mine?.n ?? 0) >= MAX_PIECES_PER_ARTIST) {
          return { error: `You already have ${MAX_PIECES_PER_ARTIST} pieces up. Leave some bricks for everyone else!` };
        }
        const pieces = await tx
          .select({ x: graffitiPieces.x, y: graffitiPieces.y, w: graffitiPieces.w, h: graffitiPieces.h })
          .from(graffitiPieces)
          .where(isNull(graffitiPieces.hiddenAt));
        if (!canPlace(spot, pieces, wallSize(pieces))) {
          return { error: "That spot is taken or off the wall. Pick a free spot." };
        }
        const [row] = await tx
          .insert(graffitiPieces)
          .values({
            githubId: viewer.githubId,
            login: viewer.login,
            ...spot,
            imagePng: image.png.toString("base64"),
            linkUrl: link.url,
          })
          .returning({ id: graffitiPieces.id });
        return { painted: row?.id };
      },
      { isolationLevel: "serializable" },
    );
    return result.error ? fail(result.error, 409) : data<ActionResult>(result);
  } catch (e) {
    if (isSerializationFailure(e)) return fail("Someone else just painted right there. Pick another spot.", 409);
    throw e;
  }
}

async function report(request: Request, form: FormData) {
  if (overIpLimit(request, reportLimiter, "wall-report")) {
    return fail("You've reported a lot just now. Please wait a moment.", 429);
  }
  const id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return fail("Bad request.", 400);
  await getDb().transaction(async (tx) => {
    const [piece] = await tx
      .select({ id: graffitiPieces.id })
      .from(graffitiPieces)
      .where(eq(graffitiPieces.id, id))
      .limit(1);
    if (!piece) return;
    const added = await tx
      .insert(graffitiReports)
      .values({ pieceId: id, reporter: reporterKey(request) })
      .onConflictDoNothing()
      .returning({ id: graffitiReports.id });
    if (added.length === 0) return; // this visitor already reported it
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(graffitiReports)
      .where(eq(graffitiReports.pieceId, id));
    if (shouldHide(row?.count ?? 0)) {
      await tx
        .update(graffitiPieces)
        .set({ hiddenAt: new Date() })
        .where(and(eq(graffitiPieces.id, id), isNull(graffitiPieces.hiddenAt)));
    }
  });
  return data<ActionResult>({ reported: id });
}

type Piece = Route.ComponentProps["loaderData"]["pieces"][number];
type Spot = { x: number; y: number };
type Mode = "view" | "draw" | "place";

export default function Wall({ loaderData }: Route.ComponentProps) {
  const { pieces, size, viewer, signInHref } = loaderData;
  const [mode, setMode] = useState<Mode>("view");
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [hover, setHover] = useState<Spot | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const editorRef = useRef<GraffitiEditorHandle>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const placeBarRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const paint = useFetcher<ActionResult>({ key: "wall-paint" });
  const painting = paint.state !== "idle";
  const free = spot ? canPlace({ ...spot, w: PIECE_COLS, h: PIECE_ROWS }, pieces, size) : false;

  // A finished paint request: either celebrate the new piece or show what went wrong.
  useEffect(() => {
    if (paint.state !== "idle" || !paint.data) return;
    if (paint.data.painted) {
      setMode("view");
      setDrawing(null);
      setSpot(null);
      setLink("");
      setDirty(false);
      setError(null);
      setHighlight(paint.data.painted);
    } else if (paint.data.error) {
      setError(paint.data.error);
    }
  }, [paint.state, paint.data]);

  // Bring a freshly painted piece into view, then let its glow fade.
  useEffect(() => {
    if (highlight === null) return;
    document.getElementById(`piece-${highlight}`)?.scrollIntoView({ block: "center", inline: "center" });
    const timer = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(timer);
  }, [highlight, pieces]);

  // Keep the placement rectangle on screen as it moves (arrow keys especially).
  useEffect(() => {
    if (mode === "place" && spot) ghostRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [mode, spot]);

  function startPlacing() {
    const url = editorRef.current?.toDataUrl() ?? "";
    if (!url) return;
    if (dataUrlBytes(url) > MAX_PNG_BYTES) {
      setError("That piece is too detailed to save. Try fewer layers of spray.");
      return;
    }
    const vp = viewportRef.current;
    const nearX = vp ? Math.round((vp.scrollLeft + vp.clientWidth / 2) / CELL_PX - PIECE_COLS / 2) : 0;
    const nearY = vp ? Math.round((vp.scrollTop + vp.clientHeight / 2) / CELL_PX - PIECE_ROWS / 2) : 0;
    setDrawing(url);
    setSpot(findFreeSpot(pieces, size, nearX, nearY) ?? { x: 0, y: 0 });
    setError(null);
    setMode("place");
    requestAnimationFrame(() => placeBarRef.current?.scrollIntoView({ block: "start" }));
  }

  function submit() {
    if (!drawing || !spot || !free) return;
    const form = new FormData();
    form.set("intent", "paint");
    form.set("image", drawing);
    form.set("x", String(spot.x));
    form.set("y", String(spot.y));
    form.set("link", link);
    setError(null);
    paint.submit(form, { method: "post", encType: "multipart/form-data" });
  }

  function cellAt(e: React.PointerEvent): Spot | null {
    const rect = wallRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
    return {
      x: clamp(Math.round((e.clientX - rect.left) / CELL_PX - PIECE_COLS / 2), size.cols - PIECE_COLS),
      y: clamp(Math.round((e.clientY - rect.top) / CELL_PX - PIECE_ROWS / 2), size.rows - PIECE_ROWS),
    };
  }

  // Mouse users can drag the wall to pan; touch scrolls natively. A click without a drag
  // picks the spot while placing.
  function onPointerDown(e: React.PointerEvent) {
    const vp = viewportRef.current;
    if (!vp || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (mode === "place" && e.pointerType === "mouse") setHover(cellAt(e));
    const d = drag.current;
    const vp = viewportRef.current;
    if (!d || !vp || e.pointerType !== "mouse") return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    vp.scrollLeft = d.left - dx;
    vp.scrollTop = d.top - dy;
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    } else if (mode === "place") {
      const cell = cellAt(e);
      if (cell) setSpot(cell);
    }
  }

  function onGhostKey(e: React.KeyboardEvent) {
    if (!spot) return;
    const step = e.shiftKey ? 4 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setSpot({
      x: Math.min(Math.max(spot.x + move[0], 0), size.cols - PIECE_COLS),
      y: Math.min(Math.max(spot.y + move[1], 0), size.rows - PIECE_ROWS),
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6">
      <p className="font-mono text-xs tracking-widest text-muted uppercase">
        <a href="/">oojam</a> / wall
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Graffiti wall</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-pretty">
        Grab a spray can, paint a piece and put it up wherever there&rsquo;s space. Every piece links to a
        website of its artist&rsquo;s choosing. Hover over one to see who painted it.
      </p>

      <div className="mt-6">
        {!viewer ? (
          <p className="rounded-lg border border-line bg-panel px-4 py-3">
            <a href={signInHref} className="font-semibold">
              Sign in with GitHub to paint
            </a>{" "}
            <span className="text-muted">and add your own piece to the wall.</span>
          </p>
        ) : mode === "view" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("draw");
              }}
              className="rounded-md bg-jam px-4 py-2 font-semibold text-paper hover:opacity-90"
            >
              Grab a spray can
            </button>
            <p className="text-sm text-muted">
              Painting as <a href={`https://github.com/${viewer.login}`}>@{viewer.login}</a> ·{" "}
              <a href="/_oojam/signout?return=/wall">Sign out</a>
            </p>
          </div>
        ) : null}
      </div>

      {viewer && mode !== "view" && (
        <section aria-labelledby="paint-heading" hidden={mode !== "draw"} className="mt-6 max-w-xl">
          <h2 id="paint-heading" className="text-xl font-bold">
            1. Paint your piece
          </h2>
          <p className="mt-1 text-sm text-muted">
            Hold the spray can still and the paint starts to drip. The bricks show through anywhere you leave blank.
          </p>
          <div className="mt-4">
            <GraffitiEditor ref={editorRef} onDirtyChange={setDirty} />
          </div>
          {error && mode === "draw" && (
            <p role="alert" className="mt-4 font-medium text-jam">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startPlacing}
              disabled={!dirty}
              className="rounded-md bg-jam px-4 py-2 font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next: put it on the wall
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="rounded-md border border-line px-4 py-2"
            >
              Cancel
            </button>
          </div>
          {!dirty && <p className="mt-2 text-sm text-muted">Paint something first.</p>}
        </section>
      )}

      {viewer && mode === "place" && (
        <section ref={placeBarRef} aria-labelledby="place-heading" className="mt-6 rounded-lg border border-line bg-panel p-4">
          <h2 id="place-heading" className="text-xl font-bold">
            2. Put it on the wall
          </h2>
          <p className="mt-1 text-sm text-muted">
            Click or tap the wall to move your piece, or focus it and use the arrow keys (Shift moves further).
          </p>
          <p aria-live="polite" className="mt-2 text-sm font-medium">
            {spot &&
              `Column ${spot.x + 1}, row ${spot.y + 1}: ${free ? "free, ready to spray." : "overlaps another piece. Move it to a free spot."}`}
          </p>
          <div className="mt-3 max-w-md">
            <label htmlFor="wall-link" className="block text-sm font-semibold">
              Link your piece to <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="wall-link"
              type="text"
              inputMode="url"
              autoComplete="url"
              maxLength={300}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://your-site.example"
              aria-describedby="wall-link-hint"
              className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2"
            />
            <p id="wall-link-hint" className="mt-1 text-sm text-muted">
              Leave it blank to link to your GitHub profile.
            </p>
          </div>
          {error && (
            <p role="alert" className="mt-3 font-medium text-jam">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={!free || painting}
              className="rounded-md bg-jam px-4 py-2 font-semibold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {painting ? "Spraying…" : "Spray it here"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("draw");
              }}
              disabled={painting}
              className="rounded-md border border-line bg-paper px-4 py-2"
            >
              Back to drawing
            </button>
          </div>
        </section>
      )}

      <div
        ref={viewportRef}
        tabIndex={0}
        role="region"
        aria-label="The graffiti wall. Scroll in any direction to explore."
        className="mt-6 h-[min(70vh,40rem)] overflow-auto rounded-lg border border-line"
      >
        <div
          ref={wallRef}
          className={`relative select-none ${mode === "place" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          style={{ ...BRICK_STYLE, width: size.cols * CELL_PX, height: size.rows * CELL_PX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {pieces.length === 0 && mode !== "place" && (
            <p className="pointer-events-none absolute top-6 left-6 max-w-xs rounded-md bg-paper/90 px-4 py-3 text-ink shadow">
              Fresh bricks. Nobody has painted here yet. Be the first!
            </p>
          )}
          {pieces.map((piece) => (
            <PieceView key={piece.id} piece={piece} placing={mode === "place"} highlighted={piece.id === highlight} />
          ))}
          {mode === "place" && hover && (!spot || hover.x !== spot.x || hover.y !== spot.y) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-ink/50"
              style={{
                left: hover.x * CELL_PX,
                top: hover.y * CELL_PX,
                width: PIECE_COLS * CELL_PX,
                height: PIECE_ROWS * CELL_PX,
              }}
            />
          )}
          {mode === "place" && spot && drawing && (
            <button
              ref={ghostRef}
              type="button"
              onKeyDown={onGhostKey}
              aria-label={`Your piece, at column ${spot.x + 1}, row ${spot.y + 1}${free ? "" : ", overlapping another piece"}. Use the arrow keys to move it.`}
              className={`absolute rounded-sm ring-4 ${free ? "ring-jam" : "ring-red-600"}`}
              style={{
                left: spot.x * CELL_PX,
                top: spot.y * CELL_PX,
                width: PIECE_COLS * CELL_PX,
                height: PIECE_ROWS * CELL_PX,
              }}
            >
              <img src={drawing} alt="" draggable={false} className={`h-full w-full ${free ? "" : "opacity-60"}`} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {pieces.length === 1 ? "1 piece" : `${pieces.length} pieces`} on {size.cols * CELL_PX} × {size.rows * CELL_PX} px of
        wall. It only grows when there&rsquo;s no room left for another piece.
      </p>
    </main>
  );
}

const PieceView = memo(function PieceView({
  piece,
  placing,
  highlighted,
}: {
  piece: Piece;
  placing: boolean;
  highlighted: boolean;
}) {
  const reporter = useFetcher<ActionResult>();
  const reported = reporter.data?.reported === piece.id;
  const host = linkLabel(piece.linkUrl);

  return (
    <div
      id={`piece-${piece.id}`}
      className={`group absolute rounded-sm ${placing ? "pointer-events-none" : ""} ${highlighted ? "ring-4 ring-jam" : ""}`}
      style={{ left: piece.x * CELL_PX, top: piece.y * CELL_PX, width: piece.w * CELL_PX, height: piece.h * CELL_PX }}
    >
      <a
        href={piece.linkUrl}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        draggable={false}
        tabIndex={placing ? -1 : undefined}
        className="block h-full w-full rounded-sm"
      >
        <img
          src={`/wall/piece/${piece.id}`}
          alt={`Graffiti by @${piece.login}`}
          width={piece.w * CELL_PX}
          height={piece.h * CELL_PX}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full"
        />
        <span className="sr-only">, links to {host} (opens in a new tab)</span>
      </a>
      <div className="absolute inset-x-1 bottom-1 flex items-center gap-2 rounded bg-paper/95 px-2 py-1 text-xs text-ink opacity-0 shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <a href={`https://github.com/${piece.login}`} tabIndex={placing ? -1 : undefined} className="font-semibold">
          @{piece.login}
        </a>
        <span className="min-w-0 truncate text-muted" aria-hidden="true">
          ↗ {host}
        </span>
        <reporter.Form method="post" className="ml-auto shrink-0">
          <input type="hidden" name="intent" value="report" />
          <input type="hidden" name="id" value={piece.id} />
          <button
            type="submit"
            disabled={reported || reporter.state !== "idle"}
            tabIndex={placing ? -1 : undefined}
            aria-label={reported ? "Reported" : `Report this graffiti by @${piece.login}`}
            className="text-muted underline decoration-1 underline-offset-2 hover:text-jam disabled:no-underline"
          >
            {reported ? "Reported" : reporter.data?.error ? "Try later" : "Report"}
          </button>
        </reporter.Form>
      </div>
    </div>
  );
});
