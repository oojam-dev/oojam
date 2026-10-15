// The home page: what oojam is, and the changelog of everything the community has built.
// New features may add links or sections here, but the changelog must stay.
import type { Route } from "./+types/home";
import { NextBuild } from "~/components/next-build";
import { loadBuilds, type BuildEntry } from "~/lib/builds";

const PLATFORM_URL = "https://build.oojam.dev";
const REPO_URL = "https://github.com/oojam-dev/oojam";
const SPONSOR_URL = "https://github.com/sponsors/oojam-dev";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "oojam" },
    {
      name: "description",
      content: "This site has no purpose. Every day, the community picks one idea and Claude builds it.",
    },
  ];
}

export function loader() {
  return { builds: loadBuilds(), serverNow: Date.now() };
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

function prLabel(prUrl: string): string {
  const number = /\/pull\/(\d+)\/?$/.exec(prUrl)?.[1];
  return number ? `PR #${number}` : "Pull request";
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { builds, serverNow } = loaderData;

  return (
    <div className="relative isolate overflow-hidden">
      {/* A soft blot of jam behind the wordmark. Decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[32rem] w-[48rem] -translate-x-1/2 rounded-full bg-jam opacity-[0.07] blur-3xl dark:opacity-[0.12]"
      />

      <main className="mx-auto max-w-2xl px-6 pt-20 pb-16 sm:pt-28">
        <header>
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            oojam.dev · day {builds.length}
          </p>
          <h1 className="mt-4 text-7xl leading-none font-black tracking-tighter sm:text-8xl">
            oojam
            <span aria-hidden="true" className="caret-blink ml-1 inline-block h-[0.72em] w-[0.09em] bg-jam align-baseline" />
          </h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-pretty sm:text-2xl">
            This site has no purpose. Every day, the community picks one idea and Claude builds it.
          </p>
          <p className="mt-6">
            <a href={PLATFORM_URL} className="font-medium">
              Propose or vote on the next idea <span aria-hidden="true">→</span>
            </a>
          </p>
          <NextBuild serverNow={serverNow} />
        </header>

        <section aria-labelledby="changelog" className="mt-20">
          <h2 id="changelog" className="font-mono text-xs tracking-widest text-muted uppercase">
            Changelog
          </h2>
          {builds.length === 0 ? <EmptyChangelog /> : <Changelog builds={builds} />}
        </section>
      </main>

      <footer className="mx-auto max-w-2xl px-6 pb-16 text-sm text-muted">
        <p>
          Built in public by the community and Claude. Open source under the MIT licence at{" "}
          <a href={REPO_URL}>github.com/oojam-dev/oojam</a>.
        </p>
        <p className="mt-2">
          oojam runs on donated credits. <a href={SPONSOR_URL}>Sponsor a build</a>; it pays for Claude, never for votes.
        </p>
      </footer>
    </div>
  );
}

function EmptyChangelog() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-lg font-semibold">Day zero. Nothing has been built yet.</p>
      <p className="mt-2 text-muted">
        The first idea is being chosen at <a href={PLATFORM_URL}>build.oojam.dev</a>.
      </p>
    </div>
  );
}

function Changelog({ builds }: { builds: BuildEntry[] }) {
  return (
    <ol className="mt-6 border-l border-line">
      {builds.map((build) => (
        <li key={`${build.day}-${build.ideaId}`} className="relative pb-10 pl-6 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[5px] h-[9px] w-[9px] rounded-full bg-jam ring-4 ring-paper"
          />
          <p className="font-mono text-xs text-muted">
            <time dateTime={build.day}>{formatDay(build.day)}</time>
          </p>
          <h3 className="mt-1 text-lg leading-snug font-semibold text-balance">{build.title}</h3>
          <p className="mt-1 leading-relaxed text-pretty">{build.summary}</p>
          <p className="mt-2 text-sm text-muted">
            {build.ideaId === null ? (
              "Housekeeping: no idea that day"
            ) : (
              <>
                Idea by <a href={`https://github.com/${build.author}`}>@{build.author}</a>
              </>
            )}
            <span aria-hidden="true"> · </span>
            <a href={build.prUrl}>{prLabel(build.prUrl)}</a>
          </p>
        </li>
      ))}
    </ol>
  );
}
