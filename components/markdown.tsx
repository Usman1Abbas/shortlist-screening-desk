"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// The desk answers in Markdown (bold, GFM tables, lists). Render it in the
// editorial voice of the rest of the app — hairline rules, small-caps table
// headers, tabular numerals — rather than as raw text.
const components: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="font-serif text-lg leading-snug">{children}</h3>,
  h2: ({ children }) => <h3 className="font-serif text-lg leading-snug">{children}</h3>,
  h3: ({ children }) => <h4 className="font-serif text-base leading-snug">{children}</h4>,
  hr: () => <hr className="border-rule" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-rule-strong pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded bg-paper-raised p-3 text-[0.8125em]">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-paper-raised px-1 py-0.5 font-mono text-[0.8125em]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse tabular-nums">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="label border-b border-rule-strong px-2 py-1.5 text-left !text-[0.625rem]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-rule px-2 py-1.5 align-top">{children}</td>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
