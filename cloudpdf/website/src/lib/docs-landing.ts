/**
 * The landing manifest: every reader-facing string of the docs landing, the
 * homepage plan section, and the backend band lives HERE, once. The page
 * components render it; the Markdown projection (docs-landing-markdown.ts)
 * renders it; neither may carry copy of its own — so the surfaces cannot
 * drift (DOCS-PLATFORM-ARCHITECTURE.md: one content source, N renderings).
 *
 * Where two surfaces deliberately pitch the same card differently, both
 * variants live side by side under `landing:`/`plan:` — divergence is a
 * visible editorial choice in one file, never an accident across two.
 */

export const DOCS_LANDING = {
  heading: { lead: 'Choose the right path to build better ', em: 'PDF experiences.' },
  intro:
    'Launch faster with a ready-made viewer, or build exactly what you need with our headless components.',
  pathPill: 'Choose your implementation path',
  frameworksLabel: 'Get started in your framework',
  frameworksLabelShort: 'Frameworks',
  deploymentLabel: 'Choose your deployment',
} as const;

export type LandingProductPath = {
  id: 'viewer' | 'headless';
  title: string;
  image: string;
  imageAlt: string;
  landing: { desc: string; feats: string[] };
  plan: { desc: string };
};

export const LANDING_PRODUCT_PATHS: readonly LandingProductPath[] = [
  {
    id: 'viewer',
    title: 'Ready-made Viewer',
    image: '/plan-section/ready-made-viewer.svg',
    imageAlt: 'Preview of the ready-made PDF viewer interface',
    landing: {
      desc: 'Embed a complete, feature-rich PDF viewer in minutes.',
      feats: ['Drop-in component', 'Fastest way to launch', 'Prebuilt toolbar and layout'],
    },
    plan: { desc: 'Drop in a production-ready PDF viewer with powerful built-in features.' },
  },
  {
    id: 'headless',
    title: 'Headless Components',
    image: '/plan-section/headless-components.svg',
    imageAlt: 'Headless components and code building blocks',
    landing: {
      desc: 'Build custom PDF experiences with our modular, headless API.',
      feats: ['Build your own UI', 'Full composability', 'Plugin-friendly'],
    },
    plan: { desc: 'Build your own UI with flexible, unstyled components and APIs.' },
  },
];

export type LandingDeployment = {
  id: 'saas' | 'self-hosted';
  title: string;
  href: string;
  landing: { lead: string; sub: string };
  plan: { body: string; cta: string };
};

export const LANDING_DEPLOYMENTS: readonly LandingDeployment[] = [
  {
    id: 'saas',
    title: 'Managed SaaS',
    href: '/docs/engine/getting-started',
    landing: {
      lead: 'We host and manage everything.',
      sub: 'Get secure, scalable infrastructure so you can focus on your product.',
    },
    plan: {
      body: 'We run it. You focus on building. Always up-to-date, globally scalable, and secure by default.',
      cta: 'Learn more',
    },
  },
  {
    id: 'self-hosted',
    title: 'Self-hosted Server',
    href: '/docs/server/getting-started',
    landing: {
      lead: 'Deploy in your own environment.',
      sub: 'Full control, private data, and enterprise compliance on your terms.',
    },
    plan: {
      body: 'Deploy on your infrastructure. Full control, privacy, and compliance on your terms.',
      cta: 'Learn more',
    },
  },
];

export const BACKEND_BAND = {
  title: 'Both paths share one backend',
  sdksLabel: 'Use it from your language',
  apiReferenceHref: '/docs/api-reference',
  allOperationsLabel: (count: number) => `All ${count} operations`,
  steps: [
    {
      method: 'POST' as string | null,
      title: 'Initialize an upload',
      description: 'Get upload access, transfer, then commit.',
      href: '/docs/api-reference/documents/init',
    },
    {
      method: 'POST' as string | null,
      title: 'Issue a document token',
      description: 'Short-lived, one document, one user.',
      href: '/docs/api-reference/tokens/issue',
    },
    {
      method: null as string | null,
      title: 'Open in your viewer',
      description: 'The token is all the browser ever holds.',
      href: '/docs/engine/getting-started',
    },
  ],
} as const;
