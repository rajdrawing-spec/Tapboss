import * as React from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeo } from "../lib/useSeo";
import { SectionHeading } from "../components/SectionHeading";
import { Reveal } from "../components/Reveal";

const BELIEFS = [
  { title: "Think Bigger", description: "Look beyond today's requirement and understand the larger opportunity." },
  { title: "Build Practical", description: "Ideas must become useful products, systems and experiences." },
  { title: "Create Differently", description: "Creativity is not decoration. It is a competitive advantage." },
  { title: "Keep Improving", description: "Every product, campaign and system should become better through learning." },
];

const PRINCIPLES = [
  { title: "Independent Brands", description: "Each brand has its own identity, audience and purpose." },
  { title: "Shared Intelligence", description: "Experience, technology, systems and knowledge can move across the ecosystem." },
  { title: "Continuous Creation", description: "We are constantly exploring new opportunities, products and businesses." },
];

export default function About() {
  useSeo({
    title: "About",
    description:
      "TapasHub is a multi-brand creator and business-building ecosystem. Learn who we are, why we exist and how we work.",
    path: "/about",
  });

  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <Reveal>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            We Build What We Believe Should Exist.
          </h1>
        </Reveal>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 pb-20 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Who We Are</h2>
          <p className="mt-4 text-xl font-semibold text-foreground">
            A multi-brand creator and business-building ecosystem.
          </p>
          <p className="mt-4 text-muted-foreground">
            TapasHub is a multi-brand creator and business-building ecosystem. We create,
            develop and operate brands across technology, fashion, e-commerce, marketing, pets,
            games, creative services and other emerging categories. We bring together strategy,
            creativity, technology, marketing and execution under one ecosystem.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Why TapasHub Exists</h2>
          <p className="mt-4 text-xl font-semibold text-foreground">
            Instead of treating every challenge as a separate service, we bring the complete
            thinking together.
          </p>
          <p className="mt-4 text-muted-foreground">
            Idea → Strategy → Brand → Product → Technology → Marketing → Sales → Growth. Most
            companies hand each of these to a different specialist and hope the pieces line up.
            We build them as one connected system from the start.
          </p>
        </Reveal>
      </section>

      <section className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading eyebrow="What We Believe" heading="We Don't Just Deliver. We Build." align="center" />
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.08}>
                <h3 className="text-lg font-bold text-foreground">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading eyebrow="How We Work" heading="Built Through Experience." description="Behind TapasHub is experience across creative development, game design, technology, marketing, digital products, e-commerce, business development and brand building. That experience allows us to look beyond individual deliverables and understand how the pieces of a business need to work together." />
      </section>

      <section className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading eyebrow="Our Ecosystem" heading="Why We Build Many Brands." description="The world doesn't have one problem, one customer or one opportunity. We believe different ideas deserve different identities. TapasHub provides the ecosystem behind those ideas — allowing each brand to develop its own personality, audience and business model while benefiting from shared experience, technology, creative thinking and execution." />
          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08}>
                <h3 className="text-lg font-bold text-foreground">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Our Vision</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Build greater brands. Build better businesses. Build what comes next.
          </h2>
          <Link href="/vision">
            <Button size="lg" variant="outline" className="mt-8">
              Read Our Vision <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </Reveal>
      </section>
    </>
  );
}
