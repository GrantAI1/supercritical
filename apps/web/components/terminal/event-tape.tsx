"use client";

import { useEffect, useState } from "react";

const POLL_MS = 5000;

type TapeEvent = {
  id: string;
  source: string;
  kind: string;
  severity: string;
  title: string;
  actor: string | null;
  is_change_point: boolean;
  occurred_at: string;
  service: string;
};

const SOURCE_TAGS: Record<string, { tag: string; class_name: string }> = {
  GITHUB: { tag: "GIT", class_name: "text-neutral-200" },
  VERCEL: { tag: "VRC", class_name: "text-terminal-amber" },
  NEON: { tag: "NEO", class_name: "text-terminal-green" },
  CLERK: { tag: "CLK", class_name: "text-purple-400" }
};

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: "text-terminal-red",
  ERROR: "text-terminal-red",
  WARN: "text-terminal-amber",
  INFO: "text-neutral-400",
  DEBUG: "text-terminal-dim"
};

export function EventTape() {
  const [events, setEvents] = useState<TapeEvent[] | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/events?limit=100", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { events: TapeEvent[] };
        if (active) {
          setEvents(data.events);
          setDegraded(false);
        }
      } catch {
        if (active) setDegraded(true);
      }
    }
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (events === null) {
    return <p className="p-4 text-xs text-terminal-dim">LOADING TAPE…</p>;
  }

  return (
    <div className="flex flex-col text-xs">
      <div className="flex items-center justify-between border-b border-terminal-grid pb-1">
        <span className="tracking-[0.2em] text-terminal-amber">EVENT TAPE</span>
        {degraded ? (
          <span className="text-terminal-red">FEED DEGRADED</span>
        ) : (
          <span className="flex items-center gap-1 text-terminal-dim">
            <span className="live-dot text-terminal-green">●</span> LIVE · 5s
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="py-4 text-terminal-dim">
          NO EVENTS YET — configure a webhook in settings → connections.
        </p>
      ) : (
        <table className="w-full">
          <tbody>
            {events.map((e) => {
              const src = SOURCE_TAGS[e.source] ?? { tag: e.source.slice(0, 3), class_name: "" };
              return (
                <tr
                  key={e.id}
                  className="border-b border-terminal-grid/50 leading-6 hover:bg-neutral-900/60"
                >
                  <td className="w-20 pr-2 text-terminal-dim">
                    {new Date(e.occurred_at).toLocaleTimeString("en-GB", { hour12: false })}
                  </td>
                  <td className={`w-10 pr-2 ${src.class_name}`}>{src.tag}</td>
                  <td className="w-56 truncate pr-2 text-terminal-dim">{e.kind}</td>
                  <td className={`truncate pr-2 ${SEVERITY_CLASSES[e.severity] ?? ""}`}>
                    {e.is_change_point ? "◆ " : ""}
                    {e.title}
                  </td>
                  <td className="w-32 truncate text-right text-terminal-dim">{e.service}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
