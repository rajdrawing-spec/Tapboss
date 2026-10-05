import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Reveal } from "../components/Reveal";
import { useSeo } from "../lib/useSeo";

const INTEREST_OPTIONS = [
  "Brand Development",
  "Website",
  "E-commerce",
  "Marketing",
  "Technology",
  "AI / Automation",
  "Product Development",
  "Business Strategy",
  "Sales / Growth",
  "Creative Services",
  "Partnership",
  "Other",
];

const BUDGET_OPTIONS = [
  "Exploring",
  "Under ₹1 Lakh",
  "₹1–5 Lakh",
  "₹5–10 Lakh",
  "₹10–25 Lakh",
  "₹25 Lakh+",
  "Not Decided",
];

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  interest: string;
  message: string;
  budget: string;
  /** Honeypot — real visitors never fill this in. */
  website: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  interest: "",
  message: "",
  budget: "",
  website: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Contact() {
  useSeo({
    title: "Contact",
    description: "Have an idea worth building? Start a conversation with TapasHub — info@tapashub.com.",
    path: "/contact",
  });

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [serverError, setServerError] = React.useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.email.trim()) next.email = "Email is required.";
    else if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!form.message.trim()) next.message = "Tell us a little about your idea.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (form.website) return; // honeypot tripped — silently drop
    if (!validate()) return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          interest: form.interest || undefined,
          message: form.message.trim(),
          budget: form.budget || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setStatus("success");
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus("error");
      setServerError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <section className="mx-auto flex max-w-2xl flex-col items-center px-6 py-28 text-center">
        <Reveal>
          <CheckCircle2 className="mx-auto mb-6 h-14 w-14 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Thank you.</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your enquiry has been received. The TapasHub team will review it and get back to you.
          </p>
          <Button className="mt-8" variant="outline" onClick={() => setStatus("idle")}>
            Send another enquiry
          </Button>
        </Reveal>
      </section>
    );
  }

  return (
    <>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <Reveal>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Contact</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Let's Build Something Greater.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Whether you are starting from an idea, building an existing business or looking for
            a team to help bring your next product to life, let's start a conversation.
          </p>
          <a href="mailto:info@tapashub.com" className="mt-4 inline-block font-medium text-primary">
            info@tapashub.com
          </a>
        </Reveal>
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-24">
        <Reveal>
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Honeypot — hidden from sighted users and screen readers, bots fill every field. */}
            <div className="sr-only" aria-hidden="true">
              <label htmlFor="website">Leave this field empty</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                {errors.name && <p id="name-error" className="mt-1.5 text-sm text-destructive">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  className="mt-1.5"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && <p id="email-error" className="mt-1.5 text-sm text-destructive">{errors.email}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" className="mt-1.5" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="company">Company / Brand</Label>
                <Input id="company" className="mt-1.5" value={form.company} onChange={(e) => set("company", e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="interest">What are you looking for?</Label>
              <Select value={form.interest} onValueChange={(v) => set("interest", v)}>
                <SelectTrigger id="interest" className="mt-1.5">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="message">Tell us about your idea *</Label>
              <Textarea
                id="message"
                className="mt-1.5 min-h-32"
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={errors.message ? "message-error" : undefined}
              />
              {errors.message && <p id="message-error" className="mt-1.5 text-sm text-destructive">{errors.message}</p>}
            </div>

            <div>
              <Label htmlFor="budget">Budget Range</Label>
              <Select value={form.budget} onValueChange={(v) => set("budget", v)}>
                <SelectTrigger id="budget" className="mt-1.5">
                  <SelectValue placeholder="Select a range" />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={status === "submitting"}>
              {status === "submitting" ? "Sending…" : "Send Enquiry"}
            </Button>
          </form>
        </Reveal>
      </section>
    </>
  );
}
