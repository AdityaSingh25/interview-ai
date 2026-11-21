import { useParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Backend_url } from "@/lib/config";

export default function Interview() {
  const { interviewId } = useParams();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      // Create a peer connection
      const pc = new RTCPeerConnection();

      // Set up to play remote audio from the model
      audioRef.current = document.createElement("audio");
      audioRef.current.autoplay = true;
      pc.ontrack = (e) => (audioRef.current!.srcObject = e.streams[0]!);

      // Add local audio track for microphone input in the browser
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      pc.addTrack(ms.getTracks()[0]!);

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `${Backend_url}/api/v1/session/${interviewId}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            "Content-Type": "application/sdp",
          },
        },
      );

      const answer = {
        type: "answer" as "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
    })();
  }, [interviewId]);

  return (
    <>
      Interview
      <h1>{interviewId}</h1>
      <audio autoPlay={true} ref={audioRef}></audio>
    </>
  );
}
