// End-to-end test of the PDF-upload and folder-upload path:
//   generate PDFs (a "folder") → extract text (the same pageText/normalizeText
//   the browser uses) → apply the client's skip gate → push through the REAL
//   addCandidatesFromItemsAction server action → verify Supabase.
// The browser adds only File.arrayBuffer + a pdf.js web worker + the drag/drop
// and folder-picker DOM on top of this; that thin wrapper is exercised in-app.
// Run: npx tsx scripts/upload-test.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { PDFDocument, StandardFonts } from "pdf-lib";
import { normalizeText, pageText } from "../lib/pdf";
import { addCandidatesFromItemsAction } from "../lib/actions";
import { createRole, listCandidates } from "../lib/store";
import { db } from "../lib/supabase";

const TEST_COMPANY = "Acme Payments"; // also swept by scripts/cleanup-test-roles.ts

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

// One PDF, one array of pages, each page an array of text lines.
async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([600, 800]);
    let y = 750;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font });
      y -= 22;
    }
  }
  return pdf.save();
}

// Same core as lib/pdf.extractPdfText; legacy build is the Node-compatible one.
async function extractBytes(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      out.push(pageText((await (await doc.getPage(i)).getTextContent()).items));
    }
    return normalizeText(out.join("\n\n"));
  } finally {
    await doc.destroy();
  }
}

// The component's gate + label derivation (components/add-candidates.tsx).
const isReady = (t: string) => t.replace(/\s/g, "").length >= 20;
const labelFromName = (filename: string) => filename.replace(/\.pdf$/i, "");

// Call the real server action, tolerating revalidatePath running outside a
// Next request scope (the DB insert happens before it, so data still lands).
async function ingest(roleId: string, items: { label: string; text: string }[]) {
  try {
    return await addCandidatesFromItemsAction(roleId, items);
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (/revalidat|request scope|static generation|headers|cookies/i.test(m)) return null;
    throw e;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL not set.");

  const role = await createRole({
    title: "PDF upload test",
    company: TEST_COMPANY,
    jdText: "Backend engineer. Postgres, Go.",
  });

  // ---- A "folder" of files: three real résumés (one multi-page) + one scanned.
  const folder: { name: string; bytes: Uint8Array }[] = [
    {
      name: "amara-okafor.pdf",
      bytes: await makePdf([
        ["Amara Okafor — Berlin", "Staff Engineer, Mollie", "Led the ledger migration to double-entry."],
        ["PAGE-TWO-MARKER", "Senior Backend Engineer, N26", "Built the idempotency layer for card auth."],
      ]),
    },
    {
      name: "jonas-reyes.pdf",
      bytes: await makePdf([["Jonas Reyes — Lisbon", "Backend Engineer, Feedzai", "Rust services for fraud scoring."]]),
    },
    {
      name: "TARA-NGUYEN.PDF", // upper-case extension: label strip must be case-insensitive
      bytes: await makePdf([["Tara Nguyen — San Francisco", "Software Engineer, Stripe", "Shipped the retry policy refactor."]]),
    },
    { name: "scanned-photo.pdf", bytes: await makePdf([[]]) }, // no text layer
  ];

  // ---- Extract + gate each, exactly as the browser upload pool does.
  const ready: { label: string; text: string }[] = [];
  const skipped: string[] = [];
  for (const f of folder) {
    const text = await extractBytes(f.bytes);
    if (isReady(text)) ready.push({ label: labelFromName(f.name), text });
    else skipped.push(f.name);
  }

  check("Folder: 3 résumés extracted ready, 1 scanned skipped", ready.length === 3 && skipped.length === 1,
    `ready=[${ready.map((r) => r.label).join(", ")}] skipped=[${skipped.join(", ")}]`);
  const amara = ready.find((r) => r.label === "amara-okafor");
  check("Multi-page PDF: both pages extracted", !!amara && amara.text.includes("Amara Okafor") && amara.text.includes("PAGE-TWO-MARKER"));
  check("Label strips .pdf case-insensitively", ready.some((r) => r.label === "TARA-NGUYEN"));

  // ---- Push the ready batch through the real server action.
  const res = await ingest(role.id, ready);
  if (res) check("Action reports 3 added", res.added === 3, `added=${res.added}`);
  let inDb = await listCandidates(role.id);
  check("3 candidates landed in Supabase", inDb.length === 3, `${inDb.length} rows`);
  check("Scanned PDF did not create a candidate", !inDb.some((c) => c.label.includes("scanned")));
  const dbAmara = inDb.find((c) => c.label === "amara-okafor");
  check("Stored résumé text carried through intact", !!dbAmara && dbAmara.rawResume.includes("idempotency layer"));

  // ---- Edge: empty / whitespace-only text is filtered out (not inserted).
  await ingest(role.id, [{ label: "ghost", text: "   \n\t  " }]);
  inDb = await listCandidates(role.id);
  check("Empty-text item filtered (still 3)", inDb.length === 3, `${inDb.length} rows`);

  // ---- Edge: blank label falls back to "Candidate N".
  await ingest(role.id, [{ label: "   ", text: "A résumé with more than twenty characters of text." }]);
  inDb = await listCandidates(role.id);
  check("Blank label falls back to 'Candidate 1'", inDb.some((c) => c.label === "Candidate 1"), inDb.map((c) => c.label).join(", "));

  // ---- Edge: a non-array payload is rejected without touching the DB.
  const guard = await addCandidatesFromItemsAction(role.id, null as unknown as { label: string; text: string }[]);
  check("Non-array payload returns {added:0}", guard.added === 0);

  // ---- Edge: a runaway folder is capped at 200.
  const big = await createRole({ title: "PDF cap test", company: TEST_COMPANY, jdText: "x" });
  const many = Array.from({ length: 205 }, (_, i) => ({ label: `f${i}.pdf`, text: `Résumé number ${i} with plenty of text.` }));
  await ingest(big.id, many);
  const capped = await listCandidates(big.id);
  check("Folder over 200 files is capped at 200", capped.length === 200, `${capped.length} rows`);

  // ---- Cleanup the roles this test created.
  await db().from("roles").delete().eq("company", TEST_COMPANY);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nupload-test threw:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
