import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { buildTools } from "./tools";
import { createSupervisorModel } from "./model";
import { SCREENER_SYSTEM_PROMPT } from "./prompt";

// One agent per request, closed over the role being screened. Constructing it
// is cheap — it is a graph definition, not a connection.
//
// A lean LangGraph tool-calling agent: it owns the workflow (build the rubric,
// screen each candidate, offer outreach/rejection, talk to the recruiter) via a
// small set of domain tools. Screening a candidate is a single `screen_candidate`
// tool backed by one structured model call — so the whole harness stays light
// enough to run on a generous free tier, with the scoring judgement in screen.ts.
export function createScreeningAgent(roleId: string) {
  const tools = buildTools(roleId);

  return createReactAgent({
    llm: createSupervisorModel(),
    tools: tools.all,
    prompt: SCREENER_SYSTEM_PROMPT,
  });
}
