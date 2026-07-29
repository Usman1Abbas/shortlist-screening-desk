import { createDeepAgent } from "deepagents";
import { buildTools } from "./tools";
import { createSupervisorModel } from "./model";
import { SCREENER_SUBAGENT_PROMPT, SCREENER_SYSTEM_PROMPT } from "./prompt";

// One agent per request, closed over the role being screened. Constructing it
// is cheap — it is a graph definition, not a connection.
//
// A LangGraph deep-agent harness (deepagents): a supervisor that plans and talks
// to the recruiter, delegating each résumé to a screener subagent with a
// deliberately narrow tool surface. One delegation per candidate keeps résumé
// twelve as well-read as résumé one.
export function createScreeningAgent(roleId: string) {
  const tools = buildTools(roleId);
  const model = createSupervisorModel();

  return createDeepAgent({
    model,
    tools: tools.all,
    systemPrompt: SCREENER_SYSTEM_PROMPT,
    subagents: [
      {
        name: "screener",
        description:
          "Screens exactly one candidate against the saved rubric and writes their profile and scorecard. The task description must contain the candidateId and the candidate's label. Invoke once per candidate.",
        systemPrompt: SCREENER_SUBAGENT_PROMPT,
        tools: tools.screener,
        // The subagent shares the supervisor's model.
        model,
      },
    ],
  });
}
