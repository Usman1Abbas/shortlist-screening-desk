// Seeds a role and three résumés so the UI has something to render without
// spending a single token. Run: npx tsx scripts/seed.ts
import { addCandidates, createRole } from "../lib/store";
import { JD, RESUMES } from "./fixtures";

async function main() {
  const role = await createRole({
    title: "Senior Backend Engineer — Ledger",
    company: "Acme Payments",
    jdText: JD,
  });
  await addCandidates(role.id, RESUMES);
  console.log(`Seeded role ${role.id} with ${RESUMES.length} candidates.`);
  console.log(`http://localhost:3000/roles/${role.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
