import type { CSSProperties, Ref } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const RING_COUNT = 9; // Dante's nine circles

type RingMode = "intro" | "idle" | "speaking" | "still";

type RingFieldProps = {
  /** Which voice the rings belong to: gilt for Dante, verdigris for the candidate. */
  tone?: "ai" | "user";
  /** intro: draw in once then breathe; idle: breathe; speaking: pulse outward. */
  mode?: RingMode;
  /** Element that receives the live `--level` (0..1) from useAudioLevel. */
  rootRef?: Ref<HTMLDivElement>;
  className?: string;
};

/**
 * Nine concentric rings. Inner rings swell the most with `--level`, so a voice
 * reads as a ripple pushing outward from the centre.
 */
export function RingField({ tone = "ai", mode = "idle", rootRef, className }: RingFieldProps) {
  const color = tone === "ai" ? "var(--ai)" : "var(--user)";

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn("relative aspect-square", className)}
      style={{ "--level": 0 } as CSSProperties}
    >
      {/* Glow behind the rings, brighter as the voice gets louder. */}
      <div
        className="absolute inset-[18%] rounded-full blur-3xl"
        style={{
          background: color,
          opacity: "calc(0.10 + var(--level) * 0.35)",
        }}
      />
      <svg
        viewBox="0 0 400 400"
        className={cn(
          "relative size-full overflow-visible",
          mode === "intro" && "ring-intro",
          mode === "idle" && "ring-idle",
          mode === "speaking" && "ring-speaking",
        )}
      >
        {Array.from({ length: RING_COUNT }, (_, i) => {
          const r = 30 + i * 19;
          const swell = 0.2 * (1 - i / RING_COUNT) + 0.03;
          return (
            <g
              key={i}
              className="level-scale"
              style={{
                transform: `scale(calc(1 + var(--level) * ${swell.toFixed(3)}))`,
                transformOrigin: "200px 200px",
              }}
            >
              <circle
                className="ring"
                cx="200"
                cy="200"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={2.4 - i * 0.18}
                pathLength={1}
                strokeLinecap="round"
                transform="rotate(-90 200 200)"
                style={
                  {
                    "--i": i,
                    "--ring-opacity": (0.95 - i * 0.09).toFixed(2),
                  } as CSSProperties
                }
              />
            </g>
          );
        })}
        {/* The voice itself. */}
        <circle
          cx="200"
          cy="200"
          r="14"
          fill={color}
          className="level-scale"
          style={{
            transform: "scale(calc(1 + var(--level) * 0.6))",
            transformOrigin: "200px 200px",
          }}
        />
      </svg>
    </div>
  );
}

/** Small three-ring logo mark plus the wordmark, linking home. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-6 text-ai" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
      Dante
    </Link>
  );
}
