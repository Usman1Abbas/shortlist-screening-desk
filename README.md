# Shortlist — a deep-agent résumé screening desk

A custom AI agent for **in-house technical recruiters**. Paste a job description and
Shortlist writes a defensible scoring rubric from it *before it reads a single
résumé*, then screens a batch of résumés against that same rubric — producing an
evidence-backed scorecard, risk flags phrased as questions to ask on a screen, a
ranked shortlist, and a personalised outreach draft for the strong candidates.

> **Live demo:** https://shortlist-screening-desk.vercel.app
>
> **Repo:** https://github.com/Usman1Abbas/shortlist-screening-desk

---

## The problem

In-house recruiters work a queue of 20–200 applicants per req and are measured on
how many make it to a hiring-manager screen without being sent back. They usually
aren't technical enough to judge a résumé's claims unaided, so the judgement call
is slow, inconsistent, and easy to bias.

Shortlist is the screening desk that does the first pass: it supplies the
judgement **and the evidence behind it**, applies the *same* rubric to every
candidate so two people with the same evidence get the same score, and hands back
a ranked pipeline the recruiter can act on today.

One capability, done well: **turn a JD + a stack of résumés into a defensible,
evidence-cited shortlist.**

---

## What it does

1. **Builds a rubric from the JD** — must-haves (hard filters), 3–8 weighted
   criteria pulled from what the role actually asks for, and a calibration note
   for how "senior" should read *for this specific role*. Nothing gets scored
   until a rubric exists.
2. **Screens résumés against that rubric** — one screening subagent per
   candidate, each producing a structured profile and a per-criterion scorecard
   with a quote/paraphrase of evidence for every criterion.
3. **Ranks the pipeline** — overall 0–100, a `strong / maybe / no` verdict, and
   risk flags written as questions a recruiter can ask on the phone screen.
4. **Drafts outreach** — for strong candidates, hooked to something specific in
   their actual résumé, under 150 words.
5. **Drafts respectful rejections** — for candidates being passed on: warm and
   reason-light (acknowledges a genuine strength, no critique of gaps), which is
   both kinder and lower-risk than an explained rejection.
6. **Ingests résumés two ways** — paste them, or **upload PDFs / an entire
   folder** (text is extracted in the browser).

After a batch is screened the desk proactively *offers* these next actions —
outreach for the strong, rejections for the rest — but leaves the call to the
recruiter. All drafts are reviewed and sent by a human; nothing is auto-sent.

Every score on screen is one click from the résumé evidence behind it.

---

## Harness design

The point of this project is the harness, not the chat box. It's a
[LangGraph **deepagents**](https://github.com/langchain-ai/deepagentsjs) graph
with domain knowledge, a narrow custom toolset, and a delegation structure — a
supervisor agent that plans and talks to the recruiter, and a screening subagent
that does one résumé at a time.

### 1. Domain knowledge (`lib/agent/prompt.ts`)

The system prompt is the opinionated core — it encodes how a good screener reads
a résumé:

- **Score evidence, not adjectives.** "Expert in distributed systems" is worth
  nothing; "cut p99 from 800ms to 120ms by resharding the write path" is worth a
  lot. No supporting detail → treated as unverified.
- **Weigh scope over title**, and read trajectory across roles, not just the
  current row.
- **Absence of evidence is not evidence of absence** — gaps become questions to
  ask, not rejections.
- **Bias guardrails** — never infer or weigh age, gender, ethnicity,
  nationality, health, or school prestige; ignore photos / DOB / marital status
  if present.

### 2. Custom tools (`lib/agent/tools.ts`)

Tools are built **per request and closed over the role being screened**, so the
model never carries a role id around and can't write a score into the wrong
pipeline. Every write also re-checks that the candidate belongs to the role.

| Tool | Who can call it | What it does |
|---|---|---|
| `get_role` | supervisor + subagent | Read the JD, current rubric, and candidate roster |
| `save_rubric` | supervisor | Create/replace the weighted rubric |
| `list_candidates` | supervisor | Read the whole ranked pipeline |
| `read_candidate` | subagent | Read one résumé's full text |
| `save_profile` | subagent | Write structured facts from a résumé |
| `save_score` | subagent | Write a scorecard — **rejected** if it skips any rubric criterion |
| `save_outreach` | supervisor | Save a personalised outreach draft (strong candidates) |
| `save_rejection` | supervisor | Save a warm, reason-light rejection draft (passed-over candidates) |

### 3. Delegation (`lib/agent/index.ts`)

The **screening subagent** gets a deliberately narrow surface: it can read the
rubric and one résumé and write that candidate's profile and score — it cannot
touch the rubric or draft outreach. One delegation per candidate keeps résumé
twelve as well-read as résumé one, instead of the supervisor compressing later
candidates into vibes as its context fills.

### 4. Guardrails & robustness

- `save_score` refuses a partial scorecard rather than persisting an unreadable
  overall number.
- **Rate-limit throttle** (`lib/agent/model.ts`) — a shared min-interval gate
  every model call (supervisor + subagents) passes through, keeping the run
  under the model provider's per-minute limit deterministically, plus
  `maxRetries` back-off for stray 429s.
- The supervisor screens candidates **sequentially**, so each résumé is handled
  start-to-finish in one pass.

---

## Architecture

```
Browser (Next.js / React / shadcn)
  ├─ paste résumés  ─┐
  ├─ upload PDFs ────┤→ text extracted client-side (pdf.js, lib/pdf.ts)
  │                  │
  ▼                  ▼
Server Actions ─── Supabase (roles · candidates · messages)
  │
  ▼
/api/agent  (SSE stream)
  └─ deepagents graph  ──►  OpenRouter (ChatOpenAI-compatible)
       ├─ supervisor (rubric, ranking, outreach)
       └─ screening subagent × N (one per candidate)
             ▲
             └─ tools read/write straight to Supabase; the UI re-reads the pipeline
```

### Stack

- **Frontend** — Next.js 16 (App Router) · Tailwind v4 · shadcn/ui
- **Backend / persistence** — Supabase (Postgres)
- **Agent** — LangGraph `deepagents`, driven through `@langchain/openai`
  pointed at **OpenRouter** (default model `nvidia/nemotron-3-super-120b-a12b:free`)
- **Interface** — streaming SSE endpoint that surfaces tool activity as
  recruiter-readable verbs and aborts the run if the client disconnects

---

## Running locally

### Prerequisites
- Node 20+
- A [Supabase](https://supabase.com) project
- An [OpenRouter](https://openrouter.ai) API key

### 1. Configure environment
Copy the template and fill it in:
```bash
cp .env.local.example .env.local
```
```bash
OPENROUTER_API_KEY=sk-or-...
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>   # server-only, never expose
# optional: spacing between model calls in ms (default 4000)
# OPENROUTER_MIN_INTERVAL_MS=4000
```

### 2. Create the database
Run this in the Supabase SQL editor:
```sql
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  title text not null, company text not null, jd_text text not null,
  rubric jsonb, created_at timestamptz not null default now()
);
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  label text not null, raw_resume text not null,
  profile jsonb, score jsonb, outreach jsonb, rejection jsonb,
  created_at timestamptz not null default now()
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null, created_at timestamptz not null default now()
);
create index if not exists candidates_role_id_idx on candidates(role_id);
create index if not exists messages_role_created_idx on messages(role_id, created_at);
-- All access is server-side via the service_role key, so lock RLS down with no policies.
alter table roles enable row level security;
alter table candidates enable row level security;
alter table messages enable row level security;
```

### 3. Install & run
```bash
npm install
npm run dev            # http://localhost:3000
```

Open a role, add résumés (paste or upload PDFs), then tell the desk
*"Build the rubric and screen everyone."*

### Tests / scripts
```bash
npx tsx scripts/smoke.ts          # end-to-end: rubric → screen 3 fixtures → ranked pipeline
npx tsx scripts/pdf-test.ts       # PDF extraction unit tests
npx tsx scripts/throttle-test.ts  # rate-limit throttle timing
```

### Deploying to Vercel
Import the repo, set the three env vars above in **Project → Settings →
Environment Variables**, and deploy. Persistence lives in Supabase, so the
serverless runtime holds no state.

---

## Data model (`lib/types.ts`)

- **Role** — `title`, `company`, `jdText`, `rubric` (`mustHaves`, weighted
  `criteria`, `calibration`)
- **Candidate** — `label`, `rawResume`, `profile`, `score` (`overall`,
  `verdict`, per-criterion `breakdown` with evidence, `risks`, `rationale`),
  `outreach`
- **ChatMessage** — the recruiter ↔ desk transcript per role

Design intent and tone are documented in [`.impeccable.md`](.impeccable.md).

---

## Time spent

_~[fill in] hours over a weekend._

---

## What I'd build next

- **Multi-user auth** with per-recruiter data scoping (Supabase Auth + real RLS
  policies), replacing the current single-tenant service-role access.
- **Store original PDFs** in Supabase Storage so a recruiter can open the source
  file, and add **OCR** for scanned/image-only résumés (currently skipped).
- **Scoring evals** — a regression suite that checks the same résumé + rubric
  yields a consistent score, to catch drift when the model or prompt changes.
- **Outreach send integration** (Gmail/Outlook) instead of draft-only.
- **Dedup & re-screening** — detect the same candidate across reqs, and re-run a
  pipeline when the rubric changes.
- **Paid-model path** for large batches, removing the free-tier daily cap.
