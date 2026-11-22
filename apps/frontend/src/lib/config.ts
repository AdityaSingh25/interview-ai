// Set BUN_PUBLIC_BACKEND_URL when building/serving for production
// (e.g. https://your-backend.up.railway.app). Bun inlines BUN_PUBLIC_* vars
// into the browser bundle; locally it falls back to the dev backend.
function readBackendUrl(): string | undefined {
  try {
    // Replaced with a string literal by Bun when the variable is set. When it
    // isn't, `process` doesn't exist in the browser and this throws.
    return process.env.BUN_PUBLIC_BACKEND_URL;
  } catch {
    return undefined;
  }
}

export const Backend_url = (readBackendUrl() || "http://localhost:3001").replace(
  /\/$/,
  "",
);
