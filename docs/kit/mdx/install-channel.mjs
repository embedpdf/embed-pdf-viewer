import { visit } from 'unist-util-visit';

/**
 * The release-channel axis for install commands (DOCS-PLATFORM-ARCHITECTURE.md).
 *
 * Authors always write bare specs — `npm install @embedpdf/react` — and the
 * machinery stamps the active npm dist-tag at build time, exactly like the
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
 * a bare spec already installs latest.
 */
export function resolveInstallChannel() {
  return process.env.DOCS_INSTALL_CHANNEL ?? 'next';
}

function buildMatcher(scopes) {
  const alternatives = scopes
    .map((scope) => scope.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // A full scoped name, not already carrying a tag and not a prefix of a
  // longer name (`@embedpdf/engine` must not match inside `engine-core`).
  return new RegExp(`(@(?:${alternatives})\\/[a-z0-9-]+)(?![@a-z0-9-])`, 'g');
}

/** Lines that install packages; nothing else is ever rewritten. */
const INSTALL_VERB = /\b(?:npm\s+(?:install|i)\b|pnpm\s+add\b|yarn\s+add\b|bun\s+add\b)/;

/**
 * Appends `@<channel>` to every bare own-scope spec on install-command
 * lines. Pure and idempotent: already-tagged specs, import statements, and
 * foreign packages pass through untouched.
 */
export function applyInstallChannel(code, channel = resolveInstallChannel(), scopes = DEFAULT_SCOPES) {
  if (!channel || channel === 'latest' || !code.includes('@')) return code;
  const matcher = buildMatcher(scopes);
  return code
    .split('\n')
    .map((line) => (INSTALL_VERB.test(line) ? line.replace(matcher, `$1@${channel}`) : line))
    .join('\n');
}

/**
 * Remark plugin for the rendered pages. Order it BEFORE `remark-npm2yarn`:
 * the authored npm line is stamped once and every generated package-manager
 * tab inherits the tagged spec.
 */
export function remarkInstallChannel(options = {}) {
  const channel = options.channel ?? resolveInstallChannel();
  const scopes = options.scopes ?? DEFAULT_SCOPES;

  return (tree) => {
    if (channel === 'latest') return tree;
    visit(tree, 'code', (node) => {
      if (typeof node.value === 'string') {
        node.value = applyInstallChannel(node.value, channel, scopes);
      }
    });
    return tree;
  };
}
