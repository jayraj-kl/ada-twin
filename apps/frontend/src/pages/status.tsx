import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  WifiOffIcon,
} from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DAYS, type Day, type DayState, componentDays, uptime } from "@/status/days";
import {
  COMPONENTS,
  type CheckResult,
  type ComponentId,
  type History,
  type Results,
  fetchHistory,
} from "@/status/history";
import { type Incident, allIncidents } from "@/status/incidents";
import { checkNow } from "@/status/live";

const LIVE_EVERY_MS = 60_000;
const HISTORY_EVERY_MS = 5 * 60_000;
// Past incidents lists this many days, today included.
const INCIDENT_DAYS = 14;

/** Checks from this browser every minute, and reloads the history. */
function useStatus() {
  const [live, setLive] = useState<{ results: Results; at: number } | null>(null);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  const [history, setHistory] = useState<History | null | undefined>(undefined);
  const [historyFailed, setHistoryFailed] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    const results = await checkNow();
    // Every check failing, this page included, means this browser is
    // offline rather than everything being down.
    setOffline(!navigator.onLine || results.web.status === "down");
    setLive({ results, at: Date.now() });
    setChecking(false);
  }, []);

  const reloadHistory = useCallback(async () => {
    try {
      setHistory(await fetchHistory());
      setHistoryFailed(false);
    } catch {
      setHistoryFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void reloadHistory();
    const liveTimer = setInterval(() => void refresh(), LIVE_EVERY_MS);
    const historyTimer = setInterval(() => void reloadHistory(), HISTORY_EVERY_MS);
    return () => {
      clearInterval(liveTimer);
      clearInterval(historyTimer);
    };
  }, [refresh, reloadHistory]);

  return { live, checking, offline, history, historyFailed, refresh };
}

type Overall = "checking" | "offline" | "up" | "degraded" | "partial" | "major";

function overall(results: Results | undefined, offline: boolean): Overall {
  if (offline) return "offline";
  if (!results) return "checking";
  const states = Object.values(results).map((result) => result.status);
  if (results.web.status === "down" || results.api.status === "down") return "major";
  if (states.includes("down")) return "partial";
  if (states.includes("degraded")) return "degraded";
  return "up";
}

const BANNER: Record<Overall, { title: string; icon: typeof CircleCheckIcon; tone: string }> = {
  checking: {
    title: "Checking every system…",
    icon: LoaderCircleIcon,
    tone: "border-border bg-card text-foreground [&_svg]:animate-spin",
  },
  offline: {
    title: "This browser is offline, so nothing could be checked",
    icon: WifiOffIcon,
    tone: "border-border bg-card text-foreground",
  },
  up: {
    title: "All systems operational",
    icon: CircleCheckIcon,
    tone: "border-success/35 bg-success/10 text-success",
  },
  degraded: {
    title: "Some systems are slow",
    icon: CircleAlertIcon,
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
  partial: {
    title: "Partial outage",
    icon: CircleAlertIcon,
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
  major: {
    title: "Major outage",
    icon: CircleXIcon,
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

const STATUS_LABEL: Record<CheckResult["status"], { text: string; tone: string }> = {
  up: { text: "Operational", tone: "text-success" },
  degraded: { text: "Slow", tone: "text-warning" },
  down: { text: "Down", tone: "text-destructive" },
  unknown: { text: "Unknown", tone: "text-muted-foreground" },
};

const DAY_TONE: Record<DayState, string> = {
  up: "bg-success",
  degraded: "bg-warning/60",
  partial: "bg-warning",
  outage: "bg-destructive",
  none: "bg-border",
};

const DAY_TEXT: Record<DayState, string> = {
  up: "No downtime",
  degraded: "Slower than usual",
  partial: "Partial outage",
  outage: "Outage",
  none: "No data",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function duration(minutes: number) {
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${duration(minutes)} ago`;
}

function percent(share: number) {
  // 99.995% shown as 100% would hide a short outage.
  const value = Math.floor(share * 10000) / 100;
  return `${value.toFixed(value === 100 ? 0 : 2)}%`;
}

function dayLabel(day: Day) {
  const date = dateFormat.format(new Date(`${day.date}T12:00:00Z`));
  if (day.downMinutes > 0) return `${date}: down for ${duration(day.downMinutes)}`;
  return `${date}: ${DAY_TEXT[day.state].toLowerCase()}`;
}

function UptimeBars({ id, days, share }: { id: ComponentId; days: Day[]; share: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActive((index) => Math.min(DAYS - 1, Math.max(0, (index ?? DAYS - 1) + (index === null ? 0 : step))));
  };
  const summary = share === null ? "no history yet" : `${percent(share)} uptime`;
  const shown = active === null ? undefined : days[active];

  return (
    <div className="mt-4">
      <ol
        tabIndex={0}
        aria-label={`${DAYS} days of history for ${COMPONENTS.find((c) => c.id === id)?.name}: ${summary}. Use the arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="flex h-9 gap-[2px] rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {days.map((day, index) => (
          <li
            key={day.date}
            onPointerEnter={() => setActive(index)}
            className={cn(
              "flex-1 rounded-[2px] transition-opacity",
              DAY_TONE[day.state],
              // Phones show the last 30 days.
              index < DAYS - 30 && "hidden sm:block",
              active !== null && active !== index && "opacity-45",
            )}
          />
        ))}
      </ol>
      <div className="mt-2 flex min-h-5 items-center justify-between gap-3 font-mono text-xs text-muted-foreground" aria-live="polite">
        {!shown ? (
          <>
            <span>
              <span className="sm:hidden">30</span>
              <span className="hidden sm:inline">{DAYS}</span> days ago
            </span>
            <span className="text-foreground">{summary}</span>
            <span>Today</span>
          </>
        ) : (
          <span className="w-full text-center text-foreground">{dayLabel(shown)}</span>
        )}
      </div>
    </div>
  );
}

function ComponentRow({
  id,
  name,
  description,
  result,
  history,
  incidents,
}: {
  id: ComponentId;
  name: string;
  description: string;
  result: CheckResult | undefined;
  history: History | null | undefined;
  incidents: Incident[];
}) {
  const days = useMemo(() => componentDays(id, history, incidents), [id, history, incidents]);
  const label = result ? STATUS_LABEL[result.status] : null;
  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold">{name}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <p className="shrink-0 text-right text-sm">
          {label ? (
            <span className={cn("font-semibold", label.tone)}>{label.text}</span>
          ) : (
            <span className="text-muted-foreground">Checking…</span>
          )}
          {result?.ms !== undefined && (
            <span className="block font-mono text-xs text-muted-foreground">{result.ms} ms</span>
          )}
        </p>
      </div>
      <UptimeBars id={id} days={days} share={uptime(days)} />
    </li>
  );
}

function Legend() {
  const items: DayState[] = ["up", "degraded", "partial", "outage", "none"];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t px-5 py-4 text-xs text-muted-foreground sm:px-6">
      {items.map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-[2px]", DAY_TONE[state])} />
          {DAY_TEXT[state]}
        </li>
      ))}
    </ul>
  );
}

const UPDATE_TONE: Record<Incident["updates"][number]["label"], string> = {
  Investigating: "text-destructive",
  Identified: "text-warning",
  Monitoring: "text-info",
  Resolved: "text-success",
};

function IncidentCard({ incident }: { incident: Incident }) {
  const names = incident.components
    .map((id) => COMPONENTS.find((c) => c.id === id)?.name ?? id)
    .join(", ");
  const minutes = Math.round(
    ((incident.end ? Date.parse(incident.end) : Date.now()) - Date.parse(incident.start)) / 60_000,
  );
  return (
    <article>
      <h4
        className={cn(
          "text-base font-semibold",
          incident.end ? "text-foreground" : incident.impact === "major" ? "text-destructive" : "text-warning",
        )}
      >
        {incident.title}
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {names} · {incident.end ? `lasted ${duration(minutes)}` : `ongoing for ${duration(minutes)}`} · started{" "}
        {timeFormat.format(new Date(incident.start))}
      </p>
      <ol className="mt-3 space-y-3 border-l pl-4">
        {incident.updates.map((update) => (
          <li key={`${update.at}-${update.label}`}>
            <p className="text-sm leading-relaxed">
              <span className={cn("font-semibold", UPDATE_TONE[update.label])}>{update.label}</span>
              <span className="text-muted-foreground"> · </span>
              {update.text}
            </p>
            <time dateTime={update.at} className="font-mono text-xs text-muted-foreground">
              {timeFormat.format(new Date(update.at))}
            </time>
          </li>
        ))}
      </ol>
    </article>
  );
}

function PastIncidents({ incidents }: { incidents: Incident[] }) {
  const days = Array.from({ length: INCIDENT_DAYS }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    return date;
  });
  const sameDay = (iso: string, day: Date) => {
    const date = new Date(iso);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === day.getTime();
  };
  return (
    <section className="mt-14" aria-labelledby="past-incidents">
      <h2 id="past-incidents" className="font-display text-3xl tracking-[-0.01em]">
        Past incidents
      </h2>
      <div className="mt-6 space-y-8">
        {days.map((day) => {
          const today = incidents.filter((incident) => sameDay(incident.start, day));
          return (
            <div key={day.toISOString()}>
              <h3 className="border-b pb-2 text-sm font-semibold">{dateFormat.format(day)}</h3>
              {today.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No incidents reported.</p>
              ) : (
                <div className="mt-4 space-y-6">
                  {today.map((incident) => (
                    <IncidentCard key={incident.id} incident={incident} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function StatusPage() {
  const { live, checking, offline, history, historyFailed, refresh } = useStatus();
  const incidents = useMemo(() => allIncidents(history), [history]);
  const ongoing = incidents.filter((incident) => !incident.end);
  const state = overall(live?.results, offline);
  const banner = BANNER[state];

  useEffect(() => {
    document.title = "Status · AdaTwin";
  }, []);

  return (
    <div className="min-h-svh">
      <TopBar
        compact
        end={
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Open AdaTwin</Link>
          </Button>
        }
      >
        <span className="ml-1 border-l pl-4 text-sm font-medium text-muted-foreground">Status</span>
      </TopBar>

      <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
        <div className={cn("flex items-center gap-3 rounded-2xl border px-5 py-4 sm:px-6", banner.tone)} role="status">
          <banner.icon className="size-6 shrink-0" aria-hidden />
          <p className="text-lg font-semibold tracking-[-0.01em]">{banner.title}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            {live ? `Checked from your browser at ${clockFormat.format(live.at)}` : "Checking from your browser…"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={checking}>
            <RefreshCwIcon className={cn(checking && "animate-spin")} />
            Check again
          </Button>
        </div>

        {ongoing.length > 0 && (
          <section className="mt-8 rounded-2xl border border-destructive/40 bg-card px-5 py-5 sm:px-6" aria-label="Ongoing incidents">
            <div className="space-y-6">
              {ongoing.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 overflow-hidden rounded-2xl border bg-card" aria-label="Systems">
          <ul className="divide-y">
            {COMPONENTS.map((component) => (
              <ComponentRow
                key={component.id}
                {...component}
                result={live?.results[component.id]}
                history={history}
                incidents={incidents}
              />
            ))}
          </ul>
          <Legend />
        </section>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          The status above is checked from your browser every minute. The bars come from a check every{" "}
          {history?.everyMinutes ?? 5} minutes, by UTC day
          {history
            ? `; last recorded ${ago(history.updatedAt)}.`
            : historyFailed
              ? "; the history could not be loaded just now."
              : history === null
                ? "; they fill in once that check has run."
                : "."}
        </p>

        <PastIncidents incidents={incidents} />
      </main>
    </div>
  );
}
