// Client-side PDF text extraction. Runs in the browser so a folder of résumés
// does its heavy lifting on the recruiter's machine — no file storage, no
// serverless memory/time limits. Only the extracted text reaches the server,
// which flows into the exact same pipeline as pasted résumés.

// Résumés are short; this cap only guards against a pathological PDF blowing up
// the model's context. ~50k chars is ~12k tokens — far more than any real CV.
const MAX_CHARS = 50_000;

export function normalizeText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    // Justified PDFs split a word from its trailing punctuation into separate
    // text runs, leaving "output ." — drop the space before common punctuation.
    .replace(/ +([.,;:!?)\]}])/g, "$1")
    // ...and the mirror case for opening brackets: "( foo" -> "(foo".
    .replace(/([(\[{]) +/g, "$1")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

type PdfTextItem = { str: string; hasEOL?: boolean };

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

// Join one page's text runs. pdf.js marks line ends with hasEOL; everything
// else is separated by a space so words don't run together.
export function pageText(items: unknown[]): string {
  let out = "";
  for (const item of items) {
    if (!isTextItem(item)) continue;
    out += item.str;
    out += item.hasEOL ? "\n" : " ";
  }
  return out;
}

// pdf.js and its worker are imported lazily and configured once, so the bundle
// only loads when a recruiter actually opens the upload tab.
let workerConfigured = false;

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageText(content.items));
    }
    return normalizeText(pages.join("\n\n"));
  } finally {
    await doc.destroy();
  }
}
