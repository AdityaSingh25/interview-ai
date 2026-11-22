import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AudioLines, Headphones, LoaderCircle, Mic, MicOff, PhoneOff, Sparkles } from "lucide-react";
import { Backend_url } from "@/lib/config";
import { cn } from "@/lib/utils";
import { VoiceOrb } from "./VoiceOrb";

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Hidden player for the interviewer's voice. */}
      <audio ref={audioRef} autoPlay className="hidden" />

      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium">
          <AudioLines className="size-4" />
          AI Interview
        </Link>
        <StatusBadge phase={phase} elapsed={startedAt ? now - startedAt : 0} />
      </header>

      <main className="grid flex-1 place-items-center px-4">
        {phase === "idle" && (
          <div className="flex max-w-sm flex-col items-center text-center">
            <div className="mb-6 grid size-14 place-items-center rounded-full bg-ai/15 text-ai">
              <Sparkles className="size-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Ready when you are</h1>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">
              The interviewer will introduce itself and ask about your projects. Answer
              out loud, like a real interview.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Headphones className="size-3.5" />
              Use headphones so the AI doesn't hear itself.
            </p>
            <button
              onClick={start}
              className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]"
            >
              <Mic className="size-4" />
              Start interview
            </button>
          </div>
        )}

        {inCall && (
          <div className="flex flex-col items-center gap-10 sm:flex-row sm:gap-24">
            <VoiceOrb
              tone="ai"
              label="Interviewer"
              icon={<Sparkles className="size-8" />}
              stream={aiStream}
              audioContext={audioContext}
              statusOverride={phase === "connecting" || !aiStream ? "Joining…" : undefined}
            />
            <VoiceOrb
              tone="user"
              label="You"
              icon={muted ? <MicOff className="size-8" /> : <Mic className="size-8" />}
              stream={micStream}
              audioContext={audioContext}
              statusOverride={muted ? "Muted" : undefined}
              silenced={muted}
            />
          </div>
        )}

        {phase === "error" && (
          <div className="flex max-w-sm flex-col items-center text-center">
            <h1 className="text-xl font-semibold tracking-tight">Couldn't start the interview</h1>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">{error}</p>
            <div className="mt-6 flex gap-2">
              <Link
                to="/"
                className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                Back to home
              </Link>
              {alreadyStarted ? (
                <Link
                  to={`/result/${interviewId}`}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  See results
                </Link>
              ) : (
                <button
                  onClick={start}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex h-24 items-center justify-center gap-3 pb-4">
        {inCall && (
          <>
            <button
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              className={cn(
                "grid size-12 place-items-center rounded-full border transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                muted ? "bg-foreground text-background" : "hover:bg-accent",
              )}
            >
              {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            <button
              onClick={endInterview}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-destructive px-6 text-sm font-medium text-white transition-colors hover:bg-destructive/90 focus-visible:ring-[3px] focus-visible:ring-destructive/40 focus-visible:outline-none"
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
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        Connecting
      </span>
    );
  }
  if (phase === "live") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs tabular-nums">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-destructive" />
        </span>
        Live · {formatElapsed(elapsed)}
      </span>
    );
  }
  return null;
}
