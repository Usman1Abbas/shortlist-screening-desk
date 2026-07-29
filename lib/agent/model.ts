import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult, ChatGenerationChunk } from "@langchain/core/outputs";

// The deep-agent harness (supervisor + screener subagent) runs on one model.
// Gemini is the default: its free tier has a large per-minute token budget that
// comfortably fits the harness's context (system prompt + tool schemas + résumé).
// Set AGENT_PROVIDER=openrouter to run on Nemotron instead (a proven fallback if
// a Gemini quota is exhausted). Every call passes through one shared throttle to
// stay under the per-minute request limit.
const MIN_INTERVAL_MS = Number(process.env.MODEL_MIN_INTERVAL_MS ?? 6000);

let gate: Promise<void> = Promise.resolve();
let lastStart = 0;

export function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
  });
  return gate;
}

// Guarding _generate on this.streaming throttles each logical call exactly once
// (streaming funnels through _streamResponseChunks; non-streaming through _generate).
export class ThrottledChatGoogle extends ChatGoogleGenerativeAI {
  async _generate(m: BaseMessage[], o: this["ParsedCallOptions"], r?: CallbackManagerForLLMRun): Promise<ChatResult> {
    if (!this.streaming) await throttle();
    return super._generate(m, o, r);
  }
  async *_streamResponseChunks(m: BaseMessage[], o: this["ParsedCallOptions"], r?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    await throttle();
    yield* super._streamResponseChunks(m, o, r);
  }
}

export class ThrottledChatOpenAI extends ChatOpenAI {
  async _generate(m: BaseMessage[], o: this["ParsedCallOptions"], r?: CallbackManagerForLLMRun): Promise<ChatResult> {
    if (!this.streaming) await throttle();
    return super._generate(m, o, r);
  }
  async *_streamResponseChunks(m: BaseMessage[], o: this["ParsedCallOptions"], r?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    await throttle();
    yield* super._streamResponseChunks(m, o, r);
  }
}

function gemini() {
  return new ThrottledChatGoogle({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    maxOutputTokens: 8000,
    maxRetries: 4,
    streaming: true,
  });
}

function openRouter() {
  return new ThrottledChatOpenAI({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    maxTokens: 8000,
    maxRetries: 4,
    streaming: true,
  });
}

export function createSupervisorModel() {
  return process.env.AGENT_PROVIDER === "openrouter" ? openRouter() : gemini();
}
