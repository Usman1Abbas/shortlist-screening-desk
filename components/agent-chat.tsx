"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

// The tool names are internal; recruiters get the verb, not the function name.
const TOOL_COPY: Record<string, string> = {
  get_role: "Reading the job description",
  save_rubric: "Writing the rubric",
  list_candidates: "Reading the pipeline",
  read_candidate: "Reading a résumé",
  save_profile: "Extracting the facts",
  save_score: "Scoring against the rubric",
  save_outreach: "Drafting outreach",
  save_rejection: "Drafting a rejection",
  // deepagents delegates through a single built-in `task` tool.
  task: "Screening a candidate",
  write_todos: "Planning the work",
};

const OPENERS = [
  "Build the rubric for this role.",
  "Screen everyone and give me the shortlist.",
  "Draft outreach for the strong candidates.",
  "Draft rejection notes for the ones we're passing on.",
];

export function AgentChat({
  roleId,
  initialMessages,
}: {
  roleId: string;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content })),
  );
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, streaming, activity]);

  async function send(message: string) {
    if (!message.trim() || busy) return;

    setTurns((t) => [...t, { role: "user", content: message }]);
    setDraft("");
    setStreaming("");
    setActivity([]);
    setBusy(true);

    let answer = "";
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, message }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; keep the trailing partial.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "text") {
            answer += event.value;
            setStreaming(answer);
          } else if (event.type === "tool") {
            const copy = TOOL_COPY[event.name] ?? event.name;
            setActivity((a) => (a.at(-1) === copy ? a : [...a, copy]));
          } else if (event.type === "error") {
            throw Object.assign(new Error(event.message), {
              rateLimited: event.rateLimited === true,
            });
          }
        }
      }
    } catch (error) {
      // A hit on the free tiers' daily limit is expected, not a fault — show it
      // as a calm note in the transcript and point to the pre-screened pipeline,
      // rather than a red "something broke" toast.
      if ((error as { rateLimited?: boolean })?.rateLimited) {
        answer =
          error instanceof Error ? error.message : "Free AI limit reached for today.";
      } else {
        toast.error("The desk stopped mid-task", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (answer.trim()) {
        setTurns((t) => [...t, { role: "assistant", content: answer }]);
      }
      setStreaming("");
      setActivity([]);
      setBusy(false);
      // Tool calls wrote to the store; pull the pipeline back down.
      router.refresh();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {turns.length === 0 && !busy && (
          <div className="pt-1">
            <p className="font-serif text-lg leading-snug text-balance">
              Tell the desk what you need. It reads the job description before
              it reads anyone.
            </p>
            <div className="mt-4 space-y-1.5">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => send(o)}
                  className="block w-full border-b border-rule py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i}>
            <p className="label mb-1.5">
              {turn.role === "user" ? "You" : "Desk"}
            </p>
            <div
              className={cn(
                "text-sm leading-relaxed whitespace-pre-wrap",
                turn.role === "user" &&
                  "border-l-2 border-rule-strong pl-3 text-muted-foreground",
              )}
            >
              {turn.content}
            </div>
          </div>
        ))}

        {busy && (
          <div>
            <p className="label mb-1.5">Desk</p>
            {activity.length > 0 && (
              <ul className="mb-3 space-y-1">
                {activity.map((a, i) => (
                  <li
                    key={`${a}-${i}`}
                    className={cn(
                      "settle text-sm",
                      i === activity.length - 1
                        ? "text-foreground"
                        : "text-rule-strong",
                    )}
                  >
                    {a}
                    {i === activity.length - 1 && !streaming && (
                      <span className="animate-pulse">…</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {streaming ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {streaming}
              </div>
            ) : (
              activity.length === 0 && (
                <p className="text-sm text-muted-foreground">Reading…</p>
              )
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="mt-4 shrink-0 border-t border-rule pt-4"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={3}
          disabled={busy}
          placeholder="Ask the desk…"
          className="resize-none bg-paper-raised text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="label !text-[0.625rem]">&#8984;&#8629; to send</span>
          <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
            {busy ? "Working" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
