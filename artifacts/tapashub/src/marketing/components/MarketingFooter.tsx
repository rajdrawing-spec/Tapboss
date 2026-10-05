import * as React from "react";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BRANDS } from "../data/brands";

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/what-we-build", label: "What We Build" },
  { href: "/brands", label: "Our Brands" },
  { href: "/vision", label: "Vision" },
  { href: "/contact", label: "Contact" },
];

const CAPABILITY_LINKS = ["Strategy", "Creative", "Technology", "Marketing", "Sales", "Management"];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="mb-3">
              <span className="text-lg font-black tracking-tight text-foreground">TAPAS</span>
              <span className="text-lg font-black tracking-tight text-primary">HUB</span>
            </div>
            <p className="mb-4 text-sm font-medium text-foreground">
              Creators of Brands. Builders of Businesses.
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              TapasHub is a multi-brand creator and business-building ecosystem combining
              strategy, creativity, technology and execution.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Capabilities</h3>
            <ul className="space-y-2.5">
              {CAPABILITY_LINKS.map((c) => (
                <li key={c}>
                  <Link href="/capabilities" className="text-sm text-muted-foreground hover:text-foreground">
                    {c}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Brands</h3>
            <ul className="space-y-2.5">
              {BRANDS.map((b) => (
                <li key={b.slug}>
                  <Link href="/brands" className="text-sm text-muted-foreground hover:text-foreground">
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">
            Connect ·{" "}
            <a href="mailto:info@tapashub.com" className="text-foreground hover:text-primary">
              info@tapashub.com
            </a>
          </p>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} TapasHub. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link href="/cookies" className="text-xs text-muted-foreground hover:text-foreground">
              Cookie Policy
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href="https://tapboss.tapashub.com"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Lock className="h-3 w-3" />
                  Team Login
                </a>
              </TooltipTrigger>
              <TooltipContent>Internal team access</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </footer>
  );
}
