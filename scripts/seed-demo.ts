// Seeds a fully-screened demo role so the live app shows the whole workflow the
// moment it is opened — rubric, ranked scorecards with evidence, an outreach
// draft, and a rejection draft — without spending a single token. Idempotent:
// re-running replaces the demo role rather than duplicating it.
// Run: npx tsx scripts/seed-demo.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import {
  addCandidates,
  createRole,
  saveOutreach,
  saveProfile,
  saveRejection,
  saveRubric,
  saveScore,
} from "../lib/store";
import { db } from "../lib/supabase";
import type { Outreach, Profile, Rejection, Rubric, Score } from "../lib/types";

const ROLE = {
  title: "Founding AI / Agent Engineer",
  company: "Z360 · Zikra Infotech",
  jdText: `Z360 (Zikra Infotech) builds software and automation for small businesses.
We're making our first dedicated AI hires to build agent products — internal
tools and client-facing ones — end to end.

You will:
- Design and ship LangGraph deep-agent harnesses: domain knowledge, custom
  tools, tool calling, structured output, and subagent workflows.
- Build the full-stack product around them in Next.js / TypeScript with Tailwind
  and shadcn, backed by Supabase (Postgres).
- Ship to production on Vercel and own the workflow from prototype to reliable,
  client-ready product.

Must have:
- Shipped at least one production LLM-powered application (not just prototypes).
- Works across the full stack — frontend and backend.

Nice to have: RAG, evals, and a pragmatic, ship-fast attitude suited to
small-business clients.`,
};

const RUBRIC: Rubric = {
  mustHaves: [
    "Has shipped at least one production LLM-powered application",
    "Works across the full stack — frontend and backend",
  ],
  criteria: [
    {
      id: "agent-systems",
      name: "LLM agent / orchestration experience",
      weight: 5,
      bar: "Has built production agents — LangGraph or similar, with tool calling and structured output.",
    },
    {
      id: "fullstack-shipping",
      name: "Full-stack shipping (Next.js/TS + backend)",
      weight: 4,
      bar: "Ships real products end to end, not just notebooks or prototypes.",
    },
    {
      id: "product-ownership",
      name: "Owns ambiguous problems to production",
      weight: 4,
      bar: "Takes a vague brief to a reliable, shipped product with evals / guardrails.",
    },
    {
      id: "supabase-data",
      name: "Postgres / Supabase & data modeling",
      weight: 3,
      bar: "Comfortable designing schemas and using Supabase/Postgres in production.",
    },
    {
      id: "smb-pragmatism",
      name: "Pragmatic, client-facing, ships fast",
      weight: 3,
      bar: "Wears many hats and ships quickly for small-business contexts.",
    },
  ],
  calibration: `Z360 is a lean, SMB-focused services company making its first
dedicated AI hires. "Senior" here means someone who can own an agent product end
to end and ship it to real clients fast — not a narrow specialist who needs a
large team around them.`,
};

type Seed = {
  label: string;
  rawResume: string;
  profile: Profile;
  score: Score;
  outreach?: Outreach;
  rejection?: Rejection;
};

const CANDIDATES: Seed[] = [
  {
    label: "Priya Nair",
    rawResume: `Priya Nair — Senior AI Engineer — Bengaluru, India (remote)
priya.nair@example.com

Summary
AI engineer with 6 years shipping production LLM products. I build agent systems
end to end — orchestration, tools, and the full-stack app around them — and I've
owned client-facing products for small businesses.

Experience
Senior AI Engineer, Flowbase (2022–present)
- Built a LangGraph agent platform with tool calling and structured output that
  automates supplier-document intake for SMB retailers; 40+ paying clients.
- Shipped the full stack: Next.js/TypeScript front end, FastAPI + Supabase/
  Postgres backend, deployed on Vercel.
- Owned the product from prototype to production, including evals and a
  human-in-the-loop review gate.

Full-Stack Engineer, Kettle (2019–2022)
- Next.js/TypeScript apps with Supabase auth and Postgres; shipped weekly.

Skills: LangGraph, tool calling, RAG, Next.js, TypeScript, FastAPI,
Supabase/Postgres, Vercel.`,
    profile: {
      name: "Priya Nair",
      currentTitle: "Senior AI Engineer",
      yearsExperience: 6,
      companies: ["Flowbase", "Kettle"],
      skills: [
        "LangGraph", "tool calling", "RAG", "Next.js", "TypeScript",
        "FastAPI", "Supabase/Postgres", "Vercel",
      ],
      highlights: [
        "Built a LangGraph agent platform automating supplier-document intake for 40+ SMB clients",
        "Shipped the full stack (Next.js + FastAPI + Supabase) to production on Vercel",
        "Owned prototype→production including evals and human-in-the-loop review",
      ],
    },
    score: {
      overall: 85,
      verdict: "strong",
      breakdown: [
        { criterionId: "agent-systems", score: 9, evidence: "\"Built a LangGraph agent platform with tool calling and structured output.\"" },
        { criterionId: "fullstack-shipping", score: 9, evidence: "\"Shipped the full stack: Next.js/TypeScript front end, FastAPI + Supabase/Postgres backend, deployed on Vercel.\"" },
        { criterionId: "product-ownership", score: 8, evidence: "\"Owned the product from prototype to production, including evals and a human-in-the-loop review gate.\"" },
        { criterionId: "supabase-data", score: 8, evidence: "\"Next.js/TypeScript apps with Supabase auth and Postgres; shipped weekly.\"" },
        { criterionId: "smb-pragmatism", score: 8, evidence: "\"Automates supplier-document intake for SMB retailers; 40+ paying clients.\"" },
      ],
      risks: [
        { severity: "low", note: "Ask how much of the LangGraph platform she architected herself vs. inherited from an existing codebase." },
      ],
      rationale: "Clears both must-haves and is above the bar on every heavy criterion — production agent work, full-stack shipping, and real SMB clients. The clearest strong in the pipeline.",
    },
    outreach: {
      subject: "Founding AI Engineer at Z360 — your supplier-intake agent stood out",
      body: `Hi Priya,

I'm reaching out about a Founding AI / Agent Engineer role at Z360 (Zikra
Infotech). Your LangGraph platform for supplier-document intake — shipped end to
end with a Supabase backend and a human-in-the-loop gate for 40+ SMB clients — is
almost exactly the kind of agent product we're building for small businesses.

We're a lean team making our first dedicated AI hires, so you'd own agent
products from brief to production. Would you be open to a 20-minute call this
week to see if it's a fit?

Best,
Recruiting, Z360`,
      personalizationNotes: "Hooks into her LangGraph supplier-intake platform, the Supabase backend, the human-in-the-loop gate, and the 40+ SMB clients — all specific to her résumé.",
    },
  },
  {
    label: "Diego Fernández",
    rawResume: `Diego Fernández — Full-Stack Engineer — Lisbon, Portugal
diego.f@example.com

Experience
Full-Stack Engineer, Tenda (2020–present)
- Built and shipped a multi-tenant SaaS in Next.js/TypeScript with a Node +
  Postgres backend; owned CI/CD to Vercel.
- Weekly production releases; led the Supabase migration when the team adopted it.

Side project
- A RAG chatbot over product docs (OpenAI + pgvector) — a weekend prototype,
  not shipped to users.

Skills: Next.js, TypeScript, Node, Postgres, Supabase, Vercel, some OpenAI API.`,
    profile: {
      name: "Diego Fernández",
      currentTitle: "Full-Stack Engineer",
      yearsExperience: 5,
      companies: ["Tenda"],
      skills: ["Next.js", "TypeScript", "Node", "Postgres", "Supabase", "Vercel", "OpenAI API"],
      highlights: [
        "Built and shipped a multi-tenant SaaS (Next.js + Node + Postgres) with CI/CD to Vercel",
        "Led the team's Supabase migration",
        "Weekend RAG chatbot prototype (OpenAI + pgvector), not shipped",
      ],
    },
    score: {
      overall: 68,
      verdict: "maybe",
      breakdown: [
        { criterionId: "agent-systems", score: 4, evidence: "\"A RAG chatbot over product docs (OpenAI + pgvector) — a weekend prototype, not shipped to users.\" No production agent work." },
        { criterionId: "fullstack-shipping", score: 9, evidence: "\"Built and shipped a multi-tenant SaaS in Next.js/TypeScript with a Node + Postgres backend; owned CI/CD to Vercel.\"" },
        { criterionId: "product-ownership", score: 7, evidence: "\"Weekly production releases\" — owns shipping, though on a defined product rather than an open-ended brief." },
        { criterionId: "supabase-data", score: 8, evidence: "\"Led the Supabase migration when the team adopted it.\"" },
        { criterionId: "smb-pragmatism", score: 7, evidence: "Multi-tenant SaaS shipping cadence suggests pragmatic delivery; no explicit SMB/client-facing detail." },
      ],
      risks: [
        { severity: "medium", note: "No production agent work — ask what he'd need to take a RAG prototype to a reliable tool-calling agent, and whether he's shipped one since." },
      ],
      rationale: "Clears must-haves and is excellent on full-stack shipping and Supabase, but agent experience is a weekend prototype. A maybe that turns on one question: can he go from RAG demo to production agent?",
    },
  },
  {
    label: "Wei Chen",
    rawResume: `Wei Chen — Machine Learning Engineer — Toronto, Canada
wei.chen@example.com

Experience
ML Engineer, University AI Lab + contract (2021–present)
- Fine-tuned open LLMs for clinical text extraction; workshop publication.
- Built NLP pipelines in Python with a strong evaluation methodology.
- Deployed one model behind a FastAPI demo endpoint; most work lives in
  notebooks.

Skills: PyTorch, Hugging Face, fine-tuning, RAG, Python, FastAPI. Limited
front-end experience.`,
    profile: {
      name: "Wei Chen",
      currentTitle: "Machine Learning Engineer",
      yearsExperience: 4,
      companies: ["University AI Lab"],
      skills: ["PyTorch", "Hugging Face", "fine-tuning", "RAG", "Python", "FastAPI"],
      highlights: [
        "Fine-tuned open LLMs for clinical text extraction (workshop publication)",
        "Built NLP pipelines with strong evaluation methodology",
        "Deployed one model behind a FastAPI demo endpoint",
      ],
    },
    score: {
      overall: 52,
      verdict: "maybe",
      breakdown: [
        { criterionId: "agent-systems", score: 7, evidence: "\"Fine-tuned open LLMs\" and \"RAG\" — strong model depth, though framed as research rather than tool-calling agents." },
        { criterionId: "fullstack-shipping", score: 3, evidence: "\"Most work lives in notebooks\" and \"Limited front-end experience\" — little full-stack shipping." },
        { criterionId: "product-ownership", score: 5, evidence: "\"Deployed one model behind a FastAPI demo endpoint\" — some production exposure, but demo-stage." },
        { criterionId: "supabase-data", score: 3, evidence: "No evidence of Supabase or Postgres in the résumé." },
        { criterionId: "smb-pragmatism", score: 5, evidence: "Strong evals discipline; no client-facing or SMB context evidenced." },
      ],
      risks: [
        { severity: "high", note: "The 'shipped a production LLM app' must-have hangs on the FastAPI demo — confirm whether it served real users/traffic or stayed a research artifact." },
      ],
      rationale: "Deep on models and evals but thin on full-stack shipping, and the production must-have rests on a single demo endpoint. A maybe only if that demo genuinely served users — otherwise it's a no.",
    },
  },
  {
    label: "Tomás Rivera",
    rawResume: `Tomás Rivera — Web Developer — Manila, Philippines
tomas.r@example.com

Experience
Web Developer, Brightline Agency (2019–present)
- Built 30+ WordPress and Shopify sites for small businesses; HTML/CSS/JS,
  some PHP.
- Set up Google Ads and SEO for clients; strong with clients and deadlines.

Skills: WordPress, Shopify, HTML/CSS, JavaScript, PHP, SEO.
No LLM or agent experience.`,
    profile: {
      name: "Tomás Rivera",
      currentTitle: "Web Developer",
      yearsExperience: 6,
      companies: ["Brightline Agency"],
      skills: ["WordPress", "Shopify", "HTML/CSS", "JavaScript", "PHP", "SEO"],
      highlights: [
        "Built 30+ WordPress and Shopify sites for small businesses",
        "Ran Google Ads and SEO for clients",
        "Strong client and deadline management",
      ],
    },
    score: {
      overall: 32,
      verdict: "no",
      breakdown: [
        { criterionId: "agent-systems", score: 1, evidence: "\"No LLM or agent experience.\"" },
        { criterionId: "fullstack-shipping", score: 4, evidence: "\"HTML/CSS/JS, some PHP\" — front-end/CMS work, no TypeScript backend evidenced." },
        { criterionId: "product-ownership", score: 4, evidence: "Owns client sites end to end, but on templated CMS builds rather than software products." },
        { criterionId: "supabase-data", score: 2, evidence: "No evidence of Postgres/Supabase in the résumé." },
        { criterionId: "smb-pragmatism", score: 6, evidence: "\"Built 30+ WordPress and Shopify sites for small businesses\" and \"strong with clients and deadlines.\"" },
      ],
      risks: [
        { severity: "high", note: "Misses the production-LLM must-have entirely — no agent or LLM work of any kind." },
      ],
      rationale: "Genuinely strong with small-business clients, but misses the production-LLM must-have and has no full-stack software background. Not a fit for a founding agent-engineer role.",
    },
    rejection: {
      subject: "Update on your Z360 application",
      body: `Hi Tomás,

Thank you for taking the time to apply for the Founding AI / Agent Engineer role
at Z360. Your track record building for small businesses — 30+ sites and running
their ads and SEO — clearly shows you know how to deliver for clients and hit
deadlines.

For this particular role we're looking for someone with production LLM/agent and
full-stack software experience, so we won't be moving forward this time. We wish
you the best, and thank you again for your interest in Z360.

Best,
Recruiting, Z360`,
      acknowledges: "His work delivering 30+ sites for small businesses and his strength with clients and deadlines.",
    },
  },
];

async function main() {
  // Idempotent: drop any prior demo role (cascade removes its candidates).
  const { data: existing } = await db()
    .from("roles")
    .select("id")
    .eq("title", ROLE.title)
    .eq("company", ROLE.company);
  for (const r of existing ?? []) {
    await db().from("roles").delete().eq("id", r.id);
  }

  const role = await createRole(ROLE);
  await saveRubric(role.id, RUBRIC);

  for (const seed of CANDIDATES) {
    const [candidate] = await addCandidates(role.id, [
      { label: seed.label, rawResume: seed.rawResume },
    ]);
    await saveProfile(candidate.id, seed.profile);
    await saveScore(candidate.id, seed.score);
    if (seed.outreach) await saveOutreach(candidate.id, seed.outreach);
    if (seed.rejection) await saveRejection(candidate.id, seed.rejection);
  }

  console.log(`Seeded "${ROLE.title}" (${ROLE.company}) with ${CANDIDATES.length} screened candidates.`);
  console.log(`Role id: ${role.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
