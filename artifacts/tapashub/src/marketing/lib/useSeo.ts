import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description: string;
  path: string;
}

const SITE_NAME = "TapasHub";
const SITE_URL = "https://tapashub.com";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Sets per-page title, description, canonical URL and OG/Twitter tags on mount. */
export function useSeo({ title, description, path }: SeoOptions): void {
  useEffect(() => {
    const fullTitle = path === "/" ? title : `${title} — ${SITE_NAME}`;
    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", `${SITE_URL}${path}`);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setCanonical(`${SITE_URL}${path}`);
  }, [title, description, path]);
}
