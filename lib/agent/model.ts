import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult, ChatGenerationChunk } from "@langchain/core/outputs";

// Gemini is the primary provider: its free tier has a very large per-minute token
// budget (~250k TPM), which fits this app's long prompts (full résumés + rubric),
// and with the single-call screener a full run is only a handful of requests —
// well within its daily allowance. OpenRouter and Groq stay wired as automatic
// fallbacks (see screen.ts) so one provider being rate-limited or down doesn't
// stop a screen. Every call passes through one shared throttle to stay under the
// per-minute request limit; gating start times lets latency-overlapping calls flow.
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

// --- Providers ---

function gemini(streaming: boolean) {
  return new ThrottledChatGoogle({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    maxOutputTokens: 8000,
    maxRetries: 4,
    streaming,
  });
}

function openRouter() {
  return new ThrottledChatOpenAI({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    maxTokens: 8000,
    maxRetries: 3,
    streaming: false,
  });
}

function groq() {
  return new ThrottledChatOpenAI({
    model: "openai/gpt-oss-120b",
    apiKey: process.env.GROQ_API_KEY,
    configuration: { baseURL: "https://api.groq.com/openai/v1" },
    // Groq's free per-minute token cap is tight, so keep this fallback lean.
    maxTokens: 2500,
    modelKwargs: { reasoning_effort: "low" },
    maxRetries: 4,
    streaming: false,
  });
}

// The supervisor (lean LangGraph agent) streams on Gemini.
export function createSupervisorModel() {
  return gemini(true);
}

// Screening runs on Gemini, then fails over to OpenRouter and Groq. All
// non-streaming: one structured call in, one scorecard out.
export function createScreenPrimary() {
  return gemini(false);
}

export function createScreenFallbacks(): BaseChatModel[] {
  return [openRouter(), groq()];
}
