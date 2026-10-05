import * as React from "react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";

/**
 * The corporate site always renders in light mode — the premium light
 * aesthetic is part of the brand, not a user setting. Theme tokens are
 * defined on `:root` (light, default) vs `.dark` (an override class on
 * `<html>`), so this forces that class off for as long as the marketing
 * site is mounted and restores whatever it was on unmount, in case someone
 * navigates client-side between a marketing route and an app route during
 * local development (production never does — different hostnames).
 */
export function MarketingLayout({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (hadDark) root.classList.add("dark");
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
