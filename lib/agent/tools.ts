import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as store from "../store";

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

const profileSchema = z.object({
  name: z.string().describe("Candidate's full name as written on the resume."),
  currentTitle: z.string().nullable(),
  yearsExperience: z
    .number()
    .nullable()
    .describe("Total relevant years. Null if the resume gives no way to tell."),
  companies: z.array(z.string()),
  skills: z.array(z.string()),
  highlights: z
    .array(z.string())
    .describe("Two or three concrete achievements, quoted or closely paraphrased."),
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

  const readCandidate = tool(
    async ({ candidateId }) => {
      const candidate = await ownedCandidate(candidateId);
      if (!candidate) return NOT_OURS;
      return JSON.stringify({
        candidateId: candidate.id,
        label: candidate.label,
        resume: candidate.rawResume,
      });
    },
    {
      name: "read_candidate",
      description:
        "Read one candidate's full resume text. Expensive in context — screen candidates through delegate_screening rather than calling this in the main thread.",
      schema: z.object({ candidateId: z.string() }),
    },
  );

  const saveProfile = tool(
    async ({ candidateId, ...profile }) => {
      if (!(await ownedCandidate(candidateId))) return NOT_OURS;
      await store.saveProfile(candidateId, profile);
      return JSON.stringify({ ok: true, name: profile.name });
    },
    {
      name: "save_profile",
      description:
        "Write the structured facts extracted from a resume. Call this before save_score.",
      schema: profileSchema.extend({ candidateId: z.string() }),
    },
  );

  const saveScore = tool(
    async ({ candidateId, ...score }) => {
      if (!(await ownedCandidate(candidateId))) return NOT_OURS;
      const role = await store.getRole(roleId);
      const expected = role?.rubric?.criteria.map((c) => c.id) ?? [];
      const got = score.breakdown.map((b) => b.criterionId);
      const missing = expected.filter((id) => !got.includes(id));
      if (missing.length > 0) {
        // Refuse rather than silently persisting a partial scorecard — a
        // breakdown that skips criteria makes the overall score unreadable.
        return JSON.stringify({
          error: `Breakdown is missing criteria: ${missing.join(", ")}. Score every criterion in the rubric, including ones the candidate is weak on.`,
        });
      }
      await store.saveScore(candidateId, score);
      return JSON.stringify({
        ok: true,
        overall: score.overall,
        verdict: score.verdict,
      });
    },
    {
      name: "save_score",
      description:
        "Write a candidate's scorecard. The breakdown must contain one entry per rubric criterion — the call is rejected otherwise.",
      schema: z.object({
        candidateId: z.string(),
        overall: z.number().min(0).max(100).describe("Weighted 0-100."),
        verdict: z.enum(["strong", "maybe", "no"]),
        breakdown: z.array(
          z.object({
            criterionId: z.string().describe("Must match a rubric criterion id."),
            score: z.number().min(0).max(10),
            evidence: z
              .string()
              .describe(
                "Quote or close paraphrase from the resume. Use 'no evidence in resume' when there is nothing to cite.",
              ),
          }),
        ),
        risks: z.array(
          z.object({
            severity: z.enum(["low", "medium", "high"]),
            note: z
              .string()
              .describe("Phrased as something the recruiter can ask on the screen."),
          }),
        ),
        rationale: z.string().describe("Two or three sentences for the recruiter."),
      }),
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
      readCandidate,
      saveProfile,
      saveScore,
      saveOutreach,
      saveRejection,
    ],
    // The screening subagent gets a deliberately narrow surface: it can read
    // the rubric and one resume, and write that candidate's profile and score.
    // It cannot touch the rubric or draft outreach.
    screener: [getRole, readCandidate, saveProfile, saveScore],
  };
}
