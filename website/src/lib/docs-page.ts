import type { Metadata } from 'next';
import { importPage } from 'nextra/pages';

import { DOCS_INTEGRATION_LABELS, type DocsIntegration } from './docs-integrations';
import { resolveDocsPath, type ResolvedDocsPath } from './docs-route';
import { SITE_NAME, SITE_ORIGIN } from './site';

export type DocsSocialVariant = 'docs' | 'engine' | 'headless' | 'viewer';

type DocsFrontmatter = Record<string, unknown>;

export type DocsPagePresentation = {
  canonicalPath: string;
  canonicalUrl: string;
  description: string;
  integration?: DocsIntegration;
  imageTitle: string;
  metadata: Metadata;
  section: string;
  socialDescription: string;
  socialImagePath: string;
  title: string;
  variant: DocsSocialVariant;
};

type CreateDocsPagePresentationOptions = {
  mdxPath: string[];
  metadata?: DocsFrontmatter;
  resolved: ResolvedDocsPath;
};

const DEFAULT_DESCRIPTION =
  'Build production-ready PDF experiences with the EmbedPDF JavaScript SDK.';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function titleFromPath(path: string[]) {
  const slug = path.at(-1) ?? SITE_NAME;
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function defaultVariant(contentPath: string[]): DocsSocialVariant {
  if (contentPath[0] === 'docs' && contentPath[1] === 'engine') return 'engine';
  if (contentPath[0] === 'docs' && contentPath[1] === 'headless') return 'headless';
  if (contentPath[0] === 'docs' && contentPath[1] === 'viewer') return 'viewer';
  return 'docs';
}

function variantValue(value: unknown, fallback: DocsSocialVariant) {
  return value === 'docs' || value === 'engine' || value === 'headless' || value === 'viewer'
    ? value
    : fallback;
}

function sectionLabel(variant: DocsSocialVariant) {
  if (variant === 'engine') return 'PDF Engine';
  if (variant === 'headless') return 'Headless SDK';
  if (variant === 'viewer') return 'PDF Viewer';
  return 'Documentation';
}

/** Builds the route-specific metadata shared by the page and its social images. */
export function createDocsPagePresentation({
  mdxPath,
  metadata = {},
  resolved,
}: CreateDocsPagePresentationOptions): DocsPagePresentation {
  const baseTitle = stringValue(metadata.title) ?? titleFromPath(resolved.contentPath);
  const description = stringValue(metadata.description) ?? DEFAULT_DESCRIPTION;
  const integrationLabel = resolved.integration
    ? DOCS_INTEGRATION_LABELS[resolved.integration]
    : undefined;
  const title = integrationLabel ? `${baseTitle} — ${integrationLabel}` : baseTitle;
  const canonicalPath = `/${mdxPath.join('/')}`;
  const variant = variantValue(metadata.ogVariant, defaultVariant(resolved.contentPath));

  return {
    canonicalPath,
    canonicalUrl: `${SITE_ORIGIN}${canonicalPath}`,
    description,
    integration: resolved.integration,
    imageTitle: stringValue(metadata.ogTitle) ?? baseTitle,
    metadata: metadata as Metadata,
    section: sectionLabel(variant),
    socialDescription: stringValue(metadata.ogDescription) ?? description,
    socialImagePath: `/api/og/${mdxPath.join('/')}`,
    title,
    variant,
  };
}

/**
 * The docs overview (`/docs`) is a dedicated landing route, not an MDX page,
 * so its presentation is declared here explicitly instead of being derived
 * from front matter. Its route and its social image both import this value.
 */
export const DOCS_OVERVIEW_PRESENTATION = createDocsPagePresentation({
  mdxPath: ['docs'],
  metadata: {
    title: 'Documentation',
    description:
      'Choose the ready-made viewer, headless components, or the EmbedPDF Engine directly.',
  },
  resolved: { contentPath: ['docs'] },
});

/** Resolves an MDX-backed documentation URL to its presentation. */
export async function getDocsPagePresentation(
  mdxPath: string[],
): Promise<DocsPagePresentation | null> {
  const resolved = resolveDocsPath(mdxPath);
  if (!resolved) return null;

  const { metadata } = await importPage(resolved.contentPath);
  return createDocsPagePresentation({
    mdxPath,
    metadata: (metadata ?? {}) as DocsFrontmatter,
    resolved,
  });
}

/** Assembles the Next.js `Metadata` shared by every docs surface. */
export function buildDocsPageMetadata(
  page: DocsPagePresentation,
  { ogType = 'article' }: { ogType?: 'article' | 'website' } = {},
): Metadata {
  const socialImage = {
    url: page.socialImagePath,
    alt: `${page.title} | EmbedPDF documentation`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };

  return {
    ...page.metadata,
    title: page.title,
    description: page.description,
    alternates: {
      ...(page.metadata.alternates ?? {}),
      canonical: page.canonicalUrl,
    },
    openGraph: {
      ...(page.metadata.openGraph ?? {}),
      title: page.title,
      description: page.socialDescription,
      siteName: 'EmbedPDF',
      type: ogType,
      url: page.canonicalPath,
      images: [socialImage],
    },
    twitter: {
      ...(page.metadata.twitter ?? {}),
      card: 'summary_large_image',
      title: page.title,
      description: page.socialDescription,
      images: [socialImage],
    },
  };
}
