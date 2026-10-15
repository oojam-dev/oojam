// A live countdown to the next build. The server renders the value at request time and the
// browser ticks it, starting from the same number so hydration matches.
import { useEffect, useState } from "react";

import { formatCountdown, nextBuildAt } from "~/lib/countdown";

export function NextBuild({ serverNow }: { serverNow: number }) {
  const target = nextBuildAt(new Date(serverNow)).getTime();
  const [remaining, setRemaining] = useState(target - serverNow);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setRemaining(nextBuildAt(new Date(now)).getTime() - now);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-10 rounded-lg border border-line px-6 py-5">
      <p className="font-mono text-xs tracking-widest text-muted uppercase">Next build in</p>
      <p className="mt-1 font-mono text-4xl font-bold tabular-nums sm:text-5xl" role="timer" aria-live="off">
        {formatCountdown(remaining)}
      </p>
      <p className="mt-2 text-sm text-muted">
        At 00:00 UTC the top-voted idea freezes and Claude starts building it.
      </p>
    </div>
  );
}
