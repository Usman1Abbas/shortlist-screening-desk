// Verifies a rejection round-trips through Supabase (no LLM/quota needed).
// Run: npx tsx scripts/rejection-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import {
  addCandidates,
  createRole,
  getCandidate,
  saveRejection,
  saveScore,
} from "../lib/store";
import { db } from "../lib/supabase";

async function main() {
  const role = await createRole({ title: "TEST", company: "TEST", jdText: "test" });
  try {
    const [cand] = await addCandidates(role.id, [
      { label: "Test Candidate", rawResume: "Led the ledger migration at Acme." },
    ]);
    await saveScore(cand.id, {
      overall: 42, verdict: "no", breakdown: [], risks: [], rationale: "test",
    });
    await saveRejection(cand.id, {
      subject: "Update on your application",
      body: "Thank you for taking the time to apply…",
      acknowledges: "their ledger migration work",
    });
    const back = await getCandidate(cand.id);
    const ok =
      back?.rejection?.subject === "Update on your application" &&
      back?.rejection?.acknowledges === "their ledger migration work";
    console.log(ok ? "PASS: rejection round-trips through Supabase" : "FAIL");
    console.log("stored:", JSON.stringify(back?.rejection));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await db().from("roles").delete().eq("id", role.id); // cascade cleans candidate
  }
}
main().catch((e) => {
  const msg = String(e?.message ?? e);
  if (/rejection|column|schema cache/i.test(msg)) {
    console.error("\n⚠ The 'rejection' column is missing. Run this in Supabase SQL editor:");
    console.error("  alter table candidates add column if not exists rejection jsonb;");
  }
  console.error("\n" + msg);
  process.exit(1);
});
