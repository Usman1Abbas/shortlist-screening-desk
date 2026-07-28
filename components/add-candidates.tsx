"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addCandidatesAction,
  addCandidatesFromItemsAction,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function AddCandidates({ roleId }: { roleId: string }) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");

  return (
    <div>
      <div className="mb-4 flex gap-5">
        <ModeTab active={mode === "paste"} onClick={() => setMode("paste")}>
          Paste
        </ModeTab>
        <ModeTab active={mode === "upload"} onClick={() => setMode("upload")}>
          Upload PDFs
        </ModeTab>
      </div>
      {mode === "paste" ? (
        <PasteForm roleId={roleId} />
      ) : (
        <UploadPanel roleId={roleId} />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "label border-b-2 pb-1 transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PasteForm({ roleId }: { roleId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addCandidatesAction(formData);
        formRef.current?.reset();
      }}
    >
      <input type="hidden" name="roleId" value={roleId} />
      <Textarea
        name="resumes"
        required
        rows={6}
        placeholder={
          "Paste résumés here. Separate each one with a line of three dashes:\n\nAmara Okafor — Berlin\nStaff Engineer, Mollie…\n\n---\n\nJonas Reyes — Lisbon\nBackend Engineer, Feedzai…"
        }
        className="resize-y bg-paper-raised text-sm leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Adding does not screen. Ask the desk to screen once they&rsquo;re in.
        </p>
        <PasteSubmit />
      </div>
    </form>
  );
}

function PasteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Filing" : "Add to pipeline"}
    </Button>
  );
}

type Entry = {
  id: string;
  name: string;
  file: File;
  status: "queued" | "extracting" | "ready" | "skipped" | "error";
  text?: string;
  detail?: string;
};

const isPdf = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

function UploadPanel({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, next: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)));

  async function extract(newEntries: Entry[]) {
    // Loaded on demand so pdf.js only ships to browsers that actually upload.
    const { extractPdfText } = await import("@/lib/pdf");
    let i = 0;
    // Small pool so a folder of 100 PDFs doesn't freeze the tab.
    const workers = Array.from(
      { length: Math.min(4, newEntries.length) },
      async () => {
        while (i < newEntries.length) {
          const entry = newEntries[i++];
          patch(entry.id, { status: "extracting" });
          try {
            const text = await extractPdfText(entry.file);
            if (text.replace(/\s/g, "").length < 20) {
              patch(entry.id, {
                status: "skipped",
                detail: "No text layer — scanned image?",
              });
            } else {
              patch(entry.id, { status: "ready", text });
            }
          } catch (err) {
            patch(entry.id, {
              status: "error",
              detail: err instanceof Error ? err.message : "Could not read PDF",
            });
          }
        }
      },
    );
    await Promise.all(workers);
  }

  function onSelected(list: FileList | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter(isPdf);
    if (pdfs.length === 0) {
      toast.error("No PDFs in that selection.");
      return;
    }
    const added: Entry[] = pdfs.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.pdf$/i, ""),
      file,
      status: "queued",
    }));
    setEntries((prev) => [...prev, ...added]);
    void extract(added);
  }

  async function submit() {
    const ready = entries.filter((e) => e.status === "ready" && e.text);
    if (ready.length === 0) return;
    setSubmitting(true);
    try {
      const { added } = await addCandidatesFromItemsAction(
        roleId,
        ready.map((e) => ({ label: e.name, text: e.text! })),
      );
      toast.success(`Added ${added} résumé${added === 1 ? "" : "s"} to the pipeline`);
      setEntries([]);
      router.refresh();
    } catch (err) {
      toast.error("Couldn't add résumés", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const readyCount = entries.filter((e) => e.status === "ready").length;
  const working = entries.some(
    (e) => e.status === "queued" || e.status === "extracting",
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onSelected(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 border border-dashed px-6 py-8 text-center transition-colors bg-paper-raised",
          dragging ? "border-foreground bg-accent/40" : "border-rule-strong",
        )}
      >
        <p className="max-w-sm font-serif text-lg leading-snug text-balance">
          Drop résumé PDFs here
        </p>
        <p className="text-sm text-muted-foreground">
          The filename becomes the candidate. Nothing is uploaded until you add
          them.
        </p>
        <div className="mt-1 flex gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => filesRef.current?.click()}
          >
            Choose files
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => folderRef.current?.click()}
          >
            Choose folder
          </Button>
        </div>
        <input
          ref={filesRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            onSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          // webkitdirectory selects an entire folder; not in React's typings.
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            onSelected(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {entries.length > 0 && (
        <ul className="mt-4 border-t border-rule">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-2"
            >
              <span className="truncate text-sm">{e.name}</span>
              <StatusTag entry={e} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {entries.length === 0
            ? "Adding does not screen. Ask the desk once they’re in."
            : `${readyCount} ready${
                entries.length - readyCount > 0
                  ? `, ${entries.length - readyCount} skipped or reading`
                  : ""
              }.`}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={submitting || working || readyCount === 0}
          onClick={submit}
        >
          {submitting
            ? "Filing"
            : working
              ? "Reading…"
              : `Add ${readyCount || ""} to pipeline`.trim()}
        </Button>
      </div>
    </div>
  );
}

function StatusTag({ entry }: { entry: Entry }) {
  const map: Record<Entry["status"], { text: string; cls: string }> = {
    queued: { text: "queued", cls: "text-muted-foreground" },
    extracting: { text: "reading…", cls: "text-muted-foreground" },
    ready: { text: "ready", cls: "text-strong" },
    skipped: { text: entry.detail ?? "skipped", cls: "text-muted-foreground" },
    error: { text: entry.detail ?? "error", cls: "text-destructive" },
  };
  const { text, cls } = map[entry.status];
  return (
    <span className={cn("label shrink-0 !text-[0.625rem]", cls)}>{text}</span>
  );
}
