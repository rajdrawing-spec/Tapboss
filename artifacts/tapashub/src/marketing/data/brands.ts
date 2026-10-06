/**
 * Central brand registry for the TapasHub corporate site. Every brand card,
 * the ecosystem visual, and the footer brand list all read from this one
 * array — adding or updating a brand (or flipping a URL from "coming soon"
 * to live) only ever needs a change here.
 */

export type BrandCategory =
  | "Fashion / Commerce / Affiliate"
  | "Marketing Technology / AI"
  | "E-commerce"
  | "Creative / Digital Production"
  | "Pet Technology / Social"
  | "Automotive / Lifestyle"
  | "Consumer / Lifestyle"
  | "Technology / Business"
  | "Games / Entertainment"
  | "Toys / Consumer";

export type EcosystemGroup =
  | "Create"
  | "Technology"
  | "Commerce"
  | "Community"
  | "Entertainment"
  | "Lifestyle";

export interface Brand {
  slug: string;
  name: string;
  category: BrandCategory;
  group: EcosystemGroup;
  description: string;
  /** External site, or null when the brand has no live site yet. */
  url: string | null;
  /** Visual accent for the brand's card and ecosystem node. */
  accent: string;
  /** Path to the brand's real logo under /public, when one has been supplied. */
  logo?: string;
}

export const BRANDS: Brand[] = [
  {
    slug: "hugfab",
    name: "HUGFAB",
    category: "Fashion / Commerce / Affiliate",
    group: "Create",
    description:
      "A fashion discovery and commerce ecosystem connecting shoppers with products, brands and new ways to discover style.",
    url: "https://hugfab.com",
    accent: "#EC4899",
    logo: "/brands/hugfab.png",
  },
  {
    slug: "targetgum",
    name: "TargetGum",
    category: "Marketing Technology / AI",
    group: "Technology",
    description:
      "An intelligent marketing ecosystem designed to help businesses understand what to do, where to market, who to reach and how to grow.",
    url: "https://targetgum.com",
    accent: "#2F80FF",
    logo: "/brands/targetgum.webp",
  },
  {
    slug: "sanchikart",
    name: "Sanchikart",
    category: "E-commerce",
    group: "Commerce",
    description:
      "A modern commerce platform designed around discovering and selling products through a streamlined digital shopping experience.",
    url: "https://sanchikart.com",
    accent: "#8B5CF6",
    logo: "/brands/sanchikart.webp",
  },
  {
    slug: "bhilva-studios",
    name: "Bhilva Studios",
    category: "Creative / Digital Production",
    group: "Create",
    description:
      "A creative studio focused on visual storytelling, digital experiences and creative production.",
    url: null,
    accent: "#F59E0B",
  },
  {
    slug: "tikkatails",
    name: "Tikkatails",
    category: "Pet Technology / Social",
    group: "Community",
    description:
      "A digital social ecosystem built around pets, communities and the people who love them.",
    url: "https://tikkatails.com",
    accent: "#10B981",
  },
  {
    slug: "throttle-daires",
    name: "Throttle Daires",
    category: "Automotive / Lifestyle",
    group: "Lifestyle",
    description:
      "A lifestyle-driven brand built around automotive culture, passion and community.",
    url: null,
    accent: "#EF4444",
  },
  {
    slug: "tapayro",
    name: "Tapayro",
    category: "Consumer / Lifestyle",
    group: "Commerce",
    description:
      "A TapasHub brand exploring modern consumer products and digital experiences.",
    url: "https://tapayro.com",
    accent: "#14B8A6",
    logo: "/brands/tapayro.avif",
  },
  {
    slug: "pepalworks",
    name: "Pepalworks",
    category: "Technology / Business",
    group: "Technology",
    description:
      "A technology and business ecosystem focused on creating digital products, services and solutions.",
    url: "https://pepalworks.com",
    accent: "#6366F1",
  },
  {
    slug: "undertree-games",
    name: "Undertree Games",
    category: "Games / Entertainment",
    group: "Entertainment",
    description:
      "A game studio creating original tabletop games, experiences and entertainment products.",
    url: "https://undertreegames.com",
    accent: "#7C3AED",
  },
  {
    slug: "tottotoy",
    name: "Tottotoy",
    category: "Toys / Consumer",
    group: "Commerce",
    description:
      "A playful consumer brand focused on toys, products and experiences for curious minds.",
    url: "https://tottotoy.com",
    accent: "#F97316",
  },
];

export const ECOSYSTEM_GROUPS: EcosystemGroup[] = [
  "Create",
  "Technology",
  "Commerce",
  "Community",
  "Entertainment",
  "Lifestyle",
];

export function brandsByGroup(group: EcosystemGroup): Brand[] {
  return BRANDS.filter((b) => b.group === group);
}
