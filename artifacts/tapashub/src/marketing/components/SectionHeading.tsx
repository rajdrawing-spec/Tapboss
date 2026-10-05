import * as React from "react";
import { Reveal } from "./Reveal";

export function SectionHeading({
  eyebrow,
  heading,
  description,
  align = "left",
}: {
  eyebrow?: string;
  heading: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{heading}</h2>
      {description && <p className="mt-4 text-base text-muted-foreground sm:text-lg">{description}</p>}
    </Reveal>
  );
}
