import * as React from "react";
import { useSeo } from "../lib/useSeo";
import { Reveal } from "../components/Reveal";
import { BrandCard } from "../components/BrandCard";
import { BRANDS, ECOSYSTEM_GROUPS, type EcosystemGroup } from "../data/brands";
import { cn } from "@/lib/utils";

export default function Brands() {
  useSeo({
    title: "Our Brands",
    description:
      "Brands we've built: HUGFAB, TargetGum, Sanchikart, Bhilva Studios, Tikkatails, Throttle Daires, Taparo, Pepalworks, Undertree Games and Tottotoy.",
    path: "/brands",
  });

  const [filter, setFilter] = React.useState<EcosystemGroup | "All">("All");
  const visible = filter === "All" ? BRANDS : BRANDS.filter((b) => b.group === filter);

  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Our Brands</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Brands We've Built.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Every brand begins with an idea. Each one is built for a different opportunity,
            audience and future.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <Reveal className="mb-10 flex flex-wrap justify-center gap-2" role="group" aria-label="Filter brands by category">
          {(["All", ...ECOSYSTEM_GROUPS] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFilter(g)}
              aria-pressed={filter === g}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                filter === g
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {g}
            </button>
          ))}
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((brand, i) => (
            <BrandCard key={brand.slug} brand={brand} size="lg" delay={i * 0.04} />
          ))}
        </div>
      </section>
    </>
  );
}
