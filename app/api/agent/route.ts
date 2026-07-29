import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { createScreeningAgent } from "@/lib/agent";
import { addMessage, listMessages } from "@/lib/store";

export const runtime = "nodejs";
// Screening a batch runs past the default serverless window. 300s is the ceiling
// on Vercel's Hobby plan (Pro allows up to 800). A single sequential screen fits
// comfortably; very large batches on Hobby may need to be split across requests.
export const maxDuration = 300;

type Event =
  | { type: "text"; value: string }
  | { type: "tool"; name: string; source: "main" | "subagent" }
  | { type: "done" }
  | { type: "error"; message: string; rateLimited?: boolean };

export async function POST(req: Request) {
  const { roleId, message } = (await req.json()) as {
    roleId?: string;
    message?: string;
  };

  if (!roleId || !message?.trim()) {
    return Response.json({ error: "roleId and message are required." }, { status: 400 });
  }
  // The agent runs on Gemini by default (or OpenRouter with AGENT_PROVIDER).
  const needsOpenRouter = process.env.AGENT_PROVIDER === "openrouter";
  const key = needsOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      {
        error: needsOpenRouter
          ? "OPENROUTER_API_KEY is not set. Add it to .env.local and restart."
          : "GEMINI_API_KEY is not set. Add it to .env.local and restart.",
      },
      { status: 500 },
    );
  }

  const history = await listMessages(roleId);
  await addMessage(roleId, "user", message);

  const agent = createScreeningAgent(roleId);
  const encoder = new TextEncoder();

  // A closed tab should stop the run. Without this the graph keeps calling the
  // model and writing scores for a reader that no longer exists.
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) => {
        if (abort.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Only the main thread's prose is shown and persisted. Subagent chatter
      // is surfaced as activity, not transcript.
      let answer = "";

      try {
        const events = await agent.stream(
          {
            messages: [
              ...history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: message },
            ],
          },
          {
            streamMode: "messages",
            subgraphs: true,
            recursionLimit: 150,
            signal: abort.signal,
          },
        );

        for await (const [namespace, chunk] of events) {
          const isSubagent = namespace.some((n: string) => n.startsWith("tools:"));
          const [msg] = chunk;

          if (AIMessageChunk.isInstance(msg)) {
            for (const call of msg.tool_call_chunks ?? []) {
              if (call.name) {
                send({
                  type: "tool",
                  name: call.name,
                  source: isSubagent ? "subagent" : "main",
                });
              }
            }
            if (!isSubagent && typeof msg.text === "string" && msg.text) {
              answer += msg.text;
              send({ type: "text", value: msg.text });
            }
          } else if (ToolMessage.isInstance(msg)) {
            // Tool results are written straight to the store; the UI re-reads
            // the pipeline rather than replaying payloads through the stream.
            continue;
          }
        }

        if (answer.trim()) await addMessage(roleId, "assistant", answer);
        send({ type: "done" });
      } catch (error) {
        // Persist whatever was produced before the failure so the transcript
        // doesn't silently lose a partial answer.
        if (answer.trim()) await addMessage(roleId, "assistant", answer);
        // An abort is the client leaving, not a fault worth reporting.
        if (!abort.signal.aborted) {
          const detail = error instanceof Error ? error.message : String(error);
          // Both free tiers were exhausted at once — surface a calm, explanatory
          // message instead of a raw 429 so a reviewer never hits a dead end.
          const rateLimited =
            /429|quota|rate.?limit|resource_exhausted|too many requests|free-models-per-day/i.test(
              detail,
            );
          send({
            type: "error",
            rateLimited,
            message: rateLimited
              ? "The free AI tiers hit their daily request limit. The pipeline below is a complete, pre-screened example that shows the whole workflow — live screening resumes when the free quota resets (daily). No paid key required to review it."
              : detail,
          });
        }
      } finally {
        // Already closed if the client disconnected first.
        try {
          controller.close();
        } catch {}
      }
    },

    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
