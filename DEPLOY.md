# Deploying

The repo holds two apps that deploy separately, plus a Postgres database:

| Service | Folder | Runs as |
| --- | --- | --- |
| Postgres | — | Managed database |
| Backend | `apps/backend` | Always-on Bun server (Express + OpenAI sideband WebSocket) |
| Frontend | `apps/frontend` | Static site (`dist/`) or the Bun server in `src/index.ts` |

**The backend needs a host that keeps the process running** (Railway, Render, Fly.io).
Serverless functions would kill the sideband WebSocket mid-interview and lose the
transcript. The scoring de-duplication is also in memory, so run **one** backend instance.

## 1. Database

Create a Postgres database and copy its connection string (`DATABASE_URL`).

## 2. Backend (`apps/backend`)

| Setting | Value |
| --- | --- |
| Root directory | `apps/backend` |
| Install | `bun install` |
| Build | `bun run build` (generates the Prisma client) |
| Start | `bun run start` (generates client, applies migrations, starts the server) |

Environment variables (see `apps/backend/.env.example`):

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `FRONTEND_URL`: the frontend's public URL, for CORS. Set it after step 3.
- `PORT`: usually set by the host.

`bun run start` runs `prisma migrate deploy`, which applies existing migrations only.
Create new migrations locally with `prisma migrate dev`, commit them, then redeploy.

## 3. Frontend (`apps/frontend`)

Set `BUN_PUBLIC_BACKEND_URL` to the backend's public URL **before building**. It's
baked into the JavaScript bundle, so changing it needs a rebuild.

**Option A: static host** (Vercel, Netlify, Cloudflare Pages, Railway static)

| Setting | Value |
| --- | --- |
| Root directory | `apps/frontend` |
| Build | `bun run build` |
| Output directory | `dist` |

Add a rewrite that sends every path to `/index.html`, so `/interview/:id` and
`/result/:id` work on refresh.

**Option B: Bun server**

| Setting | Value |
| --- | --- |
| Root directory | `apps/frontend` |
| Start | `bun run start` |

It already serves `index.html` for every route and reads `PORT`.

## 4. Check

1. Open the frontend URL. It must be HTTPS, or the browser blocks the microphone.
2. Run a short interview and click **End interview**.
3. The results page should show a score within about a minute.

If requests fail with a CORS error, check that `FRONTEND_URL` on the backend exactly
matches the frontend origin (scheme + host, no trailing path).
