import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FolderGit2, Headphones, LoaderCircle } from "lucide-react";
import { Backend_url } from "@/lib/config";

// Accepts "https://github.com/user", "github.com/user/" or just "user".
function toGithubProfileUrl(input: string): string | null {
  const value = input.trim();
  const username =
    value.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i,
    )?.[1] ?? value.match(/^[A-Za-z0-9-]{1,39}$/)?.[0];
  console.log("***  " + username);
  return username ? `https://github.com/${username}` : null;
}

export default function Form() {
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [isFileUploaded, setIsFileUploaded] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    const profileUrl = toGithubProfileUrl(githubUrl);
    if (!profileUrl) {
      toast.error("Enter a GitHub profile link, like github.com/your-name");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("githubUrl", profileUrl);
    formData.append("resume", file!);

    try {
      const response = await axios.post(
        `${Backend_url}/api/v1/pre-interview`,
        formData,
      );
      navigate(`/interview/${response.data.id}`);
    } catch {
      toast.error(
        "Couldn't set up the interview. Check the GitHub link and try again.",
      );
      setLoading(false);
    }
  }

  function onResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (files) {
      setFile(files[0]!);
      setIsFileUploaded(true);
      console.log(files[0]);
    }
  }

  return (
    <main className="grid h-dvh place-items-center overflow-hidden px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-user" />
          Voice interview with AI
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Practice your next interview
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Paste your GitHub profile. The interviewer reads your repos and asks
          about your work.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 flex flex-col gap-2 sm:flex-row"
        >
          <label className="relative flex">
            <span className="sr-only">GitHub profile URL</span>
            <FolderGit2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              placeholder="github.com/your-name"
              value={githubUrl}
              onChange={(e) => {
                console.log(githubUrl);
                setGithubUrl(e.target.value);
              }}
              className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <input
            type="file"
            id="resume"
            accept=".pdf, .docx, .doc, .odt"
            onChange={onResumeChange}
          ></input>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                Start interview
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        <br />

        {isFileUploaded && (
          <div className="flex flex-col gap-y-1 w-full">
            <p className="text-center text-blue-800 text-sm">File selected</p>
            <div className="h-1.5 w-full bg-green-500 rounded-full"></div>
          </div>
        )}
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Headphones className="size-3.5" />
          You'll need a microphone. Headphones work best.
        </p>
      </div>
    </main>
  );
}
