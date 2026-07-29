// Screens the same candidate via the single-call screener on BOTH Gemini and
// OpenRouter, and prints the scorecards side by side. 1 call per model.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ChatOpenAI } from "@langchain/openai";
import { addCandidates, createRole, getCandidate, saveRubric } from "../lib/store";
import { db } from "../lib/supabase";
import { createScreenPrimary } from "../lib/agent/model";
import { screenCandidate } from "../lib/agent/screen";
import { JD, RESUMES } from "./fixtures";
import type { Rubric } from "../lib/types";

const RUBRIC: Rubric = {
  mustHaves: ["5+ years backend", "EU work authorization"],
  criteria: [
    { id: "backend-depth", name: "Backend depth", weight: 5, bar: "Owns hard backend systems end to end." },
    { id: "postgres", name: "Postgres / data", weight: 4, bar: "Deep relational/data experience." },
    { id: "ownership", name: "Ownership", weight: 3, bar: "Takes ambiguous problems to production." },
  ],
  calibration: "Senior means owning a system end to end at a lean team.",
};

const MODELS: Record<string, () => any> = {
  "Gemini 2.0-flash": () => createScreenPrimary(),
  "OpenRouter Nemotron": () => new ChatOpenAI({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    maxRetries: 4,
  }),
};

async function main() {
  const role = await createRole({ title: "TEST", company: "TEST", jdText: JD });
  await saveRubric(role.id, RUBRIC);
  const [cand] = await addCandidates(role.id, [RESUMES[0]]);
  try {
    for (const [name, make] of Object.entries(MODELS)) {
      console.log("\n========== " + name + " ==========");
      const t = Date.now();
      try {
        const res = await screenCandidate(role.id, cand.id, make());
        if ((res as any).error) { console.log("returned error:", (res as any).error); continue; }
        const c = await getCandidate(cand.id);
        console.log(`overall ${c?.score?.overall}  verdict ${c?.score?.verdict}  (${Math.round((Date.now()-t)/1000)}s)`);
        console.log("breakdown:", c?.score?.breakdown.map((b) => `${b.criterionId}=${b.score}`).join(", "));
        console.log("evidence[0]:", c?.score?.breakdown[0]?.evidence?.slice(0, 140));
        console.log("rationale:", c?.score?.rationale?.slice(0, 200));
      } catch (e) {
        console.log("FAILED:", ((e as Error).message ?? String(e)).slice(0, 180));
      }
    }
  } finally {
    await db().from("roles").delete().eq("id", role.id);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
