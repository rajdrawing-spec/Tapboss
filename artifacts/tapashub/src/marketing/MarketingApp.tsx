import * as React from "react";
import { Link, Route, Switch } from "wouter";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "./components/MarketingLayout";

const Home = React.lazy(() => import("./pages/Home"));
const About = React.lazy(() => import("./pages/About"));
const WhatWeBuild = React.lazy(() => import("./pages/WhatWeBuild"));
const Brands = React.lazy(() => import("./pages/Brands"));
const Capabilities = React.lazy(() => import("./pages/Capabilities"));
const Vision = React.lazy(() => import("./pages/Vision"));
const Contact = React.lazy(() => import("./pages/Contact"));
const Privacy = React.lazy(() => import("./pages/Privacy"));
const Terms = React.lazy(() => import("./pages/Terms"));
const Cookies = React.lazy(() => import("./pages/Cookies"));

function MarketingPageFallback() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function MarketingNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">Page Not Found</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button className="mt-8">Back to Home</Button>
      </Link>
    </div>
  );
}

/** The public TapasHub corporate site — rendered for every hostname except tapboss.*. */
export function MarketingApp() {
  return (
    <MarketingLayout>
      <React.Suspense fallback={<MarketingPageFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
          <Route path="/what-we-build" component={WhatWeBuild} />
          <Route path="/brands" component={Brands} />
          <Route path="/capabilities" component={Capabilities} />
          <Route path="/vision" component={Vision} />
          <Route path="/contact" component={Contact} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/cookies" component={Cookies} />
          <Route component={MarketingNotFound} />
        </Switch>
      </React.Suspense>
    </MarketingLayout>
  );
}
