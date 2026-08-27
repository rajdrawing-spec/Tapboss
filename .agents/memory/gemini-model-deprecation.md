---
name: Gemini model deprecation
description: Pinned Gemini model names can 404 for new API keys; prefer the -latest aliases.
---

Direct Gemini API keys created recently get `404 "This model models/gemini-2.5-flash is no longer available to new users"` at `generateContent` — even though the model still appears in `models.list`.

**Why:** Google gates older pinned models per-account; listing is not the same as being callable.

**How to apply:** Use rolling aliases instead of pinned `gemini-2.5-*` names. For catalog vision, prefer `gemini-flash-lite-latest` with a bounded timeout and fall back to `gemini-flash-latest` on transient overload; an upstream 503 can otherwise hold an HTTP request for over two minutes. When a pipeline fails with 404 NOT_FOUND, test an alias before debugging anything else.
