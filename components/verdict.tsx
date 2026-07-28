import { cn } from "@/lib/utils";
import type { Risk, Score } from "@/lib/types";

const VERDICT_COPY: Record<Score["verdict"], string> = {
  strong: "Strong",
  maybe: "Maybe",
  no: "Pass",
};

const VERDICT_CLASS: Record<Score["verdict"], string> = {
  strong: "text-strong",
  maybe: "text-maybe",
  no: "text-reject",
};

export function Verdict({
  verdict,
  className,
}: {
  verdict: Score["verdict"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "label !text-[0.6875rem]",
        VERDICT_CLASS[verdict],
        className,
      )}
    >
      {VERDICT_COPY[verdict]}
    </span>
  );
}

/** The score is the loudest thing on a row — set in the serif, at size. */
export function ScoreMark({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  if (score === null) {
    return (
      <span className={cn("font-serif text-3xl text-rule-strong", className)}>
        —
      </span>
    );
  }
  return (
    <span className={cn("tnum font-serif text-3xl leading-none", className)}>
      {Math.round(score)}
    </span>
  );
}

const SEVERITY_CLASS: Record<Risk["severity"], string> = {
  high: "text-destructive",
  medium: "text-maybe",
  low: "text-muted-foreground",
};

export function RiskLine({ risk }: { risk: Risk }) {
  return (
    <p className="flex gap-2 text-sm leading-relaxed">
      <span
        aria-label={`${risk.severity} risk`}
        className={cn("select-none pt-px", SEVERITY_CLASS[risk.severity])}
      >
        &#9679;
      </span>
      <span className="text-muted-foreground">{risk.note}</span>
    </p>
  );
}
