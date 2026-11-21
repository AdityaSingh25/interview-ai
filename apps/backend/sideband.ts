import WebSocket from "ws";
import { prisma } from "./db";

export async function initSideband(callId: string, interviewId: string) {
  const interview = await prisma.interview.findFirst({
    where: {
      id: interviewId,
    },
  });

  const url = "wss://api.openai.com/v1/realtime?call_id=" + callId;
  const ws = new WebSocket(url, {
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    },
  });

  ws.on("open", function open() {
    console.log("Connected to server.");
    // Send client events over the WebSocket once connected
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: `You should interview this person on their computer science intellect, Ask around 2-3 questions based on thier experience. please use English at first.
            Here is the rough idea what user does, with the help of his github metadata
            ## Github metadata
            ${JSON.stringify(interview?.githubMetada)}
            `,
        },
      }),
    );
  });

  ws.on("error", () => {
    console.log("Error creating websocket connection.");
  });
  // Listen for and parse server events
  ws.on("message", async function incoming(message) {
    const parsedMessage = JSON.parse(message.toString());

    if (
      parsedMessage.type ==
      "conversation.item.input_audio_transcription.completed"
    ) {
      console.log("User : " + parsedMessage.transcript);
      await prisma.message.create({
        data: {
          message: parsedMessage.transcript,
          type: "User",
          interviewId: interviewId,
        },
      });
    }
    if (parsedMessage.type == "response.output_audio_transcript.done") {
      console.log("Ai : " + parsedMessage.transcript);
      await prisma.message.create({
        data: {
          message: parsedMessage.transcript,
          type: "Assistant",
          interviewId: interviewId,
        },
      });
    }
  });
}
