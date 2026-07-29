import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as store from "../store";
import { screenCandidate } from "./screen";

// Tools are built per-request and closed over the role being screened, so the
// model never has to carry a role id around and can't accidentally write a
// score into the wrong pipeline.

const criterionSchema = z.object({
  id: z
    .string()
    .describe("Short stable slug, e.g. 'distributed-systems'. Referenced by scores."),
  name: z.string().describe("Human-readable criterion name."),
  weight: z.number().min(1).max(5).describe("Importance, 1-5."),
  bar: z.string().describe("What a strong candidate looks like on this criterion."),
});

export function buildTools(roleId: string) {
  // Closing over roleId keeps it out of the model's hands, but the candidate id
  // still comes from the model — so every write checks the candidate actually
  // belongs to this role before touching it. Without this, one hallucinated or
  // copy-pasted uuid overwrites a candidate on someone else's pipeline.
  async function ownedCandidate(candidateId: string) {
    const candidate = await store.getCandidate(candidateId);
    return candidate && candidate.roleId === roleId ? candidate : null;
  }

  const NOT_OURS = JSON.stringify({
    error:
      "No candidate with that id on this role. Use the candidateIds from get_role or list_candidates.",
  });

  const getRole = tool(
    async () => {
      const role = await store.getRole(roleId);
      if (!role) return JSON.stringify({ error: "Role not found." });
      const candidates = await store.listCandidates(roleId);
      return JSON.stringify({
        title: role.title,
        company: role.company,
        jobDescription: role.jdText,
        rubric: role.rubric,
        rubricExists: role.rubric !== null,
        candidates: candidates.map((c) => ({
          candidateId: c.id,
          label: c.label,
          name: c.profile?.name ?? null,
          screened: c.score !== null,
        })),
      });
    },
    {
      name: "get_role",
      description:
        "Read the job description, the current rubric (null if not built yet), and the roster of candidates with their ids and whether they have been screened. Call this first.",
      schema: z.object({}),
    },
  );

  const saveRubric = tool(
    async (input) => {
      await store.saveRubric(roleId, input);
      return JSON.stringify({
        ok: true,
        criteriaCount: input.criteria.length,
        message: "Rubric saved. All candidates will be scored against it.",
      });
    },
    {
      name: "save_rubric",
      description:
        "Create or replace the scoring rubric for this role. Overwrites any existing rubric, so include every criterion each time. Build this from the job description before screening anyone.",
      schema: z.object({
        mustHaves: z
          .array(z.string())
          .describe("Hard filters. Only things the JD explicitly demands."),
        criteria: z.array(criterionSchema).min(3).max(8),
        calibration: z
          .string()
          .describe("How seniority should be read for this specific role."),
      }),
    },
  );

  const listCandidates = tool(
    async () => {
      const candidates = await store.listCandidates(roleId);
      return JSON.stringify(
        candidates.map((c) => ({
          candidateId: c.id,
          name: c.profile?.name ?? c.label,
          currentTitle: c.profile?.currentTitle ?? null,
          yearsExperience: c.profile?.yearsExperience ?? null,
          overall: c.score?.overall ?? null,
          verdict: c.score?.verdict ?? null,
          risks: c.score?.risks ?? [],
          hasOutreach: c.outreach !== null,
          hasRejection: c.rejection !== null,
        })),
      );
    },
    {
      name: "list_candidates",
      description:
        "Read the whole pipeline: every candidate with their score, verdict and risk flags, ranked best first. Use this to answer questions about the pipeline instead of re-reading resumes.",
      schema: z.object({}),
    },
  );

  const screenCandidateTool = tool(
    async ({ candidateId }) => {
      if (!(await ownedCandidate(candidateId))) return NOT_OURS;
      // The whole screen — read the résumé, extract the profile, score every
      // criterion — happens in one structured model call inside screenCandidate.
      const result = await screenCandidate(roleId, candidateId);
      return JSON.stringify(result);
    },
    {
      name: "screen_candidate",
      description:
        "Screen one candidate against the saved rubric in a single pass: it reads their résumé, extracts a profile, and writes a full scorecard with evidence, risks and a verdict. Call once per candidate. Requires a rubric to exist first. Returns the name, overall score and verdict; read the full pipeline back with list_candidates.",
      schema: z.object({ candidateId: z.string() }),
    },
  );

  const saveOutreach = tool(
    async ({ candidateId, ...outreach }) => {
      if (!(await ownedCandidate(candidateId))) return NOT_OURS;
      await store.saveOutreach(candidateId, outreach);
      return JSON.stringify({ ok: true, subject: outreach.subject });
    },
    {
      name: "save_outreach",
      description:
        "Save a personalised outreach draft for one candidate. Under 150 words, hooked to something specific in their resume.",
      schema: z.object({
        candidateId: z.string(),
        subject: z.string(),
        body: z.string(),
        personalizationNotes: z
          .string()
          .describe("Which resume details this message hooks into, so it can be checked."),
      }),
    },
  );

  const saveRejection = tool(
    async ({ candidateId, ...rejection }) => {
      const candidate = await ownedCandidate(candidateId);
      if (!candidate) return NOT_OURS;
      // Can't write a rejection for someone who was never screened — that is
      // almost always the model rejecting the wrong candidate.
      if (!candidate.score) {
        return JSON.stringify({
          error:
            "This candidate has not been screened yet. Screen them before drafting a rejection.",
        });
      }
      await store.saveRejection(candidateId, rejection);
      return JSON.stringify({ ok: true, subject: rejection.subject });
    },
    {
      name: "save_rejection",
      description:
        "Save a warm, reason-light rejection note for one candidate the recruiter is passing on. Acknowledge one genuine strength, decline kindly, and give no critique of their gaps. Under 120 words.",
      schema: z.object({
        candidateId: z.string(),
        subject: z.string(),
        body: z.string(),
        acknowledges: z
          .string()
          .describe(
            "The genuine strength from their resume this note acknowledges, so it can be checked.",
          ),
      }),
    },
  );

  return {
    all: [
      getRole,
      saveRubric,
      listCandidates,
      screenCandidateTool,
      saveOutreach,
      saveRejection,
    ],
  };
}
