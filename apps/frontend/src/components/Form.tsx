import { useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { toast } from "sonner";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  CloudUpload,
  FileText,
  FolderGit2,
  Headphones,
  LoaderCircle,
  X,
} from "lucide-react";
import { Backend_url } from "@/lib/config";
import { cn } from "@/lib/utils";
import { RingField, Wordmark } from "./Rings";

const MAX_RESUME_MB = 5; // must match the backend limit

// Accepts "https://github.com/user", "github.com/user/" or just "user".
function toGithubProfileUrl(input: string): string | null {
  const value = input.trim();
  const username =
    value.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i,
    )?.[1] ?? value.match(/^[A-Za-z0-9-]{1,39}$/)?.[0];
  return username ? `https://github.com/${username}` : null;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns an error message, or null if the file is OK.
function checkResume(file: File): string | null {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "The resume must be a PDF.";
  if (file.size > MAX_RESUME_MB * 1024 * 1024) {
    return `The resume must be ${MAX_RESUME_MB} MB or smaller.`;
  }
  return null;
}

export default function Form() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [githubUrl, setGithubUrl] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasGithub = githubUrl.trim() !== "";
  const githubInvalid = hasGithub && !toGithubProfileUrl(githubUrl);
  const canSubmit = (hasGithub || resume !== null) && !githubInvalid && !loading;

  function pickResume(file: File | undefined) {
    if (!file) return;
    const error = checkResume(file);
    if (error) {
      toast.error(error);
      return;
    }
    setResume(file);
  }

  function clearResume() {
    setResume(null);
    // Reset the input so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    pickResume(e.dataTransfer.files[0]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasGithub && !resume) {
      toast.error("Add your GitHub profile, a resume, or both.");
      return;
    }
    const profileUrl = hasGithub ? toGithubProfileUrl(githubUrl) : null;
    if (hasGithub && !profileUrl) {
      toast.error("Enter a GitHub profile link, like github.com/your-name");
      return;
    }

    const formData = new FormData();
    if (profileUrl) formData.append("githubUrl", profileUrl);
    if (resume) formData.append("resume", resume);

    setLoading(true);
    try {
      const response = await axios.post(
        `${Backend_url}/api/v1/pre-interview`,
        formData,
      );
      navigate(`/interview/${response.data.id}`);
    } catch (error) {
      // The backend sends a readable reason (bad link, unreadable PDF, ...).
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : undefined;
      toast.error(message ?? "Couldn't set up the interview. Try again.");
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden px-5 sm:px-10">
      <header className="rise-in flex h-16 shrink-0 items-center sm:h-20">
        <Wordmark />
      </header>

      {/* The rings: the one memorable thing. Beside the form on desktop, a quiet backdrop on phones. */}
      <RingField
        mode="intro"
        className="pointer-events-none absolute top-[-6rem] right-[-9rem] -z-10 w-[24rem] opacity-40 lg:top-1/2 lg:right-[4vw] lg:w-[min(44vw,40rem)] lg:-translate-y-1/2 lg:opacity-100"
      />

      <div className="flex flex-1 items-center pb-10">
        <div className="w-full max-w-[30rem]">
          <h1
            className="rise-in text-[2.75rem] leading-[0.95] font-bold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl"
            style={{ "--delay": "150ms" } as CSSProperties}
          >
            Say it out loud before it counts.
          </h1>
          <p
            className="rise-in mt-4 max-w-[26rem] text-[1.05rem] leading-relaxed text-pretty text-muted-foreground"
            style={{ "--delay": "300ms" } as CSSProperties}
          >
            Dante reads your GitHub or resume, then interviews you by voice
            about the work you've actually done.
          </p>

          <form
            onSubmit={onSubmit}
            className="rise-in mt-7 space-y-3"
            style={{ "--delay": "450ms" } as CSSProperties}
          >
            {/* GitHub */}
            <label className="block">
              <span className="sr-only">GitHub profile</span>
              <span className="relative block">
                <FolderGit2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                  placeholder="GitHub profile, e.g. github.com/ada"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  aria-invalid={githubInvalid}
                  className="h-12 w-full rounded-xl border border-input bg-card/70 pr-4 pl-10 text-[0.95rem] backdrop-blur transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
                />
              </span>
              {githubInvalid && (
                <span className="mt-1.5 block text-sm text-destructive">
                  Use a profile link like github.com/your-name
                </span>
              )}
            </label>

            {/* Resume */}
            {resume ? (
              <div className="flex h-12 items-center gap-3 rounded-xl border border-ai/40 bg-ai/10 pr-1.5 pl-3.5">
                <FileText className="size-4 shrink-0 text-ai" />
                <p className="min-w-0 flex-1 truncate text-[0.95rem]">
                  {resume.name}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {formatSize(resume.size)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={clearResume}
                  aria-label="Remove resume"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-card/40 px-3.5 text-[0.95rem] text-muted-foreground backdrop-blur transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 hover:border-ring/60 hover:text-foreground",
                  dragging && "border-ai bg-ai/10 text-foreground",
                )}
              >
                <CloudUpload className="size-4 shrink-0" />
                <span className="truncate">
                  {dragging ? "Drop to attach" : "Add your resume (PDF)"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => pickResume(e.currentTarget.files?.[0])}
                />
              </label>
            )}

            <p className="text-sm text-muted-foreground">
              Either one works. Both give the sharpest questions.
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[0.95rem] font-semibold text-primary-foreground transition-[transform,background-color,opacity] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
            >
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {resume ? "Reading your resume" : "Preparing"}
                </>
              ) : (
                "Start interview"
              )}
            </button>
          </form>

          <p
            className="rise-in mt-6 flex items-center gap-2 text-sm text-muted-foreground"
            style={{ "--delay": "600ms" } as CSSProperties}
          >
            <Headphones className="size-4" />
            Wear headphones so Dante doesn't hear itself.
          </p>
        </div>
      </div>
    </main>
  );
}
