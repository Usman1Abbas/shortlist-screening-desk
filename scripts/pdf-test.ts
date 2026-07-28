// Validates PDF text extraction in Node against a generated PDF, exercising the
// same pageText/normalizeText logic the browser path uses.
// Run: npx tsx scripts/pdf-test.ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { normalizeText, pageText } from "../lib/pdf";

async function makePdf(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 800]);
  let y = 750;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 22;
  }
  return pdf.save();
}

async function extract(bytes: Uint8Array): Promise<string> {
  // Legacy build is the Node-compatible one; the browser util uses the default.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(pageText(content.items));
    }
    return normalizeText(pages.join("\n\n"));
  } finally {
    await doc.destroy();
  }
}

async function main() {
  let failures = 0;
  const check = (name: string, cond: boolean) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (!cond) failures++;
  };

  // 1) A normal résumé PDF round-trips to readable text.
  const resume = [
    "Amara Okafor — Berlin",
    "Staff Engineer, Mollie",
    "Led the ledger migration to double-entry, cut p99 from 800ms to 120ms.",
    "Go, PostgreSQL, Kubernetes",
  ];
  const text = await extract(await makePdf(resume));
  console.log("\n--- extracted ---\n" + text + "\n-----------------\n");
  check("extracts the candidate name", text.includes("Amara Okafor"));
  check("extracts a concrete achievement", text.includes("ledger migration"));
  check("preserves line breaks between rows", text.split("\n").length >= 3);

  // 2) A text-less ("scanned image") PDF yields empty → caller marks it skipped.
  const blank = await PDFDocument.create();
  blank.addPage([600, 800]);
  const empty = await extract(await blank.save());
  check("text-less PDF extracts to empty (skip path)", empty.length === 0);

  // 3) normalizeText collapses whitespace deterministically.
  check(
    "normalizeText collapses runs of whitespace/newlines",
    normalizeText("a\t\t b\n\n\n\nc   \n  d") === "a b\n\nc\nd",
  );

  // 4) normalizeText fixes justified-PDF spacing around punctuation.
  check(
    "normalizeText drops stray spaces before punctuation",
    normalizeText("improved output . Built forms , with auth ( live )") ===
      "improved output. Built forms, with auth (live)",
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
