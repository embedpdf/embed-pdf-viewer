import Link from 'next/link';

import { Callout } from './callout';
import type { DocsRelease } from './publish';
// eslint-disable-next-line import/no-unresolved — sibling plain-ESM module, typed by its .d.mts
import { FRAMEWORK_LABELS, type Framework } from '../mdx/frameworks.mjs';

/**
 * What a headless page says when the publish gate holds it back (`./publish`), and the preview
 * site's banner. The page and its Markdown export say the same words.
 */

/** In place of a page that isn't live for this framework. */
export function unreleasedSentence(framework: Framework): string {
  return `This page describes EmbedPDF 3.0 for ${FRAMEWORK_LABELS[framework]}, which isn't released yet.`;
}

/** Under the title of a page the preview site shows ahead of its release. */
export function previewSentence(framework: Framework): string {
  return `Preview: this page describes EmbedPDF 3.0 for ${FRAMEWORK_LABELS[framework]}, which isn't released yet.`;
}

/** A held-back page's one sentence, with a link to the React version when that one is live. */
export function UnreleasedNotice({
  framework,
  reactHref,
}: {
  framework: Framework;
  reactHref?: string | null;
}) {
  return (
    <Callout>
      <p>
        {unreleasedSentence(framework)}
        {reactHref ? (
          <>
            {' '}
            <Link href={reactHref}>Read the React version</Link>.
          </>
        ) : null}
      </p>
    </Callout>
  );
}

/** The preview site's banner, under the title of a page production holds back. */
export function PreviewBanner({ framework }: { framework: Framework }) {
  return (
    <Callout type="warn">
      <p>{previewSentence(framework)}</p>
    </Callout>
  );
}

/**
 * The MDX a route's Markdown export projects, so it says what the page says: a held-back page is
 * its title and one sentence; on the preview site, one production holds back has the banner under
 * its title.
 */
export function releasedMarkdownSource({
  sourceCode,
  title,
  framework,
  release,
  reactUrl,
}: {
  sourceCode: string;
  /** The page's title, which a held-back page still shows. */
  title: string | undefined;
  /** The route's framework; other routes aren't gated. */
  framework: Framework | undefined;
  release: DocsRelease;
  /** The React version, absolute so the export doesn't move the link to the reader's framework. */
  reactUrl: string | null;
}): string {
  if (!release.live && framework) {
    const heading = title ?? sourceCode.match(/^# (.+)$/m)?.[1] ?? '';
    const link = reactUrl ? ` [Read the React version](${reactUrl}).` : '';
    return `# ${heading}\n\n${unreleasedSentence(framework)}${link}\n`;
  }
  if (release.preview && framework) {
    return sourceCode.replace(/^# .+$/m, (heading) => `${heading}\n\n> ${previewSentence(framework)}`);
  }
  return sourceCode;
}
