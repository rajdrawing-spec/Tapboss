import * as React from "react";
import { useSeo } from "../lib/useSeo";
import { LegalPage } from "../components/LegalPage";

export default function Privacy() {
  useSeo({
    title: "Privacy Policy",
    description: "How TapasHub collects, uses and protects information submitted through this site.",
    path: "/privacy",
  });

  return (
    <LegalPage title="Privacy Policy" updated="This policy was last updated for the launch of this site.">
      <p>
        This policy explains what information TapasHub collects through tapashub.com and how it
        is used.
      </p>
      <h2>Information we collect</h2>
      <p>
        When you submit the enquiry form on our Contact page, we collect the details you provide
        — your name, email address, and optionally your phone number, company name, area of
        interest, budget range and message. We do not collect this information anywhere else on
        the site.
      </p>
      <h2>How we use it</h2>
      <p>
        We use enquiry information solely to respond to your message and evaluate a potential
        working relationship. We do not sell or share this information with third parties for
        marketing purposes.
      </p>
      <h2>Data retention</h2>
      <p>
        Enquiry submissions are retained as long as reasonably necessary to respond to your
        request and maintain our business records.
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
