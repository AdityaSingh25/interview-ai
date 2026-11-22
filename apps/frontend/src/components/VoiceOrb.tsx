import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "ai" | "user";

type VoiceOrbProps = {
  /** Audio to measure. `null` while it isn't available yet. */
  stream: MediaStream | null;
  /** Shared AudioContext, created after a user click so the browser lets it run. */
  audioContext: AudioContext | null;
  tone: Tone;
  label: string;
  icon: ReactNode;
  /** Shown instead of "Speaking"/"Listening", e.g. "Muted" or "Joining…". */
  statusOverride?: string;
  /** Force the level to zero (e.g. mic muted) without tearing down the analyser. */
  silenced?: boolean;
};

// Loudness (dBFS) mapped to 0..1. Quiet room noise sits below the floor.
const DB_FLOOR = -58;
const DB_CEIL = -18;
// Hysteresis so the "Speaking" label doesn't flicker between words.
const SPEAKING_ON = 0.32;
const SPEAKING_OFF = 0.14;
const SPEAKING_HOLD_MS = 350;

const toneClasses: Record<Tone, { solid: string; soft: string; text: string }> = {
  ai: { solid: "bg-ai", soft: "bg-ai/20", text: "text-ai" },
  user: { solid: "bg-user", soft: "bg-user/20", text: "text-user" },
};

/**
 * A circle that grows and glows with the loudness of a MediaStream.
 * The level is written to a CSS variable every animation frame instead of
 * React state, so the component doesn't re-render 60 times a second.
 */
export function VoiceOrb({
  stream,
  audioContext,
  tone,
  label,
  icon,
  statusOverride,
  silenced = false,
}: VoiceOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  // Read inside the animation loop, so toggling it doesn't restart the analyser.
  const silencedRef = useRef(silenced);
  silencedRef.current = silenced;
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const el = orbRef.current;
    if (!el || !stream || !audioContext || stream.getAudioTracks().length === 0) return;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    // Measure only. Not connected to the speakers, so nothing plays twice.
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    let level = 0;
    let isSpeaking = false;
    let lastLoudAt = 0;
    let frame = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (const s of samples) sumSquares += s * s;
      const rms = Math.sqrt(sumSquares / samples.length);
      const db = 20 * Math.log10(rms || 1e-8);
      const target = silencedRef.current
        ? 0
        : Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));

      // Rise fast, fall slowly: reads as "voice" rather than jitter.
      level += (target - level) * (target > level ? 0.45 : 0.08);
      el.style.setProperty("--level", level.toFixed(3));

      const now = performance.now();
      if (level > SPEAKING_ON) lastLoudAt = now;
      const next = isSpeaking
        ? level > SPEAKING_OFF || now - lastLoudAt < SPEAKING_HOLD_MS
        : level > SPEAKING_ON;
      if (next !== isSpeaking) {
        isSpeaking = next;
        setSpeaking(next);
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      el.style.setProperty("--level", "0");
      setSpeaking(false);
    };
  }, [stream, audioContext]);

  const t = toneClasses[tone];
  const status = statusOverride ?? (speaking ? "Speaking" : "Listening");
  const active = !statusOverride && speaking;

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        ref={orbRef}
        className="relative grid size-40 place-items-center sm:size-52"
        style={{ "--level": 0 } as CSSProperties}
      >
        {/* Outer glow and ring scale with the level; motion-reduce keeps only the fade. */}
        <div
          className={cn("absolute inset-0 rounded-full blur-2xl motion-reduce:!transform-none", t.soft)}
          style={{
            opacity: "calc(0.15 + var(--level) * 0.85)",
            transform: "scale(calc(0.75 + var(--level) * 0.5))",
          }}
        />
        <div
          className={cn("absolute inset-4 rounded-full motion-reduce:!transform-none", t.soft)}
          style={{ transform: "scale(calc(0.82 + var(--level) * 0.3))" }}
        />
        <div
          className={cn(
            "relative grid size-20 place-items-center rounded-full text-white shadow-lg motion-reduce:!transform-none sm:size-24",
            t.solid,
          )}
          style={{ transform: "scale(calc(1 + var(--level) * 0.12))" }}
        >
          {icon}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            active ? t.text : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              active ? t.solid : "bg-muted-foreground/40",
            )}
          />
          {status}
        </span>
      </div>
    </div>
  );
}
