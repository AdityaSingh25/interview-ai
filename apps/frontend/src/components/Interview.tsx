import { useParams } from "react-router-dom";
import { useState, useRef } from "react";
import axios from "axios";
import { GoogleGenAI, Modality, Session } from "@google/genai";

export default function Interview() {
  const { id } = useParams();
  const [loading, setLoading] = useState<boolean>(false);
  const sessionRef = useRef<Session | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const model = "gemini-3.8-live";
  const config = { responseModalities: [Modality.AUDIO] };

  async function startInterview() {
    setLoading(true);

    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });

    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(streamRef.current);

    const response = await axios.get(
      "http://localhost:3001/get-ephemeral-token",
    );
    const token = response.data.token.name;

    const ai = new GoogleGenAI({
      httpOptions: { apiVersion: "v1alpha" },
      apiKey: token,
    });

    sessionRef.current = await ai.live.connect({
      model: model,
      config: config,
      callbacks: {
        onmessage: (message) => {
          console.log("Gemini is responding...");
        },
      },
    });

    // Send content...

    //session.close();
  }

  return (
    <>
      Interview
      <h1>{id}</h1>
      {loading ? <div>Starting Interview...</div> : <div></div>}
      <button
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow transition-all hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        onClick={startInterview}
      >
        {loading ? "Starting Interview..." : "Start Interview"}
      </button>
    </>
  );
}
