import { readFileSync } from "node:fs";
import { normalizeText, pageText } from "../lib/pdf";

async function main() {
  const path = process.argv[2];
  const bytes = new Uint8Array(readFileSync(path));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const numPages = doc.numPages;
  const pages: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(pageText(content.items));
  }
  await doc.destroy();
  const text = normalizeText(pages.join("\n\n"));
  console.log(`FILE: ${path}`);
  console.log(`pages: ${numPages}   extracted chars: ${text.length}`);
  console.log("---------------- extracted text ----------------");
  console.log(text);
}
main().catch((e) => { console.error(e); process.exit(1); });
