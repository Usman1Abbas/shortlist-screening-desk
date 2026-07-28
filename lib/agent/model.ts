import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult, ChatGenerationChunk } from "@langchain/core/outputs";

// OpenRouter's free tier caps requests per minute, and the agent fans out to a
// screener subagent per candidate — a burst that trips the limit. This throttle
// spaces every model call (main thread AND subagents share the module-level
// gate) so the run stays under the ceiling deterministically, regardless of how
// many candidates are in flight.
//
// 4s between call *starts* → ≤15 req/min (under the ~20/min free cap). It gates
// start times, not completions, so calls whose latencies overlap still finish
// promptly: one candidate's ~4 calls initiate over ~12s and land in ~20-30s —
// well inside the "one résumé under a minute" budget. Tune via env if a
// provider's limit differs.
const MIN_INTERVAL_MS = Number(process.env.OPENROUTER_MIN_INTERVAL_MS ?? 4000);

let gate: Promise<void> = Promise.resolve();
let lastStart = 0;

// Serialises through a single promise chain: each acquire resolves at least
// MIN_INTERVAL_MS after the previous one did.
export function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
  });
  return gate;
}

export class ThrottledChatOpenAI extends ChatOpenAI {
  // With streaming enabled every call funnels through _streamResponseChunks, so
  // that is the single choke point — throttle there. _generate only needs the
  // gate on the non-streaming path, and guarding on this.streaming avoids
  // double-counting one logical request.
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    if (!this.streaming) await throttle();
    return super._generate(messages, options, runManager);
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    await throttle();
    yield* super._streamResponseChunks(messages, options, runManager);
  }
}
