// The shrine of Captain Holder: pilgrims say three Hail Marys, leave an offering on the altar
// and pledge their allegiance to the Captain. Each respect paid keeps a candle lit for a day.
import { count, desc, gt } from "drizzle-orm";
import { useState } from "react";
import { data, Form, useNavigation } from "react-router";

import type { Route } from "./+types/shrine";
import { getDb } from "~/db/client.server";
import { shrineRespects } from "~/db/schema";
import { getViewer, signInUrl } from "~/lib/oojam-identity.server";
import { createRateLimiter, enforceRateLimit, type RateLimiter } from "~/lib/rate-limit.server";
import {
  blessingFor,
  CANDLE_COUNT,
  findOffering,
  formatRegisterTime,
  HAIL_MARYS,
  litCandles,
  OFFERINGS,
  parseRespects,
  plural,
  tallyOfferings,
} from "~/lib/shrine";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pilgrims shown in the parish register. */
const REGISTER_SIZE = 8;

export function meta(): Route.MetaDescriptors {
  return [
    { title: "The shrine of Captain Holder · oojam" },
    {
      name: "description",
      content: "Say three Hail Marys, leave an offering and pledge your allegiance to Captain Holder. Careful now.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = getViewer(request);
  const db = getDb();
  const [[total], [today], byOffering, register] = await Promise.all([
    db.select({ n: count() }).from(shrineRespects),
    db
      .select({ n: count() })
      .from(shrineRespects)
      .where(gt(shrineRespects.createdAt, new Date(Date.now() - DAY_MS))),
    db
      .select({ offering: shrineRespects.offering, n: count() })
      .from(shrineRespects)
      .groupBy(shrineRespects.offering),
    db
      .select({
        id: shrineRespects.id,
        login: shrineRespects.login,
        offering: shrineRespects.offering,
        createdAt: shrineRespects.createdAt,
      })
      .from(shrineRespects)
      .orderBy(desc(shrineRespects.id))
      .limit(REGISTER_SIZE),
  ]);
  return {
    total: total?.n ?? 0,
    lit: litCandles(today?.n ?? 0),
    altar: tallyOfferings(byOffering).map(({ offering, n }) => ({ id: offering.id, n })),
    register: register.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    viewer: viewer ? { login: viewer.login } : null,
    signInHref: signInUrl("/shrine"),
  };
}

type ActionResult = { error: string } | { paid: { id: number; offering: string; blessing: string } };

const respectLimiter = createRateLimiter({ capacity: 5, refillPerMinute: 1 });

/** enforceRateLimit throws a 429; turn it into a message the page can show. */
function overIpLimit(request: Request, limiter: RateLimiter, scope: string): boolean {
  try {
    enforceRateLimit(request, limiter, scope);
    return false;
  } catch (e) {
    if (e instanceof Response && e.status === 429) return true;
    throw e;
  }
}

export async function action({ request }: Route.ActionArgs) {
  const viewer = getViewer(request);
  if (
    overIpLimit(request, respectLimiter, "shrine") ||
    (viewer && !respectLimiter.take(`shrine-user|${viewer.githubId}`).ok)
  ) {
    return data<ActionResult>(
      { error: "Steady on. Even the Captain needs a moment between devotions. Try again in a minute." },
      { status: 429 },
    );
  }

  const respects = parseRespects(await request.formData());
  if (!respects.ok) return data<ActionResult>({ error: respects.error }, { status: 400 });

  const [row] = await getDb()
    .insert(shrineRespects)
    .values({ offering: respects.offering, githubId: viewer?.githubId, login: viewer?.login })
    .returning({ id: shrineRespects.id });
  const id = row?.id ?? 0;
  return data<ActionResult>({ paid: { id, offering: respects.offering, blessing: blessingFor(id) } });
}

const NOTICES = [
  "Lent is cancelled on Craggy Island-on-oojam until further notice. Please continue as you were.",
  "Tea will be served after every devotion. You will have some. There is no choice in this matter.",
  "Lost: one Golden Cleric award. If found, please return it to the parochial house, no questions asked.",
  "The cows in the field behind the shrine are not small. They are far away.",
  "Ecumenical questions will not be answered at this time.",
  "The Captain's hat is not to be worn, borrowed, sat on or kicked. Careful now.",
];

export default function Shrine({ loaderData, actionData }: Route.ComponentProps) {
  const { total, lit, altar, register, viewer, signInHref } = loaderData;
  const paid = actionData && "paid" in actionData ? actionData.paid : null;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <main className="mx-auto max-w-2xl px-6 pt-12 pb-16 sm:pt-16">
      <p className="text-sm">
        <a href="/">
          <span aria-hidden="true">←</span> oojam
        </a>
      </p>

      <header className="mt-8 text-center">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">Parish of the daily build</p>
        <h1 className="mt-3 text-4xl leading-tight font-black tracking-tight text-balance sm:text-5xl">
          The shrine of Captain Holder
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-muted">
          Say your three Hail Marys, leave an offering, and pledge your allegiance to the Captain.
        </p>
      </header>

      <figure className="mt-10">
        <ShrineArt lit={lit} />
        <figcaption className="mt-4 text-center text-muted">
          {plural(total, "pilgrim has", "pilgrims have")} pledged their allegiance.
          <br />
          {plural(lit, "candle")} of {CANDLE_COUNT} alight today.
        </figcaption>
      </figure>

      <div aria-hidden="true" className="mt-6 flex flex-wrap justify-center gap-4 font-black tracking-tight uppercase">
        <span className="-rotate-3 rounded-sm border-2 border-ink bg-panel px-3 py-1 shadow-sm">Careful now</span>
        <span className="rotate-2 rounded-sm border-2 border-ink bg-panel px-3 py-1 shadow-sm">
          Down with this sort of thing
        </span>
      </div>

      <section aria-labelledby="pay-respects" className="mt-14 rounded-xl border border-line bg-panel p-5 sm:p-7">
        <h2 id="pay-respects" className="text-2xl font-bold tracking-tight">
          Pay your respects
        </h2>
        <p className="mt-2 text-muted">
          {viewer ? (
            <>
              Your name goes in the parish register as <strong className="text-ink">@{viewer.login}</strong>.
            </>
          ) : (
            <>
              You'll be a humble, anonymous pilgrim. <a href={signInHref}>Sign in with GitHub</a> to be named in the
              parish register.
            </>
          )}
        </p>

        {paid ? <Blessing paid={paid} /> : null}
        {error ? (
          <p role="alert" className="mt-5 rounded-md border border-jam bg-jam-soft px-4 py-3 font-medium">
            {error}
          </p>
        ) : null}

        {/* Remounts after each respect paid, so the beads and offering start fresh. */}
        <RespectsForm key={paid?.id ?? "pilgrim"} />
      </section>

      <section aria-labelledby="altar" className="mt-14">
        <h2 id="altar" className="font-mono text-xs tracking-widest text-muted uppercase">
          On the altar
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {altar.map(({ id, n }) => {
            const offering = findOffering(id);
            if (!offering) return null;
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
                <span aria-hidden="true" className="text-2xl">
                  {offering.emoji}
                </span>
                <span className="min-w-0 flex-1">{offering.name}</span>
                <span className="font-mono font-semibold tabular-nums">
                  <span className="sr-only">: </span>
                  {n.toLocaleString("en-US")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="register" className="mt-14">
        <h2 id="register" className="font-mono text-xs tracking-widest text-muted uppercase">
          Parish register
        </h2>
        {register.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-line px-6 py-8 text-center text-muted">
            Nobody has paid their respects yet. The Captain is waiting. Patiently. Mostly.
          </p>
        ) : (
          <ol className="mt-5 divide-y divide-line border-y border-line">
            {register.map((entry) => {
              const offering = findOffering(entry.offering);
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-3">
                  <span className="font-semibold">
                    {entry.login ? (
                      <a href={`https://github.com/${entry.login}`}>@{entry.login}</a>
                    ) : (
                      "A humble pilgrim"
                    )}
                  </span>
                  <span className="text-muted">
                    left {offering ? offering.name.charAt(0).toLowerCase() + offering.name.slice(1) : "something"}
                  </span>
                  <time dateTime={entry.createdAt} className="ml-auto font-mono text-xs text-muted">
                    {formatRegisterTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="notices" className="mt-14">
        <h2 id="notices" className="font-mono text-xs tracking-widest text-muted uppercase">
          Parish notices
        </h2>
        <ul className="mt-5 space-y-3">
          {NOTICES.map((notice) => (
            <li key={notice} className="rounded-md border-l-4 border-jam bg-panel px-4 py-3 leading-relaxed">
              {notice}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about" className="mt-14">
        <h2 id="about" className="font-mono text-xs tracking-widest text-muted uppercase">
          About the Captain
        </h2>
        <div className="mt-5 space-y-4 leading-relaxed text-pretty">
          <p>
            Nobody on Craggy Island-on-oojam remembers exactly when the Captain arrived. Some say the Captain sailed in on
            the very first build. Others say the Captain was always here, simply holding things, and holding them very
            well.
          </p>
          <p>
            All agree on three points: the hat must be respected, the tea must be drunk, and the Hail Marys come in
            threes. That would be an ecumenical matter.
          </p>
          <p className="text-sm text-muted">
            Captain Holder is a figure of oojam legend. Any resemblance to a real sea captain is entirely
            far away.
          </p>
        </div>
      </section>
    </main>
  );
}

function Blessing({ paid }: { paid: { offering: string; blessing: string } }) {
  const offering = findOffering(paid.offering);
  return (
    <div role="status" className="mt-5 rounded-md border border-line bg-paper px-4 py-4">
      <p className="text-lg font-semibold">
        <span aria-hidden="true">🙏 </span>Your respects have been paid.
      </p>
      <p className="mt-1">{paid.blessing}</p>
      {offering ? (
        <p className="mt-2 text-sm text-muted">
          <span aria-hidden="true">{offering.emoji} </span>
          {offering.name} now rests on the altar. {offering.note}
        </p>
      ) : null}
    </div>
  );
}

const ORDINALS = ["first", "second", "third"];

function RespectsForm() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formAction === "/shrine";
  const [said, setSaid] = useState(0);

  return (
    <Form method="post" action="/shrine" preventScrollReset className="mt-6 space-y-6">
      <fieldset
        onChange={(e) => {
          const fieldset = e.currentTarget;
          setSaid(fieldset.querySelectorAll('input[name="hailMary"]:checked').length);
        }}
      >
        <legend className="font-semibold">
          <span aria-hidden="true">📿 </span>Three Hail Marys
        </legend>
        <p className="mt-1 text-sm text-muted">Tick each one as you say it. Quietly, or not. The Captain hears all.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: HAIL_MARYS }, (_, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 has-checked:border-jam has-checked:bg-jam-soft"
            >
              <input type="checkbox" name="hailMary" value={i + 1} className="h-4 w-4 accent-jam" />
              <span>Hail Mary, the {ORDINALS[i] ?? `${i + 1}th`}</span>
            </label>
          ))}
        </div>
        <p aria-live="polite" className="mt-2 text-sm text-muted">
          {said >= HAIL_MARYS
            ? "Three Hail Marys said. Lovely stuff."
            : `${plural(said, "Hail Mary", "Hail Marys")} said, ${HAIL_MARYS - said} to go.`}
        </p>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Leave an offering</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {OFFERINGS.map((offering, i) => (
            <label
              key={offering.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-paper px-4 py-3 has-checked:border-jam has-checked:bg-jam-soft"
            >
              <input
                type="radio"
                name="offering"
                value={offering.id}
                defaultChecked={i === 0}
                className="mt-1 h-4 w-4 shrink-0 accent-jam"
              />
              <span>
                <span className="font-medium">
                  <span aria-hidden="true">{offering.emoji} </span>
                  {offering.name}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{offering.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-jam px-6 py-3 font-semibold text-paper hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Saying the prayers…" : "Pledge allegiance and pay respects"}
      </button>
    </Form>
  );
}

const GOLD = "#d9a521";
const NAVY = "#1f2a44";

/** The shrine itself: a captain's hat under a halo in an arched alcove, with a shelf of candles. */
function ShrineArt({ lit }: { lit: number }) {
  return (
    <svg
      viewBox="0 0 200 240"
      role="img"
      aria-labelledby="shrine-art-title"
      className="mx-auto block w-full max-w-xs"
    >
      <title id="shrine-art-title">
        {`A shrine: Captain Holder's peaked cap beneath a golden halo, with ${lit} of ${CANDLE_COUNT} candles lit.`}
      </title>
      <circle cx="100" cy="92" r="64" fill={GOLD} opacity="0.18" />
      <path d="M26 232 V96 A74 74 0 0 1 174 96 V232 Z" className="fill-panel stroke-line" strokeWidth="3" />
      <path d="M44 200 V100 A56 56 0 0 1 156 100 V200 Z" className="fill-jam-soft" />

      {/* Halo */}
      <ellipse cx="100" cy="62" rx="30" ry="7" fill="none" stroke={GOLD} strokeWidth="3.5" />

      {/* The Captain's peaked cap */}
      <path d="M58 102 Q62 74 100 72 Q138 74 142 102 Q100 112 58 102 Z" fill="#fbfaf6" stroke={NAVY} strokeWidth="2" />
      <rect x="64" y="100" width="72" height="15" rx="3" fill={NAVY} />
      <line x1="68" y1="112" x2="132" y2="112" stroke={GOLD} strokeWidth="1.5" />
      <path d="M62 114 Q100 136 138 114 Q100 124 62 114 Z" fill="#111" />
      <circle cx="100" cy="106" r="6.5" fill={GOLD} />
      <circle cx="100" cy="106" r="3" className="fill-jam" />

      {/* Brass plaque */}
      <rect x="58" y="148" width="84" height="22" rx="3" fill={GOLD} />
      <text
        x="100"
        y="163"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="800"
        letterSpacing="1"
        fill="#1b1716"
        aria-hidden="true"
      >
        CAPT. HOLDER
      </text>

      {/* Shelf and candles */}
      <rect x="18" y="206" width="164" height="8" rx="2" fill="#7a4a2a" />
      {Array.from({ length: CANDLE_COUNT }, (_, i) => {
        const x = 34 + i * 22;
        const height = 14 + ((i * 5) % 9);
        const top = 206 - height;
        return (
          <g key={i}>
            <rect x={x - 4} y={top} width="8" height={height} rx="1.5" fill="#f5eedc" stroke="#c9bca4" />
            <line x1={x} y1={top} x2={x} y2={top - 3} stroke="#3b302a" strokeWidth="1" />
            {i < lit ? (
              <g className="shrine-flicker" style={{ animationDelay: `${(i * 0.37) % 1.6}s` }}>
                <path
                  d={`M${x} ${top - 15} Q${x + 5} ${top - 7} ${x} ${top - 2} Q${x - 5} ${top - 7} ${x} ${top - 15} Z`}
                  fill="#f6a623"
                />
                <path
                  d={`M${x} ${top - 10} Q${x + 2.5} ${top - 5} ${x} ${top - 3} Q${x - 2.5} ${top - 5} ${x} ${top - 10} Z`}
                  fill="#ffe27a"
                />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
