import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import * as store from "../store";
import type { Rubric } from "../types";
import { createScreenFallbacks, createScreenPrimary } from "./model";
import { SCREEN_SYSTEM_PROMPT } from "./prompt";

// The whole per-candidate screen in ONE model call: the rubric and résumé go in
// via the prompt (no read tools), and a single structured response comes back
// with the full scorecard (no save tools). Code does the I/O around it. This is
// cheaper, faster, and deterministic — the schema forces a complete scorecard,
// so the "no partial scorecards" guarantee holds without a runtime re-check.

const screenSchema = z.object({
  name: z.string().describe("Candidate's full name as written on the résumé."),
  currentTitle: z.string().nullable(),
  yearsExperience: z
    .number()
    .nullable()
    .describe("Total relevant years, or null if the résumé gives no way to tell."),
  companies: z.array(z.string()),
  skills: z.array(z.string()),
  highlights: z
    .array(z.string())
    .describe("Two or three concrete achievements, quoted or closely paraphrased."),
  breakdown: z
    .array(
      z.object({
        criterionId: z.string().describe("Must match a rubric criterion id."),
        score: z.number().min(0).max(10),
        evidence: z
          .string()
          .describe("Quote/paraphrase from the résumé, or 'no evidence in résumé'."),
      }),
    )
    .describe("Exactly one entry per rubric criterion."),
  risks: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high"]),
      note: z.string().describe("Phrased as a question the recruiter can ask on the screen."),
    }),
  ),
  overall: z.number().min(0).max(100).describe("Weighted 0-100, consistent with the breakdown."),
  verdict: z.enum(["strong", "maybe", "no"]),
  rationale: z.string().describe("Two or three sentences for the recruiter."),
});

function userPrompt(rubric: Rubric, resume: string): string {
  const criteria = rubric.criteria
    .map((c) => `- ${c.id} (${c.name}, weight ${c.weight}): ${c.bar}`)
    .join("\n");
  return `RUBRIC
Must-haves (hard filters): ${rubric.mustHaves.join("; ") || "none"}
Calibration: ${rubric.calibration}
Criteria — score every one of these by id:
${criteria}

RÉSUMÉ
${resume}

Score this candidate against the rubric. Return one breakdown entry for every
criterion id above (including ones they are weak on), the weighted overall (0-100),
the verdict, risk flags as questions, and a short rationale.`;
}

// One structured call, but resilient: it tries the primary provider (Gemini) and
// falls back to a second (OpenRouter) on any failure — so one provider being
// rate-limited or down doesn't stop a screen. `model` is injectable so tests can
// pin a single provider; the app passes nothing and gets the failover chain.
function screener(model?: BaseChatModel) {
  // functionCalling (not json_schema) is the method every provider in the chain
  // supports — Groq's gpt-oss, OpenRouter's Nemotron, and Gemini all do tool calls.
  const structured = (m: BaseChatModel) =>
    m.withStructuredOutput(screenSchema, { name: "scorecard", method: "functionCalling" });
  if (model) return structured(model);
  return structured(createScreenPrimary()).withFallbacks({
    fallbacks: createScreenFallbacks().map(structured),
  });
}

export async function screenCandidate(
  roleId: string,
  candidateId: string,
  model?: BaseChatModel,
) {
  const role = await store.getRole(roleId);
  if (!role?.rubric) {
    return { error: "No rubric exists for this role yet. Build one before screening." };
  }
  const candidate = await store.getCandidate(candidateId);
  if (!candidate || candidate.roleId !== roleId) {
    return { error: "No candidate with that id on this role." };
  }

  const out = (await screener(model).invoke([
    { role: "system", content: SCREEN_SYSTEM_PROMPT },
    { role: "user", content: userPrompt(role.rubric, candidate.rawResume) },
  ])) as z.infer<typeof screenSchema>;

  // Guarantee one entry per criterion even if the model dropped one — a missing
  // criterion is treated as unevidenced rather than silently absent from the UI.
  const byId = new Map(out.breakdown.map((b) => [b.criterionId, b]));
  const breakdown = role.rubric.criteria.map(
    (c) =>
      byId.get(c.id) ?? {
        criterionId: c.id,
        score: 0,
        evidence: "no evidence in résumé",
      },
  );

  await store.saveProfile(candidateId, {
    name: out.name,
    currentTitle: out.currentTitle,
    yearsExperience: out.yearsExperience,
    companies: out.companies,
    skills: out.skills,
    highlights: out.highlights,
  });
  await store.saveScore(candidateId, {
    overall: out.overall,
    verdict: out.verdict,
    breakdown,
    risks: out.risks,
    rationale: out.rationale,
  });

  return { ok: true, name: out.name, overall: out.overall, verdict: out.verdict };
}
