// Domain model for the screening desk.
// These shapes are what the agent writes and what the UI renders.

export type Criterion = {
  id: string;
  name: string;
  /** Relative importance, 1-5. Used to weight the overall score. */
  weight: number;
  /** What a strong candidate looks like on this criterion. */
  bar: string;
};

export type Rubric = {
  /** Hard filters. A candidate missing one of these cannot be a "strong" verdict. */
  mustHaves: string[];
  criteria: Criterion[];
  /** How to read seniority for this specific role. */
  calibration: string;
};

export type Profile = {
  name: string;
  currentTitle: string | null;
  yearsExperience: number | null;
  companies: string[];
  skills: string[];
  highlights: string[];
};

export type CriterionScore = {
  criterionId: string;
  /** 0-10 on this criterion. */
  score: number;
  /** Quote or paraphrase from the resume justifying the score. */
  evidence: string;
};

export type Risk = {
  severity: "low" | "medium" | "high";
  note: string;
};

export type Score = {
  /** 0-100, weighted across criteria. */
  overall: number;
  verdict: "strong" | "maybe" | "no";
  breakdown: CriterionScore[];
  risks: Risk[];
  rationale: string;
};

export type Outreach = {
  subject: string;
  body: string;
  /** Which resume details the message hooks into, so a recruiter can sanity-check it. */
  personalizationNotes: string;
};

export type Candidate = {
  id: string;
  roleId: string;
  /** Filename or pasted label, used before the resume has been parsed. */
  label: string;
  rawResume: string;
  profile: Profile | null;
  score: Score | null;
  outreach: Outreach | null;
  createdAt: string;
};

export type Role = {
  id: string;
  title: string;
  company: string;
  jdText: string;
  rubric: Rubric | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  roleId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type Db = {
  roles: Role[];
  candidates: Candidate[];
  messages: ChatMessage[];
};
