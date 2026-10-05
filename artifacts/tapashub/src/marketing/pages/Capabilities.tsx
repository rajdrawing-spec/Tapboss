import * as React from "react";
import { Lightbulb, Palette, Cpu, TrendingUp, ShoppingCart, Settings } from "lucide-react";
import { useSeo } from "../lib/useSeo";
import { Reveal } from "../components/Reveal";
import { Card } from "@/components/ui/card";

const CAPABILITY_GROUPS = [
  {
    icon: Lightbulb,
    title: "Strategy",
    items: ["Business Strategy", "Brand Strategy", "Product Strategy", "Go-To-Market Strategy", "Growth Strategy", "Market Research", "Business Models"],
  },
  {
    icon: Palette,
    title: "Creative",
    items: ["Brand Identity", "Art Direction", "UI/UX", "Graphic Design", "Campaign Creative", "Content", "Product Design", "Visual Systems"],
  },
  {
    icon: Cpu,
    title: "Technology",
    items: ["Websites", "E-commerce", "Web Applications", "SaaS Platforms", "AI Products", "Automation", "Internal Business Systems", "Digital Infrastructure"],
  },
  {
    icon: TrendingUp,
    title: "Marketing",
    items: ["Digital Marketing", "Social Media", "Performance Marketing", "Content Marketing", "Brand Marketing", "Customer Acquisition", "Marketing Intelligence"],
  },
  {
    icon: ShoppingCart,
    title: "Sales",
    items: ["E-commerce", "Conversion Strategy", "Sales Systems", "Product Positioning", "Marketplace Strategy", "Customer Journeys"],
  },
  {
    icon: Settings,
    title: "Management",
    items: ["Operations", "Team Systems", "Project Management", "Business Processes", "Launch Management", "Growth Management"],
  },
];

export default function Capabilities() {
  useSeo({
    title: "Capabilities",
    description:
      "What we build with: strategy, creative, technology, marketing, sales and management — the full capability stack behind every TapasHub brand.",
    path: "/capabilities",
  });

  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Capabilities</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">What We Build With.</h1>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_GROUPS.map(({ icon: Icon, title, items }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <Card className="h-full p-6">
                <Icon className="mb-4 h-6 w-6 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{title}</h2>
                <ul className="mt-4 space-y-2">
                  {items.map((item) => (
                    <li key={item} className="text-sm text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
