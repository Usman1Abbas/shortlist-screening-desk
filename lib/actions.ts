"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as store from "./store";

export async function createRoleAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const jdText = String(formData.get("jdText") ?? "").trim();

  if (!title || !jdText) return;

  const role = await store.createRole({
    title,
    company: company || "Unspecified",
    jdText,
  });
  revalidatePath("/");
  redirect(`/roles/${role.id}`);
}

export async function addCandidatesAction(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "");
  const blob = String(formData.get("resumes") ?? "").trim();
  if (!roleId || !blob) return;

  // Recruiters paste several resumes at once. A line of three or more dashes
  // is the separator — simple enough to explain in the placeholder text.
  const chunks = blob
    .split(/^\s*-{3,}\s*$/m)
    .map((c) => c.trim())
    .filter(Boolean);

  await store.addCandidates(
    roleId,
    chunks.map((raw, i) => ({
      // First non-empty line is almost always the candidate's name.
      label: raw.split("\n")[0]?.slice(0, 60).trim() || `Candidate ${i + 1}`,
      rawResume: raw,
    })),
  );

  revalidatePath(`/roles/${roleId}`);
}

// Résumés arrive as already-extracted text from the client (PDFs are parsed in
// the browser). Same destination as the pasted path — just a structured payload
// instead of a dashed blob, with the filename carried through as the label.
export async function addCandidatesFromItemsAction(
  roleId: string,
  items: { label: string; text: string }[],
): Promise<{ added: number }> {
  if (!roleId || !Array.isArray(items)) return { added: 0 };

  const cleaned = items
    .map((it, i) => ({
      label: String(it?.label ?? "").trim().slice(0, 80) || `Candidate ${i + 1}`,
      rawResume: String(it?.text ?? "").trim(),
    }))
    .filter((it) => it.rawResume.length > 0)
    // Guard against a runaway client sending an unbounded batch.
    .slice(0, 200);

  if (cleaned.length === 0) return { added: 0 };

  await store.addCandidates(roleId, cleaned);
  revalidatePath(`/roles/${roleId}`);
  return { added: cleaned.length };
}
