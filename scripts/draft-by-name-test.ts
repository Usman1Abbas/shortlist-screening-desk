// Proves the outreach/rejection fix: the supervisor tools resolve a candidate by
// NAME (not just uuid) and persist, and fail loudly (never silently) on a bad or
// ambiguous handle. Drives the real tools through their .invoke interface.
// Run: npx tsx scripts/draft-by-name-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { buildTools } from "../lib/agent/tools";
import { addCandidates, createRole, getCandidate, saveScreening } from "../lib/store";
import { db } from "../lib/supabase";
import type { Profile, Score } from "../lib/types";

const TEST_COMPANY = "Acme Payments"; // swept by scripts/cleanup-test-roles.ts

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

const profile = (name: string): Profile => ({
  name,
  currentTitle: "Engineer",
  yearsExperience: 5,
  companies: ["Acme"],
  skills: ["x"],
  highlights: ["did a thing"],
});
const score = (verdict: Score["verdict"]): Score => ({
  overall: verdict === "no" ? 30 : 80,
  verdict,
  breakdown: [{ criterionId: "c1", score: 8, evidence: "e" }],
  risks: [],
  rationale: "r",
});

async function main() {
  const role = await createRole({ title: "Draft-by-name test", company: TEST_COMPANY, jdText: "x" });
  const added = await addCandidates(role.id, [
    { label: "Priya Nair", rawResume: "Priya résumé" },
    { label: "Muhammad Usman Abbas", rawResume: "Usman résumé" },
    { label: "Tomás Rivera", rawResume: "Tomás résumé" },
    { label: "Wei Chen", rawResume: "Wei résumé" },
    { label: "Chen Zhao", rawResume: "Zhao résumé" },
    { label: "Ghost Candidate", rawResume: "unscreened résumé" }, // no profile/score
  ]);
  const byLabel = Object.fromEntries(added.map((c) => [c.label, c]));
  await saveScreening(byLabel["Priya Nair"].id, profile("Priya Nair"), score("strong"));
  await saveScreening(byLabel["Muhammad Usman Abbas"].id, profile("Muhammad Usman Abbas"), score("strong"));
  await saveScreening(byLabel["Tomás Rivera"].id, profile("Tomás Rivera"), score("no"));
  await saveScreening(byLabel["Wei Chen"].id, profile("Wei Chen"), score("maybe"));
  await saveScreening(byLabel["Chen Zhao"].id, profile("Chen Zhao"), score("maybe"));

  const tools = buildTools(role.id).all;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (n: string, args: Record<string, unknown>) =>
    (tools.find((t) => t.name === n) as any).invoke(args).then((s: string) => JSON.parse(s));

  // 1) Outreach by full name persists.
  const r1 = await call("save_outreach", {
    candidateId: "Priya Nair",
    subject: "Hi Priya",
    body: "…",
    personalizationNotes: "her platform",
  });
  check("outreach by full name returns ok", r1.ok === true, JSON.stringify(r1));
  check("outreach by full name persisted", (await getCandidate(byLabel["Priya Nair"].id))?.outreach != null);

  // 2) Outreach by partial, lower-case name resolves (contains match).
  const r2 = await call("save_outreach", {
    candidateId: "usman",
    subject: "Hi Usman",
    body: "…",
    personalizationNotes: "his agent system",
  });
  check("outreach by partial name resolves", r2.ok === true && /Usman/.test(r2.candidate), JSON.stringify(r2));
  check("outreach by partial name persisted", (await getCandidate(byLabel["Muhammad Usman Abbas"].id))?.outreach != null);

  // 3) Rejection by name persists.
  const r3 = await call("save_rejection", {
    candidateId: "Tomás Rivera",
    subject: "Update",
    body: "…",
    acknowledges: "his work",
  });
  check("rejection by name returns ok", r3.ok === true, JSON.stringify(r3));
  check("rejection by name persisted", (await getCandidate(byLabel["Tomás Rivera"].id))?.rejection != null);

  // 4) By uuid still works (regression).
  const r4 = await call("save_outreach", {
    candidateId: byLabel["Wei Chen"].id,
    subject: "Hi Wei",
    body: "…",
    personalizationNotes: "n",
  });
  check("outreach by uuid still works", r4.ok === true, JSON.stringify(r4));

  // 5) Unknown name fails loudly (no crash, no ok), lists candidates.
  const r5 = await call("save_outreach", {
    candidateId: "Nobody Here",
    subject: "x",
    body: "x",
    personalizationNotes: "x",
  });
  check("unknown name returns an error, not ok", !r5.ok && typeof r5.error === "string", JSON.stringify(r5));
  check("error names the roster", /Priya Nair/.test(r5.error ?? ""));

  // 6) Ambiguous name ("chen" → Wei Chen + Chen Zhao) is rejected.
  const r6 = await call("save_outreach", {
    candidateId: "chen",
    subject: "x",
    body: "x",
    personalizationNotes: "x",
  });
  check("ambiguous name is rejected", !r6.ok && /matches 2/.test(r6.error ?? ""), JSON.stringify(r6));

  // 7) Rejection on an unscreened candidate is refused (by name).
  const r7 = await call("save_rejection", {
    candidateId: "Ghost Candidate",
    subject: "x",
    body: "x",
    acknowledges: "x",
  });
  check("rejection on unscreened candidate refused", !r7.ok && /not been screened/.test(r7.error ?? ""), JSON.stringify(r7));

  await db().from("roles").delete().eq("company", TEST_COMPANY);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\ndraft-by-name-test threw:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
