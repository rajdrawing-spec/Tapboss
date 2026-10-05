import * as React from "react";
import { Reveal } from "./Reveal";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted-foreground">{updated}</p>}
        <div className="prose prose-sm mt-10 max-w-none text-muted-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mt-3 [&_p]:leading-relaxed">
          {children}
        </div>
      </Reveal>
    </section>
  );
}
