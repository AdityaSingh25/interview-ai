import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { Backend_url } from "@/lib/config";
import { cn } from "@/lib/utils";
import { RingField, Wordmark } from "./Rings";

type TranscriptItem = {
  type: "User" | "Assistant";
  content: string;
  createdAt: string; // ISO string from JSON, not a Date
};

type ResultResponse = {
  transcript: TranscriptItem[];
  score: number;
  feedback?: string | null;
  status: "Pre" | "InProgress" | "Done";
};

const POLL_MS = 5000;

export default function Result() {
  const { interviewId } = useParams();
  const [data, setData] = useState<ResultResponse | null>(null);
  const [failure, setFailure] = useState<"not-found" | "error" | null>(null);

  useEffect(() => {
    if (!interviewId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Poll until the evaluation is done. Each request starts after the last one finishes.
    const load = async () => {
      try {
        const res = await axios.get<ResultResponse>(`${Backend_url}/api/v1/result/${interviewId}`);
        if (cancelled) return;
        setData(res.data);
        setFailure(null);
        // "Pre" means the call never started, so there is nothing to wait for.
        if (res.data.status === "InProgress") timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setFailure("not-found");
          return;
        }
        setFailure("error");
        timer = setTimeout(load, POLL_MS);
      }
    };
    void load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [interviewId]);

  const done = data?.status === "Done";
  const notStarted = data?.status === "Pre";
  const feedback = data?.feedback ?? "";
  const messages = [...(data?.transcript ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let heading = "Loading your results.";
  if (failure === "not-found") heading = "This interview doesn't exist.";
  else if (notStarted) heading = "This interview never started.";
  else if (done) heading = "Here's how it went.";
  else if (data) heading = "Dante is reviewing your answers.";

  return (
    <div className="relative isolate min-h-dvh px-5 sm:px-10">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between sm:h-20">
        <Wordmark />
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Start a new interview
        </Link>
      </header>

      <main className="mx-auto max-w-3xl pt-8 pb-24">
        <h1 className="rise-in text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">
          {heading}
        </h1>

        {failure === "not-found" && (
          <p className="mt-4 text-muted-foreground">Check the link, or start a new interview.</p>
        )}

        {notStarted && (
          <p className="mt-4 text-muted-foreground">
            There's nothing to score yet.{" "}
            <Link
              to={`/interview/${interviewId}`}
              className="font-medium text-foreground underline decoration-ai underline-offset-4"
            >
              Start it now
            </Link>
          </p>
        )}

        {data && !done && !notStarted && (
          <div className="mt-8 flex items-center gap-5">
            <RingField mode="idle" className="w-24 shrink-0" />
            <p className="max-w-sm leading-relaxed text-muted-foreground">
              Scoring usually takes under a minute. This page updates on its own.
            </p>
          </div>
        )}

        {done && (
          <section
            className="rise-in mt-10 grid gap-8 sm:grid-cols-[auto_1fr] sm:gap-12"
            style={{ "--delay": "120ms" } as CSSProperties}
          >
            <ScoreDial score={data.score} />
            <div>
              <h2 className="text-lg font-semibold">Feedback</h2>
              <p className="mt-3 max-w-[62ch] text-[1.05rem] leading-[1.7] whitespace-pre-line text-pretty text-foreground/90">
                {feedback || "Dante didn't return any written feedback for this interview."}
              </p>
            </div>
          </section>
        )}

        {failure === "error" && (
          <p className="mt-6 text-sm text-destructive">
            Can't reach the server. Retrying every few seconds.
          </p>
        )}

        {messages.length > 0 && (
          <section className="mt-16">
            <h2 className="text-lg font-semibold">Transcript</h2>
            <ol className="mt-5 border-t">
              {messages.map((m, i) => {
                const isUser = m.type === "User";
                return (
                  <li
                    key={`${m.createdAt}-${i}`}
                    className="grid gap-1 border-b py-5 sm:grid-cols-[7rem_1fr] sm:gap-6"
                  >
                    <span
                      className={cn(
                        "flex items-center gap-2 text-sm font-semibold",
                        isUser ? "text-user" : "text-ai",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("size-2 rounded-full", isUser ? "bg-user" : "bg-ai")}
                      />
                      {isUser ? "You" : "Dante"}
                    </span>
                    <p className="max-w-[62ch] leading-[1.7] whitespace-pre-line text-pretty">
                      {m.content}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {done && messages.length === 0 && (
          <p className="mt-12 text-muted-foreground">No conversation was recorded.</p>
        )}
      </main>
    </div>
  );
}

/** Counts up from 0 to `target` once, unless the user prefers reduced motion. */
function useCountUp(target: number, durationMs = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/** The score as a gilt arc inside two faint rings, echoing the Dante mark. */
function ScoreDial({ score }: { score: number }) {
  const clamped = Math.min(10, Math.max(0, score));
  const shown = useCountUp(clamped);

  return (
    <figure className="relative size-44 shrink-0" aria-label={`Score: ${clamped} out of 10`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r="57" fill="none" stroke="var(--ai)" strokeWidth="0.6" opacity="0.25" />
        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="var(--ai)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - clamped / 10}
          style={{ animation: "dial-sweep 1100ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        />
        <circle cx="60" cy="60" r="36" fill="none" stroke="var(--ai)" strokeWidth="0.6" opacity="0.25" />
      </svg>
      <figcaption className="absolute inset-0 grid place-content-center text-center">
        <span className="text-5xl leading-none font-bold tracking-tight tabular-nums">{shown}</span>
        <span className="mt-1 text-sm text-muted-foreground">out of 10</span>
      </figcaption>
    </figure>
  );
}
