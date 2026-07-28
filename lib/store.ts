import { db } from "./supabase";
import type {
  Candidate,
  ChatMessage,
  Outreach,
  Profile,
  Role,
  Rubric,
  Score,
} from "./types";

// Supabase persistence. Every read/write in the app goes through this module,
// so the tables are an implementation detail — call sites elsewhere only see
// the domain types below. Columns are snake_case; these mappers are the only
// place that boundary is crossed.

type RoleRow = {
  id: string;
  title: string;
  company: string;
  jd_text: string;
  rubric: Rubric | null;
  created_at: string;
};

type CandidateRow = {
  id: string;
  role_id: string;
  label: string;
  raw_resume: string;
  profile: Profile | null;
  score: Score | null;
  outreach: Outreach | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  role_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function toRole(r: RoleRow): Role {
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    jdText: r.jd_text,
    rubric: r.rubric,
    createdAt: r.created_at,
  };
}

function toCandidate(c: CandidateRow): Candidate {
  return {
    id: c.id,
    roleId: c.role_id,
    label: c.label,
    rawResume: c.raw_resume,
    profile: c.profile,
    score: c.score,
    outreach: c.outreach,
    createdAt: c.created_at,
  };
}

function toMessage(m: MessageRow): ChatMessage {
  return {
    id: m.id,
    roleId: m.role_id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
  };
}

// Postgres handles concurrency, so the JSON-file write queue is gone: each
// tool call issues an independent, targeted UPDATE and they don't clobber
// each other the way interleaved read-modify-write cycles on one file could.

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await db()
    .from("roles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as RoleRow[]).map(toRole);
}

export async function getRole(roleId: string): Promise<Role | null> {
  const { data, error } = await db()
    .from("roles")
    .select("*")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRole(data as RoleRow) : null;
}

export async function createRole(input: {
  title: string;
  company: string;
  jdText: string;
}): Promise<Role> {
  const { data, error } = await db()
    .from("roles")
    .insert({
      title: input.title,
      company: input.company,
      jd_text: input.jdText,
      rubric: null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toRole(data as RoleRow);
}

export async function saveRubric(roleId: string, rubric: Rubric): Promise<Role> {
  const { data, error } = await db()
    .from("roles")
    .update({ rubric })
    .eq("id", roleId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toRole(data as RoleRow);
}

export async function listCandidates(roleId: string): Promise<Candidate[]> {
  const { data, error } = await db()
    .from("candidates")
    .select("*")
    .eq("role_id", roleId);
  if (error) throw new Error(error.message);
  // Ranked best first; unscored candidates sink to the bottom.
  return (data as CandidateRow[])
    .map(toCandidate)
    .sort((a, b) => (b.score?.overall ?? -1) - (a.score?.overall ?? -1));
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const { data, error } = await db()
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCandidate(data as CandidateRow) : null;
}

export async function addCandidates(
  roleId: string,
  resumes: { label: string; rawResume: string }[],
): Promise<Candidate[]> {
  if (resumes.length === 0) return [];
  const { data, error } = await db()
    .from("candidates")
    .insert(
      resumes.map((r) => ({
        role_id: roleId,
        label: r.label,
        raw_resume: r.rawResume,
        profile: null,
        score: null,
        outreach: null,
      })),
    )
    .select();
  if (error) throw new Error(error.message);
  return (data as CandidateRow[]).map(toCandidate);
}

async function patchCandidate(
  id: string,
  patch: Partial<Pick<CandidateRow, "profile" | "score" | "outreach">>,
): Promise<Candidate> {
  const { data, error } = await db()
    .from("candidates")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toCandidate(data as CandidateRow);
}

export function saveProfile(id: string, profile: Profile) {
  return patchCandidate(id, { profile });
}

export function saveScore(id: string, score: Score) {
  return patchCandidate(id, { score });
}

export function saveOutreach(id: string, outreach: Outreach) {
  return patchCandidate(id, { outreach });
}

export async function listMessages(roleId: string): Promise<ChatMessage[]> {
  const { data, error } = await db()
    .from("messages")
    .select("*")
    .eq("role_id", roleId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as MessageRow[]).map(toMessage);
}

export async function addMessage(
  roleId: string,
  role: "user" | "assistant",
  content: string,
): Promise<ChatMessage> {
  const { data, error } = await db()
    .from("messages")
    .insert({ role_id: roleId, role, content })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toMessage(data as MessageRow);
}
