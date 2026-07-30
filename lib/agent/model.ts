import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult, ChatGenerationChunk } from "@langchain/core/outputs";

// The deep-agent harness (supervisor + screener subagent) runs on one model.
// Kimi (Moonshot) is the default: a paid, OpenAI-compatible endpoint whose K2
// models are strong at agentic tool-calling and have the long context this
// harness needs (system prompt + tool schemas + résumé). Set AGENT_PROVIDER to
// "openrouter" or "gemini" to fall back to one of those instead. Every call
// passes through one shared throttle to stay under the per-minute request limit.
// Default 1500ms spaces calls enough for Moonshot's per-minute limits on a normal
// tier; raise it via MODEL_MIN_INTERVAL_MS if the provider rate-limits.
const MIN_INTERVAL_MS = Number(process.env.MODEL_MIN_INTERVAL_MS ?? 1500);

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

// Kimi (Moonshot) is OpenAI-compatible, so it reuses the throttled ChatOpenAI
// path with Moonshot's base URL. The model and base URL can be overridden with
// env vars without a code change (e.g. KIMI_BASE_URL for the .cn endpoint).
function kimi() {
  return new ThrottledChatOpenAI({
    model: process.env.KIMI_MODEL ?? "kimi-k2.6",
    apiKey: process.env.MOONSHOT_API_KEY,
    configuration: {
      baseURL: process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
    },
    maxTokens: 8000,
    maxRetries: 4,
    streaming: true,
  });
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

// Kimi is the default. AGENT_PROVIDER=openrouter | gemini flips to a fallback.
export function createSupervisorModel() {
  switch (process.env.AGENT_PROVIDER) {
    case "openrouter":
      return openRouter();
    case "gemini":
      return gemini();
    default:
      return kimi();
  }
}
