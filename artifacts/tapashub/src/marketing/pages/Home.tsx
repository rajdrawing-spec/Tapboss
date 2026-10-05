import * as React from "react";
import { Link } from "wouter";
import { Lightbulb, Palette, Cpu, TrendingUp, Settings, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeo } from "../lib/useSeo";
import { EcosystemVisual } from "../components/EcosystemVisual";
import { SectionHeading } from "../components/SectionHeading";
import { Reveal } from "../components/Reveal";
import { BrandCard } from "../components/BrandCard";
import { BRANDS } from "../data/brands";

const CAPABILITY_STRIP = [
  { icon: Lightbulb, label: "Strategy", description: "Find opportunities and define direction." },
  { icon: Palette, label: "Creative", description: "Build brands and visual experiences." },
  { icon: Cpu, label: "Technology", description: "Develop products and digital platforms." },
  { icon: TrendingUp, label: "Marketing", description: "Create campaigns and drive growth." },
  { icon: ArrowRight, label: "Sales", description: "Build journeys and increase conversions." },
  { icon: Settings, label: "Management", description: "Support teams and operate at scale." },
];

const INTRO_STEPS = [
  { n: "01", title: "Think", subtitle: "Strategy & Ideas" },
  { n: "02", title: "Create", subtitle: "Brand & Creative" },
  { n: "03", title: "Build", subtitle: "Technology & Products" },
  { n: "04", title: "Grow", subtitle: "Marketing & Sales" },
  { n: "05", title: "Operate", subtitle: "Management & Execution" },
];

export default function Home() {
  useSeo({
    title: "TapasHub — Creators of Brands. Builders of Businesses.",
    description:
      "TapasHub is a multi-brand creator and business-building ecosystem combining strategy, creativity, technology, marketing and execution to build greater brands and businesses.",
    path: "/",
  });

  return (
    <>
      {/* HERO */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Creators of Brands. Builders of Businesses.
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            We Create Brands That <span className="text-primary">Move Forward.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            TapasHub is a multi-brand creator and business-building ecosystem. We combine
            strategy, creativity, technology, marketing and execution to turn ambitious ideas
            into real businesses.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/brands">
              <Button size="lg" className="w-full sm:w-auto">
                Explore Our Brands <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Build With Us
              </Button>
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="mx-auto w-full max-w-[440px]">
          <EcosystemVisual className="aspect-square w-full" />
        </Reveal>
      </section>

      {/* CAPABILITY STRIP */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {CAPABILITY_STRIP.map(({ icon: Icon, label, description }) => (
            <div key={label} className="bg-card px-5 py-8">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INTRODUCTION */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading
          eyebrow="Our Approach"
          heading="One Ecosystem. Many Ideas. One Vision."
          description="TapasHub exists to help ideas become brands, products and businesses. We believe great companies are built when strategy meets creativity, technology meets execution, and ideas meet people who know how to turn them into reality."
        />
        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {INTRO_STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.06}>
              <p className="text-sm font-bold text-primary">{step.n}</p>
              <p className="mt-2 text-lg font-bold text-foreground">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BRANDS TEASER */}
      <section className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Our Brands" heading="Brands We've Built." description="Every brand begins with an idea. Each one is built for a different opportunity, audience and future." />
            <Link href="/brands" className="shrink-0">
              <Button variant="outline">
                View All Brands <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BRANDS.slice(0, 6).map((brand, i) => (
              <BrandCard key={brand.slug} brand={brand} delay={i * 0.05} />
            ))}
          </div>
        </div>
      </section>

      {/* VISION TEASER */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <Reveal className="mx-auto max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Our Vision</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Build greater brands. Build better businesses. Build what comes next.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Our vision is to create an ecosystem where ambitious ideas can become meaningful
            brands and sustainable businesses.
          </p>
          <Link href="/vision">
            <Button size="lg" variant="outline" className="mt-8">
              Explore Our Vision <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </Reveal>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Have an idea? Let's build what comes next.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/contact">
                <Button size="lg">Start a Conversation</Button>
              </Link>
              <Link href="/brands">
                <Button size="lg" variant="outline">Explore Our Brands</Button>
              </Link>
            </div>
            <a href="mailto:info@tapashub.com" className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground">
              info@tapashub.com
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
