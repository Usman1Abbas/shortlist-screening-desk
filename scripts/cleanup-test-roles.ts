// Delete the throwaway roles the smoke / e2e runs leave behind (company
// "Acme Payments"). Candidates and messages cascade off the role's foreign key.
// The seeded demo role (company "Z360 · Zikra Infotech") is untouched.
// Run: npx tsx scripts/cleanup-test-roles.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../lib/supabase";

async function main() {
  const { data, error } = await db()
    .from("roles")
    .delete()
    .eq("company", "Acme Payments")
    .select("id, title");
  if (error) throw new Error(error.message);
  console.log(`Deleted ${data?.length ?? 0} test role(s) (candidates + messages cascaded).`);
  for (const r of data ?? []) console.log(`  - ${r.title}  (${r.id})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
