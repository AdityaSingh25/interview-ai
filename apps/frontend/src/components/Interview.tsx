import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Headphones, LoaderCircle, Mic, MicOff, PhoneOff } from "lucide-react";
import { Backend_url } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useAudioLevel } from "@/lib/useAudioLevel";
import { RingField, Wordmark } from "./Rings";

type Phase = "idle" | "connecting" | "live" | "error";

// The backend answers 409 when this interview was already started or finished.
class AlreadyStartedError extends Error {}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function describeStartError(e: unknown): string {
  if (e instanceof AlreadyStartedError) {
    return "This interview has already been started or finished, so it can't be joined again.";
  }
  if (e instanceof DOMException && e.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow it in your browser's site settings, then try again.";
  }
  if (e instanceof DOMException && e.name === "NotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  return e instanceof Error ? e.message : "Something went wrong while starting the interview.";
}

export default function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [alreadyStarted, setAlreadyStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Streams and the AudioContext are state so the orbs re-attach when they arrive.
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [aiStream, setAiStream] = useState<MediaStream | null>(null);

  // Refs hold the same objects for cleanup, which must not depend on render timing.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Live loudness for both voices, written straight to CSS (--level).
  const aiRingsRef = useRef<HTMLDivElement>(null);
  const micRingRef = useRef<HTMLDivElement>(null);
  const aiSpeaking = useAudioLevel(aiRingsRef, aiStream, audioContext);
  const youSpeaking = useAudioLevel(micRingRef, micStream, audioContext, muted);

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  // Leaving the page always ends the call and releases the mic.
  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Runs from a click, which lets the browser play audio and start the AudioContext.
  async function start() {
    if (!interviewId) return;
    setError("");
    setPhase("connecting");

    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();
      setAudioContext(ctx);

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micRef.current = mic;
      setMicStream(mic);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const remote = e.streams[0] ?? new MediaStream([e.track]);
        // The <audio> element must play the remote stream; Chrome only feeds
        // WebRTC audio into the AudioContext analyser while it is being played.
        if (audioRef.current) audioRef.current.srcObject = remote;
        setAiStream(remote);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setStartedAt(Date.now());
          setNow(Date.now());
          setPhase("live");
        } else if (pc.connectionState === "failed") {
          teardown();
          setError("The connection to the interviewer was lost.");
          setPhase("error");
        }
      };

      mic.getAudioTracks().forEach((track) => pc.addTrack(track, mic));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`${Backend_url}/api/v1/session/${interviewId}`, {
        method: "POST",
        body: offer.sdp,
        headers: { "Content-Type": "application/sdp" },
      });

      if (sdpResponse.status === 409) throw new AlreadyStartedError();
      if (!sdpResponse.ok) {
        throw new Error(`Couldn't start the session (error ${sdpResponse.status}). Try again in a moment.`);
      }

      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (e) {
      teardown();
      setAudioContext(null);
      setMicStream(null);
      setAiStream(null);
      setAlreadyStarted(e instanceof AlreadyStartedError);
      setError(describeStartError(e));
      setPhase("error");
    }
  }

  function toggleMute() {
    const next = !muted;
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  function endInterview() {
    teardown();
    navigate(`/result/${interviewId}`);
  }

  const inCall = phase === "connecting" || phase === "live";

  let status = "";
  if (phase === "connecting" || (phase === "live" && !aiStream)) status = "Connecting to Dante";
  else if (phase === "live") {
    if (aiSpeaking) status = "Dante is speaking";
    else if (muted) status = "You're muted";
    else if (youSpeaking) status = "Listening";
    else status = "Your turn";
  }

  return (
    <div className="relative isolate flex h-dvh flex-col overflow-hidden px-5 sm:px-10">
      {/* Hidden player for the interviewer's voice. */}
      <audio ref={audioRef} autoPlay className="hidden" />

      <header className="flex h-16 shrink-0 items-center justify-between sm:h-20">
        <Wordmark />
        <StatusBadge phase={phase} elapsed={startedAt ? now - startedAt : 0} />
      </header>

      <main className="grid min-h-0 flex-1 place-items-center">
        {inCall ? (
          <div className="flex flex-col items-center">
            <RingField
              tone="ai"
              rootRef={aiRingsRef}
              mode={aiSpeaking ? "speaking" : "idle"}
              className={cn(
                "w-[min(78vw,52vh,30rem)] transition-opacity duration-700",
                phase === "connecting" && "opacity-50",
              )}
            />
            <p
              aria-live="polite"
              className={cn(
                "mt-4 text-2xl font-semibold tracking-tight transition-colors duration-300 sm:text-3xl",
                phase !== "live" || !aiStream
                  ? "text-muted-foreground"
                  : aiSpeaking
                    ? "text-ai"
                    : youSpeaking && !muted
                      ? "text-user"
                      : "text-foreground",
              )}
            >
              {status}
            </p>
          </div>
        ) : phase === "error" ? (
          <div className="max-w-md">
            <h1 className="text-4xl font-bold tracking-[-0.03em] text-balance">
              {alreadyStarted ? "This interview is already over." : "Dante couldn't start."}
            </h1>
            <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">{error}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {alreadyStarted ? (
                <Link
                  to={`/result/${interviewId}`}
                  className="inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  See your results
                </Link>
              ) : (
                <button
                  onClick={start}
                  className="inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]"
                >
                  Try again
                </button>
              )}
              <Link
                to="/"
                className="inline-flex h-12 items-center rounded-xl border px-6 font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Start a new interview
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <RingField mode="intro" className="w-[min(70vw,40vh,22rem)]" />
            <h1
              className="rise-in mt-6 text-4xl font-bold tracking-[-0.03em] sm:text-5xl"
              style={{ "--delay": "200ms" } as CSSProperties}
            >
              Ready when you are.
            </h1>
            <p
              className="rise-in mt-3 max-w-sm leading-relaxed text-pretty text-muted-foreground"
              style={{ "--delay": "300ms" } as CSSProperties}
            >
              Dante asks one question at a time about your work. Answer out loud,
              the way you would in the room.
            </p>
            <button
              onClick={start}
              className="rise-in mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 font-semibold text-primary-foreground transition-[filter,transform] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]"
              style={{ "--delay": "400ms" } as CSSProperties}
            >
              <Mic className="size-4" />
              Start interview
            </button>
            <p
              className="rise-in mt-4 flex items-center gap-2 text-sm text-muted-foreground"
              style={{ "--delay": "500ms" } as CSSProperties}
            >
              <Headphones className="size-4" />
              Headphones keep Dante from hearing itself.
            </p>
          </div>
        )}
      </main>

      <footer className="flex h-28 shrink-0 items-center justify-center gap-4 pb-4">
        {inCall && (
          <>
            {/* Your voice: a verdigris ring around the mic button grows as you talk. */}
            <div
              ref={micRingRef}
              className="relative grid size-14 place-items-center"
              style={{ "--level": 0 } as CSSProperties}
            >
              <span
                aria-hidden
                className="level-scale absolute inset-0 rounded-full border-2 border-user"
                style={{
                  transform: "scale(calc(1 + var(--level) * 0.55))",
                  opacity: "calc(0.15 + var(--level) * 0.85)",
                }}
              />
              <button
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                className={cn(
                  "relative grid size-14 place-items-center rounded-full border transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  muted
                    ? "border-transparent bg-foreground text-background"
                    : "bg-card text-user hover:bg-accent",
                )}
              >
                {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </button>
            </div>
            <button
              onClick={endInterview}
              className="inline-flex h-14 items-center gap-2 rounded-full border border-destructive/50 px-6 font-medium text-destructive transition-colors hover:bg-destructive hover:text-background focus-visible:ring-[3px] focus-visible:ring-destructive/40 focus-visible:outline-none"
            >
              <PhoneOff className="size-4" />
              End interview
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

function StatusBadge({ phase, elapsed }: { phase: Phase; elapsed: number }) {
  if (phase === "connecting") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Connecting
      </span>
    );
  }
  if (phase === "live") {
    return (
      <span className="inline-flex items-center gap-2 text-sm tabular-nums">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-destructive" />
        </span>
        <span className="text-muted-foreground">Recording</span>
        <span className="font-medium">{formatElapsed(elapsed)}</span>
      </span>
    );
  }
  return null;
}
