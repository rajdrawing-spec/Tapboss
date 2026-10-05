import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Brand } from "../data/brands";
import { Reveal } from "./Reveal";

export function BrandCard({ brand, size = "md", delay = 0 }: { brand: Brand; size?: "md" | "lg"; delay?: number }) {
  const isLive = Boolean(brand.url);

  const inner = (
    <Card
      className="group relative flex h-full flex-col justify-between overflow-hidden p-6 transition-shadow hover:shadow-lg"
      style={{ borderTopColor: brand.accent, borderTopWidth: 3 }}
    >
      <div>
        <div className="mb-4 flex items-start justify-between">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-black"
            style={{ backgroundColor: `${brand.accent}1a`, color: brand.accent }}
          >
            {brand.name.charAt(0)}
          </span>
          {isLive && (
            <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
          )}
        </div>
        <h3 className={size === "lg" ? "text-2xl font-bold text-foreground" : "text-xl font-bold text-foreground"}>
          {brand.name}
        </h3>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{brand.category}</p>
        <p className="mt-3 text-sm text-muted-foreground">{brand.description}</p>
      </div>
      <p className="mt-6 text-sm font-semibold text-primary">
        {isLive ? `Visit ${brand.name}` : "Coming Soon"}
      </p>
    </Card>
  );

  return (
    <Reveal delay={delay} className="h-full">
      {isLive ? (
        <a href={brand.url!} target="_blank" rel="noreferrer" className="block h-full" aria-label={`Visit ${brand.name} (opens in a new tab)`}>
          {inner}
        </a>
      ) : (
        <div className="h-full" aria-label={`${brand.name} — coming soon`}>
          {inner}
        </div>
      )}
    </Reveal>
  );
}
