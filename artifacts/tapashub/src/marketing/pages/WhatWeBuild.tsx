import * as React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeo } from "../lib/useSeo";
import { SectionHeading } from "../components/SectionHeading";
import { Reveal } from "../components/Reveal";

const JOURNEY = [
  { n: "01", title: "Idea", description: "We identify opportunities, problems and new possibilities." },
  { n: "02", title: "Strategy", description: "We define positioning, business models, audiences and growth direction." },
  { n: "03", title: "Brand", description: "We create identities, experiences, stories and visual systems." },
  { n: "04", title: "Product", description: "We transform ideas into products, services and customer experiences." },
  { n: "05", title: "Technology", description: "We build websites, platforms, applications, AI systems and digital infrastructure." },
  { n: "06", title: "Marketing", description: "We create campaigns, content, positioning and customer acquisition systems." },
  { n: "07", title: "Sales", description: "We develop sales journeys, e-commerce experiences and conversion strategies." },
  { n: "08", title: "Growth", description: "We measure, learn, improve and scale." },
  { n: "09", title: "Operate", description: "We support the systems, teams and management required to keep businesses moving." },
];

export default function WhatWeBuild() {
  useSeo({
    title: "What We Build",
    description:
      "From idea to impact — the complete TapasHub building cycle: idea, strategy, brand, product, technology, marketing, sales, growth and operations.",
    path: "/what-we-build",
  });

  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">What We Build</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">From Idea to Impact.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Every TapasHub brand moves through the same complete cycle — nine stages that turn a
            raw opportunity into a working business.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="relative">
          <div className="absolute left-5 top-0 hidden h-full w-px bg-border sm:block" aria-hidden="true" />
          <div className="flex flex-col gap-10">
            {JOURNEY.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.04} className="relative flex gap-6 sm:pl-0">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-bold text-primary">
                  {step.n}
                </div>
                <div className="pt-1.5">
                  <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
                  <p className="mt-1.5 max-w-2xl text-muted-foreground">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <SectionHeading
            align="center"
            eyebrow="What's Next"
            heading="See what each capability actually involves."
          />
          <Link href="/capabilities">
            <Button size="lg" variant="outline" className="mt-8">
              Explore Capabilities <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
