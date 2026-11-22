import { Backend_url } from "@/lib/config";
import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function Result() {
  type transcriptItem = {
    type: "User" | "Assistant";
    content: string;
    createdAt: Date;
  };

  type resultType = {
    transcript: transcriptItem[];
    score: number;
    feedback: string;
    status: "Pre" | "InProgress" | "Done";
  };

  const interviewId = useParams();
  const [result, setResult] = useState<resultType>({
    score: 0,
    transcript: [],
    feedback: "",
    status: "Pre",
  });

  useEffect(() => {
    axios
      .get(`${Backend_url}/api/v1/result/${interviewId}`)
      .then((response) => {
        setResult(response.data);
      });

    const intervalId = setInterval(() => {
      axios
        .get(`${Backend_url}/api/v1/result/${interviewId}`)
        .then((response) => {
          setResult(response.data);
          if (response.data.status == "Done") {
            clearInterval(intervalId);
          }
        });
    }, 5 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [interviewId]);
  return (
    <>
      {result.status == "Done" && (
        <div>
          <div>
            Score - {result.score}
            Feedback - {result.feedback}
            Transscript -{" "}
            {result.transcript
              .sort((a, b) => a.createdAt.getDate() - b.createdAt.getDate())
              .map((x) => (
                <div>
                  {x.type} - {x.content}
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
