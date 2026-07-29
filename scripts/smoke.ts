// End-to-end check of the agent harness with no browser involved.
// Run: npx tsx scripts/smoke.ts
import { config } from "dotenv";
import { createScreeningAgent } from "../lib/agent";
import { addCandidates, createRole, getRole, listCandidates } from "../lib/store";
import { JD, RESUMES } from "./fixtures";

config({ path: ".env.local" });



async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. Copy .env.local.example to .env.local.");
    process.exit(1);
  }

  const role = await createRole({
    title: "Senior Backend Engineer — Ledger",
    company: "Acme Payments",
    jdText: JD,
  });
  await addCandidates(role.id, RESUMES);
  console.log(`Role ${role.id} with ${RESUMES.length} candidates.\n`);

  const agent = createScreeningAgent(role.id);

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content:
            "Build the rubric for this role, then screen all three candidates and give me the shortlist.",
        },
      ],
    },
    { streamMode: "messages", subgraphs: true, recursionLimit: 150 },
  );

  for await (const [namespace, chunk] of stream) {
    const isSub = (namespace as string[]).some((n) => n.startsWith("tools:"));
    const [msg] = chunk as unknown as [
      { text?: string; tool_call_chunks?: { name?: string }[] },
    ];
    if (msg?.tool_call_chunks?.length) {
      for (const c of msg.tool_call_chunks) {
        if (c.name) process.stdout.write(`\n[${isSub ? "sub" : "main"}] → ${c.name}\n`);
      }
    }
    if (!isSub && typeof msg?.text === "string" && msg.text) process.stdout.write(msg.text);
  }

  console.log("\n\n--- pipeline ---");
  const after = await getRole(role.id);
  console.log("rubric criteria:", after?.rubric?.criteria.map((c) => c.name));
  for (const c of await listCandidates(role.id)) {
    console.log(
      `${c.score?.overall ?? "-"}\t${c.score?.verdict ?? "unscored"}\t${c.profile?.name ?? c.label}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
