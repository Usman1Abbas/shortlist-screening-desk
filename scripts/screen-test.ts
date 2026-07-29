// Validates the single-call screener: 1 LLM call produces a full scorecard.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ChatOpenAI } from "@langchain/openai";
import { addCandidates, createRole, getCandidate, saveRubric } from "../lib/store";
import { db } from "../lib/supabase";
import { screenCandidate } from "../lib/agent/screen";
import { JD, RESUMES } from "./fixtures";
import type { Rubric } from "../lib/types";

// Isolate the Groq screener to see the exact scorecard (or error).
const testModel = new ChatOpenAI({
  model: "openai/gpt-oss-120b",
  apiKey: process.env.GROQ_API_KEY,
  configuration: { baseURL: "https://api.groq.com/openai/v1" },
  maxTokens: 4096,
  maxRetries: 3,
});

const RUBRIC: Rubric = {
  mustHaves: ["5+ years backend", "EU work authorization"],
  criteria: [
    { id: "backend-depth", name: "Backend depth", weight: 5, bar: "Owns hard backend systems end to end." },
    { id: "postgres", name: "Postgres / data", weight: 4, bar: "Deep relational/data experience." },
    { id: "ownership", name: "Ownership", weight: 3, bar: "Takes ambiguous problems to production." },
  ],
  calibration: "Senior means owning a system end to end at a lean team.",
};

async function main() {
  const role = await createRole({ title: "TEST", company: "TEST", jdText: JD });
  try {
    await saveRubric(role.id, RUBRIC);
    const [cand] = await addCandidates(role.id, [RESUMES[0]]);
    console.log("screening", cand.label, "…");
    const result = await screenCandidate(role.id, cand.id, testModel);
    console.log("screen result:", JSON.stringify(result));
    const back = await getCandidate(cand.id);
    console.log("profile.name:", back?.profile?.name);
    console.log("overall/verdict:", back?.score?.overall, back?.score?.verdict);
    console.log("breakdown criteria:", back?.score?.breakdown.map((b) => `${b.criterionId}=${b.score}`).join(", "));
    const ok = !!back?.score && back.score.breakdown.length === RUBRIC.criteria.length && !!back.profile;
    console.log(ok ? "PASS: one call produced a complete scorecard" : "FAIL");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await db().from("roles").delete().eq("id", role.id);
  }
}
main().catch((e) => { console.error("FAIL:", (e?.message ?? String(e)).slice(0, 240)); process.exit(1); });
