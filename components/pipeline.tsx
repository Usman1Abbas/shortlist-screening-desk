"use client";

import { useState } from "react";
import type { Candidate, Rubric } from "@/lib/types";
import { RiskLine, ScoreMark, Verdict } from "@/components/verdict";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Pipeline({
  candidates,
  rubric,
}: {
  candidates: Candidate[];
  rubric: Rubric | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = candidates.find((c) => c.id === openId) ?? null;

  if (candidates.length === 0) {
    return (
      <div className="border-t border-rule pt-8">
        <p className="max-w-md font-serif text-xl leading-snug text-balance">
          No résumés yet.
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Paste a batch below, then ask the desk to screen them. Each candidate
          is read by its own subagent, so the twelfth gets the same attention as
          the first.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="border-t border-rule">
        {candidates.map((c, i) => {
          const name = c.profile?.name ?? c.label;
          const meta = [c.profile?.currentTitle, yearsLabel(c)]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={c.id}
              className="settle border-b border-rule"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            >
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="grid w-full grid-cols-[3.25rem_1fr_auto] items-start gap-5 py-5 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
              >
                <ScoreMark
                  score={c.score?.overall ?? null}
                  className="pt-0.5 pl-1"
                />

                <div className="min-w-0">
                  <h3 className="font-serif text-xl leading-tight tracking-tight">
                    {name}
                  </h3>
                  {meta && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {meta}
                    </p>
                  )}
                  {c.score?.risks.length ? (
                    <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                      <span className="text-maybe">&#9679;</span>{" "}
                      {c.score.risks[0].note}
                      {c.score.risks.length > 1 && (
                        <span className="text-rule-strong">
                          {" "}
                          +{c.score.risks.length - 1} more
                        </span>
                      )}
                    </p>
                  ) : null}
                </div>

                <div className="pr-1 text-right">
                  {c.score ? (
                    <Verdict verdict={c.score.verdict} />
                  ) : (
                    <span className="label">Unscreened</span>
                  )}
                  {c.outreach && (
                    <p className="mt-1.5 label !text-[0.625rem]">Drafted</p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 border-rule bg-background p-0 sm:max-w-xl"
        >
          {open && <CandidateDossier candidate={open} rubric={rubric} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function yearsLabel(c: Candidate) {
  const y = c.profile?.yearsExperience;
  return y === null || y === undefined ? null : `${y} yrs`;
}

function CandidateDossier({
  candidate,
  rubric,
}: {
  candidate: Candidate;
  rubric: Rubric | null;
}) {
  const { profile, score, outreach } = candidate;
  const criterionName = (id: string) =>
    rubric?.criteria.find((c) => c.id === id)?.name ?? id;
  const criterionWeight = (id: string) =>
    rubric?.criteria.find((c) => c.id === id)?.weight;

  return (
    <>
      <SheetHeader className="gap-1 border-b-2 border-foreground px-7 pt-7 pb-4">
        <SheetTitle className="font-serif text-3xl leading-none tracking-tight">
          {profile?.name ?? candidate.label}
        </SheetTitle>
        <SheetDescription className="label">
          {[profile?.currentTitle, yearsLabel(candidate)]
            .filter(Boolean)
            .join(" · ") || "Not yet screened"}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="h-[calc(100svh-6.5rem)]">
        <div className="space-y-9 px-7 py-7">
          {score && (
            <section>
              <div className="flex items-baseline gap-4">
                <ScoreMark score={score.overall} className="!text-5xl" />
                <Verdict verdict={score.verdict} className="!text-sm" />
              </div>
              <p className="mt-3 leading-relaxed text-balance">
                {score.rationale}
              </p>
            </section>
          )}

          {score && score.breakdown.length > 0 && (
            <section>
              <h3 className="label border-b border-rule pb-2">
                Against the rubric
              </h3>
              <ul className="divide-y divide-rule">
                {score.breakdown.map((b) => (
                  <li key={b.criterionId} className="py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <h4 className="font-serif text-lg leading-tight">
                        {criterionName(b.criterionId)}
                      </h4>
                      <p className="tnum shrink-0 font-serif text-lg leading-none">
                        {b.score}
                        <span className="text-rule-strong">/10</span>
                      </p>
                    </div>
                    <p className="mt-0.5 label !text-[0.625rem]">
                      weight {criterionWeight(b.criterionId) ?? "—"}
                    </p>
                    <p className="mt-2 border-l-2 border-rule pl-3 text-sm leading-relaxed text-muted-foreground italic">
                      {b.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {score && score.risks.length > 0 && (
            <section>
              <h3 className="label border-b border-rule pb-2">
                Ask on the screen
              </h3>
              <div className="space-y-2.5 pt-3">
                {score.risks.map((r, i) => (
                  <RiskLine key={i} risk={r} />
                ))}
              </div>
            </section>
          )}

          {profile && profile.highlights.length > 0 && (
            <section>
              <h3 className="label border-b border-rule pb-2">Highlights</h3>
              <ul className="space-y-2 pt-3">
                {profile.highlights.map((h, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {profile && profile.skills.length > 0 && (
            <section>
              <h3 className="label border-b border-rule pb-2">Skills named</h3>
              <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                {profile.skills.join(", ")}
              </p>
            </section>
          )}

          {outreach && (
            <section>
              <h3 className="label border-b border-rule pb-2">
                Outreach draft
              </h3>
              <div className="mt-3 bg-paper-raised p-5">
                <p className="font-serif text-lg leading-snug">
                  {outreach.subject}
                </p>
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {outreach.body}
                </p>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="label">Hooks into</span>{" "}
                {outreach.personalizationNotes}
              </p>
            </section>
          )}

          <Accordion type="single" collapsible>
            <AccordionItem value="resume" className="border-rule">
              <AccordionTrigger className="label hover:no-underline">
                Résumé as submitted
              </AccordionTrigger>
              <AccordionContent>
                <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {candidate.rawResume}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </>
  );
}
