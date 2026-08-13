/**
 * @embedpdf/docs-kit — shared docs machinery for embedpdf.com and
 * cloudpdf.com. Components style themselves against the `--dk-*` token
 * contract (see ./tokens.ts); each site maps its brand palette onto it.
 */
export { Callout } from './callout';
export { Cards, Card } from './cards';
export {
  Feedback,
  POSITIVE_FEEDBACK_REASONS,
  NEGATIVE_FEEDBACK_REASONS,
  type FeedbackPayload,
  type FeedbackReason,
  type FeedbackSite,
} from './feedback';
export { Toc, useSectionSpy, type TocItem } from './toc';
export { pageSupportsEngine, type DocsEngine, type DocsSiteBinding } from './axis';
export { Heading, createHeading, HEADING_STYLES } from './heading';
export { MethodBadge, methodStyle } from './method-badge';
export { Pre } from './pre';
export { Tabs, useInTabs, TabsContext } from './tabs';
export {
  ArrowRight,
  BoltBadgeIcon,
  CheckIcon,
  CopyIcon,
  EngineIcon,
  PuzzleBadgeIcon,
  ServerBadgeIcon,
} from './icons';
export { DocsProductSwitcher, type DocsProductItem } from './product-switcher';
export { DOCS_KIT_TOKENS, type DocsKitToken } from './tokens';
export {
  renderDocsMarkdownWith,
  resolveDocsTreeWith,
  stringifyDocsTree,
  type AstNode,
  type DocsCodeFile,
  type DocsMarkdownSite,
  type RenderDocsMarkdownOptions,
} from './docs-markdown';
export { PageMarkdownActions } from './page-markdown-actions';
