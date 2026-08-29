import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Outbound email templates interpolate user-/DB-controlled values (names,
 * company names, roles, email addresses) into HTML. Those values MUST be
 * escaped so a malicious value can't inject markup/links into a trusted,
 * branded email (phishing / content spoofing). We mock the Resend HTTP API
 * to capture the exact payload that would be sent and assert on the HTML.
 */

const { resendFetch } = vi.hoisted(() => ({
  resendFetch: vi.fn(async (..._args: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "test-id" }),
    text: async () => "",
  })),
}));

import { sendUserInviteEmail, sendShareholderInviteEmail } from "./email";

function lastPayload() {
  const call = resendFetch.mock.calls.at(-1)!;
  return JSON.parse((call[1] as any).body) as { from: string; to: string[]; subject: string; html: string };
}

const INJECTION = `<script>alert(1)</script><a href="https://evil.example">click</a>`;

beforeEach(() => {
  resendFetch.mockClear();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubGlobal("fetch", resendFetch);
});

describe("email HTML escaping", () => {
  it("escapes a malicious name in a user invite", async () => {
    const res = await sendUserInviteEmail({ to: "victim@example.com", name: INJECTION, roleLabel: "Manager" });
    expect(res.ok).toBe(true);
    const { html } = lastPayload();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a malicious role label and inviter name", async () => {
    await sendUserInviteEmail({ to: "a@b.com", name: "Jo", roleLabel: INJECTION, inviterName: INJECTION });
    const { html } = lastPayload();
    expect(html).not.toContain("<script>");
    expect(html.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("escapes a malicious company name in a shareholder invite", async () => {
    await sendShareholderInviteEmail({ to: "sh@example.com", name: "Pat", companyName: INJECTION, shares: 100, ownershipPercent: 12.5 });
    const { html, subject } = lastPayload();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Subject is plain text (not HTML) but must not carry CR/LF header injection.
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("sends the escaped recipient address in the body", async () => {
    await sendUserInviteEmail({ to: `x"@evil<b>`, name: null, roleLabel: "Staff" });
    const { html } = lastPayload();
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});
