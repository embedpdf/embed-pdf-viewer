import { visit } from 'unist-util-visit';

/**
 * The release-channel axis for install commands and CDN URLs
 * (docs/conventions/docs-architecture.md).
 *
 * Authors always write the GA form — bare install specs
 * (`npm install @embedpdf/react`) and CDN URLs on the train's major
 * (`https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js`) — and
 * the machinery stamps the active npm dist-tag at build time, exactly like the
 * engine axis stamps provisioning. Nobody hand-writes `@next` in content, so
 * flipping the channel at GA is a one-line change here (or an env var per
 * deploy), never a docs sweep.
 *
 * Plain `.mjs` (like the axis and highlight modules) so `next.config` can
 * load it before webpack exists; the TS surface is typed by the sibling
 * `.d.mts`.
 */

/** Our scopes only — third-party packages on an install line stay bare. */
const DEFAULT_SCOPES = ['@embedpdf', '@cloudpdf'];

/**
 * One switch: the kit default is the current release train; the env var
 * overrides per environment without a commit. 'latest' means "no stamping" —
 * a bare spec already installs latest, and `@3` already resolves to 3.x.
 */
export function resolveInstallChannel() {
  return process.env.DOCS_INSTALL_CHANNEL ?? 'next';
}

/**
 * The release train's major: what a CDN URL is authored on. A semver range
 * matches no prerelease, so while the channel is `next` this version is the
 * one replaced by the tag. Older majors (`@embedpdf/snippet@2` on the
 * migration pages) are not the train and stay as written.
 */
const TRAIN_MAJOR = '3';

function scopeAlternatives(scopes) {
  return scopes
    .map((scope) => scope.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

function buildMatcher(scopes) {
  // A full scoped name, not already carrying a tag and not a prefix of a
  // longer name (`@embedpdf/engine` must not match inside `engine-core`).
  return new RegExp(`(@(?:${scopeAlternatives(scopes)})\\/[a-z0-9-]+)(?![@a-z0-9-])`, 'g');
}

function buildCdnMatcher(scopes) {
  // An own-scope package on jsDelivr or unpkg, pinned to exactly the train's
  // major: `@3` but never `@3.0.0`, `@30` or `@3.0.0-next.4`.
  return new RegExp(
    `(\\/\\/(?:cdn\\.jsdelivr\\.net\\/npm|unpkg\\.com)\\/@(?:${scopeAlternatives(scopes)})\\/[a-z0-9-]+)@${TRAIN_MAJOR}(?![\\w.-])`,
    'g',
  );
}

/** Lines that install packages; the install rule rewrites nothing else. */
const INSTALL_VERB = /\b(?:npm\s+(?:install|i)\b|pnpm\s+add\b|yarn\s+add\b|bun\s+add\b)/;

/**
 * Stamps the channel on two forms, on any line of the code:
 *
 * - install: appends `@<channel>` to every bare own-scope spec on an
 *   install-command line;
 * - CDN: replaces the train's major in an own-scope jsDelivr or unpkg URL
 *   with `@<channel>` (`…/@embedpdf/viewer@3/dist/…` → `…/@embedpdf/viewer@next/dist/…`).
 *
 * Pure and idempotent: already-tagged specs, other versions, import
 * statements of bare names, and foreign packages pass through untouched.
 */
export function applyInstallChannel(
  code,
  channel = resolveInstallChannel(),
  scopes = DEFAULT_SCOPES,
) {
  if (!channel || channel === 'latest' || !code.includes('@')) return code;
  const matcher = buildMatcher(scopes);
  const cdnMatcher = buildCdnMatcher(scopes);
  return code
    .split('\n')
    .map((line) => (INSTALL_VERB.test(line) ? line.replace(matcher, `$1@${channel}`) : line))
    .map((line) => line.replace(cdnMatcher, `$1@${channel}`))
    .join('\n');
}

/**
 * Remark plugin for the rendered pages. Order it BEFORE `remark-npm2yarn`:
 * the authored npm line is stamped once and every generated package-manager
 * tab inherits the tagged spec. Inline code is stamped too: a CDN URL in a
 * table cell is copied like one in a fence.
 */
export function remarkInstallChannel(options = {}) {
  const channel = options.channel ?? resolveInstallChannel();
  const scopes = options.scopes ?? DEFAULT_SCOPES;

  return (tree) => {
    if (channel === 'latest') return tree;
    visit(tree, ['code', 'inlineCode'], (node) => {
      if (typeof node.value === 'string') {
        node.value = applyInstallChannel(node.value, channel, scopes);
      }
    });
    return tree;
  };
}
