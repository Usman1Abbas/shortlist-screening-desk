import { createDeepAgent } from "deepagents";
import { buildTools } from "./tools";
import { ThrottledChatOpenAI } from "./model";
import { SCREENER_SUBAGENT_PROMPT, SCREENER_SYSTEM_PROMPT } from "./prompt";

// One agent per request, closed over the role being screened. Constructing it
// is cheap — it is a graph definition, not a connection.
export function createScreeningAgent(roleId: string) {
  const tools = buildTools(roleId);

  // Nemotron served through OpenRouter, which exposes an OpenAI-compatible API —
  // so we drive it with ChatOpenAI pointed at OpenRouter's base URL. The
  // Throttled subclass spaces calls to stay under the free tier's rate limit;
  // maxRetries backs off on any 429 that still slips through.
  const model = new ThrottledChatOpenAI({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    // Free OpenRouter endpoints are individually capacity-limited and return
    // saturation errors under load. Passing a `models` fallback chain across
    // different providers makes OpenRouter try the next when one is unavailable
    // — several flaky free models combine into a reliable setup, at zero cost.
    // OpenRouter caps the fallback array at 3; spread across providers so one
    // provider's saturation doesn't take the whole run down.
    modelKwargs: {
      models: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "google/gemma-4-31b-it:free",
        "cohere/north-mini-code:free",
      ],
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    maxTokens: 16000,
    maxRetries: 8,
    streaming: true,
  });

  return createDeepAgent({
    model,
    tools: tools.all,
    systemPrompt: SCREENER_SYSTEM_PROMPT,
    // deepagents exposes subagents through its built-in `task` tool — this name
    // is the value the model passes as subagent_type, not a tool name.
    subagents: [
      {
        name: "screener",
        description:
          "Screens exactly one candidate against the saved rubric and writes their profile and scorecard. The task description must contain the candidateId and the candidate's label. Invoke once per candidate — they run independently.",
        systemPrompt: SCREENER_SUBAGENT_PROMPT,
        tools: tools.screener,
      },
    ],
  });
}
