import { Backend_url } from "@/lib/config";
import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function Result() {
  type transcriptItem = {
    type: "User" | "Assistant";
    content: string;
  };

  type resultType = {
    transcript: transcriptItem[];
    score: number;
    result: string;
  };

  const interviewId = useParams();
  const [result, setResult] = useState<resultType>({
    score: 0,
    transcript: [],
    result: "",
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
        });
    }, 5 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [interviewId]);
  return <>Result page!!</>;
}
