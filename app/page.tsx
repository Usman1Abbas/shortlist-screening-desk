import Link from "next/link";
import { listCandidates, listRoles } from "@/lib/store";
import { createRoleAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const roles = await listRoles();
  const counts = await Promise.all(
    roles.map(async (role) => {
      const candidates = await listCandidates(role.id);
      return {
        total: candidates.length,
        screened: candidates.filter((c) => c.score).length,
        strong: candidates.filter((c) => c.score?.verdict === "strong").length,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 sm:px-10">
      <header className="border-b-2 border-foreground pt-12 pb-4">
        <div className="flex items-baseline justify-between gap-6">
          <h1 className="font-serif text-4xl leading-none tracking-tight sm:text-5xl">
            Shortlist
          </h1>
          <p className="hidden max-w-xs text-right text-sm text-muted-foreground italic sm:block">
            A screening desk. It reads the job description first, then the
            résumés — in that order, and never the other way round.
          </p>
        </div>
      </header>

      <div className="grid gap-x-16 gap-y-14 pt-12 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="label">Open roles</h2>

          {roles.length === 0 ? (
            <div className="mt-6 border-t border-rule pt-8">
              <p className="max-w-md font-serif text-xl leading-snug text-balance">
                Nothing open yet. Paste a job description and the agent will
                write the scoring rubric before it looks at a single résumé.
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                That order matters: a rubric built after you&rsquo;ve read the
                candidates is a rubric shaped by the candidates.
              </p>
            </div>
          ) : (
            <ul className="mt-4 border-t border-rule">
              {roles.map((role, i) => (
                <li
                  key={role.id}
                  className="settle border-b border-rule"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <Link
                    href={`/roles/${role.id}`}
                    className="group grid grid-cols-[1fr_auto] items-baseline gap-6 py-6 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                  >
                    <div className="pl-1">
                      <h3 className="font-serif text-2xl leading-tight tracking-tight decoration-rule-strong underline-offset-4 group-hover:underline">
                        {role.title}
                      </h3>
                      <p className="mt-1 label">
                        {role.company}
                        {role.rubric ? (
                          <> &middot; {role.rubric.criteria.length} criteria</>
                        ) : (
                          <> &middot; no rubric yet</>
                        )}
                      </p>
                    </div>
                    <div className="pr-1 text-right">
                      <p className="tnum font-serif text-2xl leading-none">
                        {counts[i].screened}
                        <span className="text-rule-strong">
                          /{counts[i].total}
                        </span>
                      </p>
                      <p className="mt-1.5 label">
                        {counts[i].strong > 0 ? (
                          <span className="text-strong">
                            {counts[i].strong} strong
                          </span>
                        ) : (
                          "screened"
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="lg:border-l lg:border-rule lg:pl-10">
          <h2 className="label">Open a role</h2>
          <form action={createRoleAction} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="title" className="label">
                Title
              </label>
              <Input
                id="title"
                name="title"
                required
                placeholder="Senior Backend Engineer"
                className="bg-paper-raised"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="company" className="label">
                Company
              </label>
              <Input
                id="company"
                name="company"
                placeholder="Acme Payments"
                className="bg-paper-raised"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="jdText" className="label">
                Job description
              </label>
              <Textarea
                id="jdText"
                name="jdText"
                required
                rows={12}
                placeholder="Paste the whole thing — requirements, team size, who the role reports to. The agent reads scope and reporting line to calibrate what 'senior' means here."
                className="resize-y bg-paper-raised text-sm leading-relaxed"
              />
            </div>
            <Button type="submit" className="w-full">
              Open role
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}
