// Full end-to-end exercise of the screening harness on Kimi (Moonshot).
// Drives every use case through the real agent in one multi-turn conversation,
// exactly as the /api/agent route does, and verifies Supabase after each step.
// Run: npx tsx scripts/e2e-kimi.ts   (optionally MODEL_MIN_INTERVAL_MS=2000 for speed)
import { config } from "dotenv";
config({ path: ".env.local" });

import { createScreeningAgent } from "../lib/agent";
import { addCandidates, createRole, getRole, listCandidates } from "../lib/store";
import { JD, RESUMES } from "./fixtures";

type Turn = { role: "user" | "assistant"; content: string };

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

// Token accounting. ChatOpenAI streams usage on the final chunk of each LLM
// call; we attribute it to supervisor vs screener with the same namespace flag
// the route uses, and read cache_read so caching wins show up when we add them.
type Usage = { in: number; out: number; cacheRead: number; calls: number };
const zero = (): Usage => ({ in: 0, out: 0, cacheRead: 0, calls: 0 });
const USAGE = { main: zero(), sub: zero() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addUsage(isSub: boolean, um: any) {
  if (!um) return;
  const b = isSub ? USAGE.sub : USAGE.main;
  b.in += um.input_tokens ?? 0;
  b.out += um.output_tokens ?? 0;
  b.cacheRead += um.input_token_details?.cache_read ?? um.input_token_details?.cache_read_input_tokens ?? 0;
  b.calls += 1;
}
const fmt = (u: Usage) => `in ${u.in}\tout ${u.out}\tcache_read ${u.cacheRead}\t(${u.calls} calls)`;

// One turn against the real graph, streaming like the SSE route. Returns the
// main-thread prose so we can thread it back as conversation history.
async function runTurn(roleId: string, history: Turn[], message: string): Promise<string> {
  console.log(`\n\n=== YOU: ${message}\n--- desk:`);
  const agent = createScreeningAgent(roleId);
  const stream = await agent.stream(
    { messages: [...history, { role: "user", content: message }] },
    { streamMode: "messages", subgraphs: true, recursionLimit: 150 },
  );
  let answer = "";
  const before = USAGE.main.in + USAGE.main.out + USAGE.sub.in + USAGE.sub.out;
  for await (const [namespace, chunk] of stream) {
    const isSub = (namespace as string[]).some((n) => n.startsWith("tools:"));
    const [msg] = chunk as unknown as [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { text?: string; tool_call_chunks?: { name?: string }[]; usage_metadata?: any },
    ];
    addUsage(isSub, msg?.usage_metadata);
    for (const c of msg?.tool_call_chunks ?? []) {
      if (c.name) process.stdout.write(`\n  [${isSub ? "sub" : "main"}] → ${c.name}`);
    }
    if (!isSub && typeof msg?.text === "string" && msg.text) {
      answer += msg.text;
      process.stdout.write(msg.text);
    }
  }
  const spent = USAGE.main.in + USAGE.main.out + USAGE.sub.in + USAGE.sub.out - before;
  process.stdout.write(`\n  (turn tokens: ${spent})`);
  return answer;
}

async function main() {
  const provider = process.env.AGENT_PROVIDER ?? "kimi";
  console.log(`Provider: ${provider}  (model: ${process.env.KIMI_MODEL ?? "kimi-k2.6"})`);
  if (!process.env.MOONSHOT_API_KEY) throw new Error("MOONSHOT_API_KEY not set.");

  // --- setup: a role + three résumés that pull the rubric in different directions
  const role = await createRole({
    title: "Senior Backend Engineer — Ledger",
    company: "Acme Payments",
    jdText: JD,
  });
  await addCandidates(role.id, RESUMES);
  console.log(`Role ${role.id} seeded with ${RESUMES.length} candidates.`);
  const history: Turn[] = [];

  // === USE CASE 1 + 2 + 3: build rubric, screen the batch, rank the pipeline
  const a1 = await runTurn(
    role.id,
    history,
    "Build the rubric for this role, then screen all three candidates and give me the shortlist.",
  );
  history.push(
    { role: "user", content: "Build the rubric for this role, then screen all three candidates and give me the shortlist." },
    { role: "assistant", content: a1 },
  );

  const afterScreen = await getRole(role.id);
  const rubric = afterScreen?.rubric;
  check("Rubric built from the JD", !!rubric && rubric.criteria.length >= 3 && rubric.criteria.length <= 8,
    rubric ? `${rubric.criteria.length} criteria, ${rubric.mustHaves.length} must-haves` : "no rubric");

  let cands = await listCandidates(role.id);
  const screened = cands.filter((c) => c.score !== null);
  check("Every candidate screened", screened.length === RESUMES.length,
    `${screened.length}/${RESUMES.length} scored`);

  const rubricIds = (rubric?.criteria ?? []).map((c) => c.id).sort();
  const fullBreakdowns = screened.every((c) => {
    const got = (c.score?.breakdown ?? []).map((b) => b.criterionId).sort();
    return rubricIds.length > 0 && rubricIds.every((id) => got.includes(id));
  });
  check("Each scorecard covers every rubric criterion", fullBreakdowns,
    "save_score's partial-scorecard guard would have rejected otherwise");

  const evidenced = screened.every((c) =>
    (c.score?.breakdown ?? []).every((b) => typeof b.evidence === "string" && b.evidence.length > 0));
  check("Every criterion carries evidence", evidenced);

  const ranked = cands.map((c) => c.score?.overall ?? -1);
  check("Pipeline returned best-first", ranked.every((v, i) => i === 0 || ranked[i - 1] >= v),
    ranked.join(" ≥ "));

  console.log("\n\n  Pipeline:");
  for (const c of cands) {
    console.log(`   ${String(c.score?.overall ?? "-").padStart(3)}  ${c.score?.verdict ?? "unscored"}\t${c.profile?.name ?? c.label}`);
  }

  // === USE CASE 4: outreach for the strongest candidate
  const strongest = cands[0];
  const a2 = await runTurn(role.id, history, `Draft outreach for ${strongest.profile?.name ?? strongest.label}.`);
  history.push(
    { role: "user", content: `Draft outreach for ${strongest.profile?.name ?? strongest.label}.` },
    { role: "assistant", content: a2 },
  );
  cands = await listCandidates(role.id);
  const withOutreach = cands.find((c) => c.outreach !== null);
  check("Outreach draft saved", !!withOutreach,
    withOutreach ? `for ${withOutreach.profile?.name}: "${withOutreach.outreach?.subject}"` : "none saved");

  // === USE CASE 5: rejection for a passed-over candidate
  const weakest = cands[cands.length - 1];
  const a3 = await runTurn(
    role.id,
    history,
    `We're passing on ${weakest.profile?.name ?? weakest.label}. Draft a warm rejection note.`,
  );
  history.push(
    { role: "user", content: `We're passing on ${weakest.profile?.name ?? weakest.label}. Draft a warm rejection note.` },
    { role: "assistant", content: a3 },
  );
  cands = await listCandidates(role.id);
  const withRejection = cands.find((c) => c.rejection !== null);
  check("Rejection draft saved", !!withRejection,
    withRejection ? `for ${withRejection.profile?.name}: acknowledges "${withRejection.rejection?.acknowledges}"` : "none saved");

  // === USE CASE 6: plain-language question about the pipeline
  const a4 = await runTurn(role.id, history, "Who is the single strongest candidate and what's the one risk to ask them about?");
  check("Answered a pipeline question", a4.trim().length > 0 && /[A-Z][a-z]+/.test(a4),
    "responded in prose referencing a candidate");

  // --- token breakdown
  const tin = USAGE.main.in + USAGE.sub.in;
  const tout = USAGE.main.out + USAGE.sub.out;
  console.log(`\n\n==== TOKEN USAGE (whole conversation) ====`);
  console.log(`  supervisor:  ${fmt(USAGE.main)}`);
  console.log(`  screeners :  ${fmt(USAGE.sub)}`);
  console.log(`  ------`);
  console.log(`  input ${tin}   output ${tout}   grand total ${tin + tout}`);
  const cacheRead = USAGE.main.cacheRead + USAGE.sub.cacheRead;
  console.log(`  cache_read on input: ${cacheRead} (${tin ? Math.round((cacheRead / tin) * 100) : 0}% of input already cached)`);
  if (tin + tout === 0) {
    console.log("  ⚠ no usage_metadata captured — provider didn't stream usage; need callback-based capture.");
  }

  // --- summary
  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n\n==== ${passed}/${checks.length} checks passed ====`);
  console.log(`Inspect in the UI:  http://localhost:3000/roles/${role.id}`);
  console.log(`(test role left in Supabase for inspection; delete it from the roles table when done)`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error("\n\nE2E run threw:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
