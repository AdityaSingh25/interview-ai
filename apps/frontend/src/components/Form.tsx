import { useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Backend_url } from "@/lib/config";
import { useNavigate } from "react-router-dom";

export default function Form() {
  const [githubUrl, setGithubUrl] = useState<string>();
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  async function onSubmit() {
    if (!githubUrl) {
      toast("enter the proper github and linkedin urls");
    }
    try {
      setLoading(true);
      const resposne = await axios.post(`${Backend_url}/api/v1/pre-interview`, {
        githubUrl,
      });
      navigate(`/interview/${resposne.data.id}`);
    } catch (e) {
      toast("error" + e);
    }
  }

  return (
    <div className="h-screen w-screen flex justify-center items-center">
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <div>
            <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
              Ai Interview Kickstart
            </h1>
            <h2>https://github.com/AdityaSingh25/</h2>
          </div>
        </div>
        <input
          type="text"
          placeholder="github link"
          className="border p-4"
          onChange={(e) => setGithubUrl(e.target.value)}
        ></input>
        <div className="flex justify-center">
          <button
            disabled={loading}
            onClick={onSubmit}
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow transition-all hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Starting Interview..." : "Start Interview"}
          </button>
        </div>
      </div>
    </div>
  );
}
