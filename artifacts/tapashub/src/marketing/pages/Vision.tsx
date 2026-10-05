import * as React from "react";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { useSeo } from "../lib/useSeo";
import { Reveal } from "../components/Reveal";

const PILLARS = [
  { icon: Sparkles, title: "Create", description: "Build new brands and ideas." },
  { icon: Users, title: "Empower", description: "Give teams the tools, knowledge and systems to execute." },
  { icon: TrendingUp, title: "Scale", description: "Turn promising ideas into businesses capable of growing." },
];

const TIMELINE = ["Ideas", "Brands", "Products", "Technology", "Communities", "Businesses", "Ecosystem"];

export default function Vision() {
  useSeo({
    title: "Vision",
    description:
      "Build greater brands. Build better businesses. Build what comes next — the TapasHub vision for an ecosystem of companies.",
    path: "/vision",
  });

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Our Vision</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Build Greater Brands.
              <br />
              Build Better Businesses.
              <br />
              Build What Comes Next.
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg text-muted-foreground">
              Our vision is to create an ecosystem where ambitious ideas can become meaningful
              brands and sustainable businesses. We want TapasHub to become a place where
              strategy, creativity, technology and entrepreneurship come together to create the
              next generation of companies.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={i * 0.1} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">The Next Chapter</p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              The Next Chapter Is Bigger.
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-4">
            {TIMELINE.map((step, i) => (
              <React.Fragment key={step}>
                <span className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground">
                  {step}
                </span>
                {i < TIMELINE.length - 1 && <span className="text-muted-foreground" aria-hidden="true">→</span>}
              </React.Fragment>
            ))}
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-14 max-w-xl text-lg font-medium text-foreground">
              We are not building one company.
              <br />
              We are building an ecosystem of companies.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
