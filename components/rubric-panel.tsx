import type { Rubric } from "@/lib/types";

export function RubricPanel({ rubric }: { rubric: Rubric | null }) {
  if (!rubric) {
    return (
      <div className="border-t border-rule pt-8">
        <p className="max-w-md font-serif text-xl leading-snug text-balance">
          No rubric yet.
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Ask the desk to build one. It reads the job description, picks four to
          seven criteria, weights them, and separates the hard filters from the
          things that are merely important.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule">
      {rubric.mustHaves.length > 0 && (
        <div className="border-b border-rule py-5">
          <h3 className="label">Must have</h3>
          <ul className="mt-2 space-y-1">
            {rubric.mustHaves.map((m, i) => (
              <li key={i} className="text-sm leading-relaxed">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-rule">
        {rubric.criteria.map((c) => (
          <li
            key={c.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-6 py-5"
          >
            <div>
              <h3 className="font-serif text-lg leading-tight tracking-tight">
                {c.name}
              </h3>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {c.bar}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-serif text-xl leading-none">{c.weight}</p>
              <p className="mt-1 label !text-[0.625rem]">weight</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-rule py-5">
        <h3 className="label">Calibration</h3>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground italic">
          {rubric.calibration}
        </p>
      </div>
    </div>
  );
}
