import { useEffect, useRef, useState, type RefObject } from "react";

// Loudness (dBFS) mapped to 0..1. Quiet room noise sits below the floor.
const DB_FLOOR = -58;
const DB_CEIL = -18;
// Hysteresis so "speaking" doesn't flicker between words.
const SPEAKING_ON = 0.32;
const SPEAKING_OFF = 0.14;
const SPEAKING_HOLD_MS = 350;

/**
 * Measures the loudness of a MediaStream and writes it to the `--level` CSS
 * variable (0..1) on `targetRef` every animation frame, so visuals can react
 * without React re-rendering 60 times a second.
 *
 * Returns whether the stream is currently "speaking" (changes rarely).
 */
export function useAudioLevel(
  targetRef: RefObject<HTMLElement | null>,
  stream: MediaStream | null,
  audioContext: AudioContext | null,
  silenced = false,
): boolean {
  const [speaking, setSpeaking] = useState(false);
  // Read inside the loop, so toggling it doesn't restart the analyser.
  const silencedRef = useRef(silenced);
  silencedRef.current = silenced;

  useEffect(() => {
    const el = targetRef.current;
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
  }, [targetRef, stream, audioContext]);

  return speaking;
}
