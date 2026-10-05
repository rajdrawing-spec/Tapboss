import * as React from "react";
import { Link, useLocation } from "wouter";
import { Lock, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { basePath } from "../lib/basePath";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/about", label: "About" },
  { href: "/what-we-build", label: "What We Build" },
  { href: "/brands", label: "Our Brands" },
  { href: "/capabilities", label: "Capabilities" },
  { href: "/vision", label: "Vision" },
  { href: "/contact", label: "Contact" },
];

const TEAM_LOGIN_URL = "https://tapboss.tapashub.com";

function TeamLoginLink({ className = "" }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={TEAM_LOGIN_URL}
          className={`inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground ${className}`}
        >
          <Lock className="h-3 w-3" />
          Team Login
        </a>
      </TooltipTrigger>
      <TooltipContent>Internal team access</TooltipContent>
    </Tooltip>
  );
}

export function MarketingHeader() {
  const [location] = useLocation();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src={`${basePath}/tapashub-logo.png`} alt="TapasHub" className="h-7 w-7 object-contain" />
          <span className="text-base font-black tracking-tight text-foreground">TAPAS</span>
          <span className="text-base font-black tracking-tight text-primary">HUB</span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                location === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <TeamLoginLink />
          <Link href="/contact">
            <Button>Work With Us</Button>
          </Link>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <nav className="mt-10 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-accent"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
              <Link href="/contact" onClick={() => setOpen(false)}>
                <Button className="w-full">Work With Us</Button>
              </Link>
              <TeamLoginLink className="justify-center" />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
