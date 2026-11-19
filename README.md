# ContextLM — Fast Grounded Document Q&A POC

ContextLM is a NotebookLM-inspired, strictly document-grounded Q&A application built with **Next.js 16 (App Router + Turbopack)**, **TypeScript**, **Tailwind CSS v4**, **Auth.js v5**, **Prisma + PostgreSQL**, and **OpenAI (`gpt-6-luna` & `gpt-5-nano`)**.

## Key Features

- **Strict Grounded Q&A Engine**: Streams answers via SSE exclusively from user-selected uploaded documents (`temperature: 0.0`) with clickable inline source citations (`[1] filename.pdf`) and deterministic refusal when facts are absent.
- **4-Layer Prompt-Injection Guardrails**:
  1. Layer 1: Deterministic regex, XML tag spoofing, Base64 instruction smuggling, and out-of-scope pre-filter (`0` LLM tokens).
  2. Layer 2: Per-request cryptographic 8-char hex nonce XML sandboxing + XML entity escaping (`escapeXml`).
  3. Layer 3: Strict system instruction hierarchy + deterministic `file.id` source ordering for OpenAI prefix prompt caching.
  4. Layer 4: Fast `gpt-5-nano` micro-classifier + streaming canary (`CANARY_7749_CTXLM`) & tag-leakage abort filter.
- **Document Ingestion & Hard Quotas**: PDF (`pdf-parse`), DOCX (`mammoth`), TXT, MD, and CSV extraction enforcing 10 files max, 10 MB per file, 50 MB cumulative storage, and 150,000 active context tokens.
- **Authentication & RBAC**: Google OAuth 2.0 + Credentials login/signup, pre-seeded `admin` / `admin` (`Role.ADMIN`), and route middleware protecting `/workspace`, `/admin`, and API routes.
- **Admin "Eagle's Eye" Telemetry Portal (`/admin`)**: KPI cards, 24-hour peak usage chart, day-of-week volume/latency chart, searchable per-user token/cost leaderboard, and live Guardrail Audit Feed.

## Quickstart

### 1. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — PostgreSQL connection string (Neon, Supabase, Vercel Postgres, or local Postgres)
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_URL` — `http://localhost:3000` (or your production domain)
- `OPENAI_API_KEY` — OpenAI API key
- *(Optional)* `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` for Google OAuth

### 2. Initialize Database & Seed Admin Account

```bash
npm install
npm run db:push
npm run db:seed
```

Default seeded admin credentials:
- **Username**: `admin`
- **Password**: `admin`

### 3. Run Locally

```bash
npm run dev
```

### 4. Deploy to Vercel or Docker

- **Vercel**: Import this repository in Vercel, add the environment variables above, and deploy. Run `npm run db:push && npm run db:seed` against your production database once.
- **Docker**:
  ```bash
  docker build -t contextlm .
  docker run -p 3000:3000 --env-file .env contextlm
  ```
