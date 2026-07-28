import Link from "next/link";
import { notFound } from "next/navigation";
import { getRole, listCandidates, listMessages } from "@/lib/store";
import { AddCandidates } from "@/components/add-candidates";
import { AgentChat } from "@/components/agent-chat";
import { Pipeline } from "@/components/pipeline";
import { RubricPanel } from "@/components/rubric-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function RolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  const [candidates, messages] = await Promise.all([
    listCandidates(id),
    listMessages(id),
  ]);

  const screened = candidates.filter((c) => c.score).length;
  const strong = candidates.filter((c) => c.score?.verdict === "strong").length;

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 sm:px-10">
      <header className="border-b-2 border-foreground pt-10 pb-4">
        <Link
          href="/"
          className="label transition-colors hover:text-foreground"
        >
          &larr; Shortlist
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <div>
            <h1 className="font-serif text-3xl leading-none tracking-tight text-balance sm:text-4xl">
              {role.title}
            </h1>
            <p className="mt-2 label">{role.company}</p>
          </div>
          <dl className="flex items-baseline gap-8">
            <Stat label="in pipeline" value={candidates.length} />
            <Stat label="screened" value={screened} />
            <Stat label="strong" value={strong} accent={strong > 0} />
          </dl>
        </div>
      </header>

      <div className="grid gap-x-14 gap-y-12 pt-10 lg:grid-cols-[1fr_23rem]">
        <main className="min-w-0">
          <Tabs defaultValue="pipeline">
            <TabsList className="mb-6 bg-transparent p-0">
              <TabsTrigger value="pipeline" className="label">
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="rubric" className="label">
                Rubric
              </TabsTrigger>
              <TabsTrigger value="jd" className="label">
                Job description
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pipeline">
              <Pipeline candidates={candidates} rubric={role.rubric} />
              <section className="mt-12">
                <h2 className="label border-b border-rule pb-2">
                  Add résumés
                </h2>
                <div className="pt-4">
                  <AddCandidates roleId={role.id} />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="rubric">
              <RubricPanel rubric={role.rubric} />
            </TabsContent>

            <TabsContent value="jd">
              <div className="border-t border-rule pt-6">
                <pre className="max-w-prose font-sans text-sm leading-relaxed whitespace-pre-wrap">
                  {role.jdText}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <aside className="lg:sticky lg:top-8 lg:h-[calc(100svh-6rem)] lg:border-l lg:border-rule lg:pl-8">
          <h2 className="label mb-4 border-b border-rule pb-2">
            The desk
          </h2>
          <div className="h-[32rem] lg:h-[calc(100%-3rem)]">
            <AgentChat roleId={role.id} initialMessages={messages} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <dd
        className={`tnum font-serif text-2xl leading-none ${accent ? "text-strong" : ""}`}
      >
        {value}
      </dd>
      <dt className="mt-1.5 label">{label}</dt>
    </div>
  );
}
