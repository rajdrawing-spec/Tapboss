import * as React from "react";
import { useSeo } from "../lib/useSeo";
import { LegalPage } from "../components/LegalPage";

export default function Terms() {
  useSeo({
    title: "Terms",
    description: "Terms of use for tapashub.com.",
    path: "/terms",
  });

  return (
    <LegalPage title="Terms" updated="This policy was last updated for the launch of this site.">
      <p>These terms govern your use of tapashub.com.</p>
      <h2>Use of this site</h2>
      <p>
        This site is provided to share information about TapasHub and the brands we build, and to
        let visitors contact us about potential projects and partnerships. Content on this site
        — including brand names, descriptions and visuals — is the property of TapasHub unless
        otherwise noted.
      </p>
      <h2>External links</h2>
      <p>
        Brand cards on this site link to the independent websites of brands TapasHub has built.
        Each brand operates its own site under its own terms; this policy covers only
        tapashub.com itself.
      </p>
      <h2>Enquiries</h2>
      <p>
        Submitting the contact form does not create any contractual obligation between you and
        TapasHub. Any engagement is formalized separately once both parties agree to proceed.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms can be sent to{" "}
        <a href="mailto:info@tapashub.com" className="text-primary">
          info@tapashub.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
