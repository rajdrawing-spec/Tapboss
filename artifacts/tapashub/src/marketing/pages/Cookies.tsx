import * as React from "react";
import { useSeo } from "../lib/useSeo";
import { LegalPage } from "../components/LegalPage";

export default function Cookies() {
  useSeo({
    title: "Cookie Policy",
    description: "How tapashub.com uses cookies and local storage.",
    path: "/cookies",
  });

  return (
    <LegalPage title="Cookie Policy" updated="This policy was last updated for the launch of this site.">
      <p>
        This site uses only the storage strictly required for it to function — it does not use
        third-party advertising or tracking cookies.
      </p>
      <h2>What we store</h2>
      <p>
        Your browser may keep a small amount of local data (such as your preferred color theme,
        if you change it) so the site remembers it on your next visit. This data stays on your
        device and is never sent to our servers.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to{" "}
        <a href="mailto:info@tapashub.com" className="text-primary">
          info@tapashub.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
