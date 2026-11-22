import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { AudioLines, LoaderCircle, RotateCcw } from "lucide-react";
import { Backend_url } from "@/lib/config";
import { cn } from "@/lib/utils";

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

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium">
          <AudioLines className="size-4" />
          AI Interview
        </Link>
        <Link
          to="/"
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <RotateCcw className="size-3.5" />
          New interview
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Your results</h1>

        {failure === "not-found" ? (
          <p className="mt-6 text-muted-foreground">
            This interview doesn't exist. Check the link, or start a new interview.
          </p>
        ) : (
          <>
            <section className="mt-8 rounded-xl border bg-card p-6 shadow-xs">
              {!data ? (
                <Loading text="Loading results…" />
              ) : notStarted ? (
                <p className="text-sm text-muted-foreground">
                  This interview was never started, so there are no results yet.{" "}
                  <Link to={`/interview/${interviewId}`} className="font-medium text-foreground underline underline-offset-4">
                    Start it now
                  </Link>
                </p>
              ) : !done ? (
                <Loading text="Evaluating your interview… This page updates by itself." />
              ) : (
                <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
                  <div className="shrink-0">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Score
                    </div>
                    <div className="mt-1 text-5xl font-semibold tabular-nums">
                      {data.score}
                      <span className="text-xl text-muted-foreground">/10</span>
                    </div>
                    <div className="mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${Math.min(100, Math.max(0, data.score * 10))}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Feedback
                    </div>
                    <p className="mt-2 leading-relaxed whitespace-pre-line text-pretty">
                      {feedback || "No feedback was returned."}
                    </p>
                  </div>
                </div>
              )}
              {failure === "error" && (
                <p className="mt-4 text-sm text-destructive">
                  Couldn't reach the server. Retrying…
                </p>
              )}
            </section>

            <section className="mt-12">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Conversation</h2>
                {messages.length > 0 && (
                  <span className="text-sm text-muted-foreground">{messages.length} messages</span>
                )}
              </div>

              {done && messages.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No messages were recorded.</p>
              ) : (
                <ol className="mt-6 flex flex-col gap-4">
                  {messages.map((m, i) => {
                    const isUser = m.type === "User";
                    return (
                      <li
                        key={`${m.createdAt}-${i}`}
                        className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
                      >
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isUser ? "text-user" : "text-ai",
                          )}
                        >
                          {isUser ? "You" : "Interviewer"}
                        </span>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line",
                            isUser
                              ? "rounded-tr-sm bg-user/12 text-foreground"
                              : "rounded-tl-sm bg-muted text-foreground",
                          )}
                        >
                          {m.content}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {text}
    </div>
  );
}
