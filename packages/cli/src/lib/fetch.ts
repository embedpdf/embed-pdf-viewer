const REPO = 'embedpdf/embed-pdf-viewer';
const BRANCH = 'main';
const DOCS_ROOT = 'website/src/content/docs';

/**
 * Fetch raw MDX content for a doc page from GitHub.
 */
export async function fetchDocContent(docPath: string): Promise<string | null> {
  const normalized = docPath.replace(/^\/|\/$/g, '').replace(/\.mdx$/, '');
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${DOCS_ROOT}/${normalized}.mdx`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const raw = await res.text();
  return stripMdx(raw);
}

/**
 * Strip frontmatter and MDX-specific imports/components from content,
 * returning clean Markdown suitable for terminal display.
 */
function stripMdx(content: string): string {
  // Remove YAML frontmatter
  let text = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

  // Remove import statements
  text = text.replace(/^import\s+.*?;\s*$/gm, '');

  // Remove JSX component wrappers (keep their children)
  // e.g. <ExampleWrapper> ... </ExampleWrapper>
  text = text.replace(/<ExampleWrapper[^>]*>[\s\S]*?<\/ExampleWrapper>/g, '[Interactive Example]');

  // Convert <Callout> to blockquote-style
  text = text.replace(/<Callout[^>]*>([\s\S]*?)<\/Callout>/g, (_match, inner) => {
    const lines = inner.trim().split('\n');
    return lines.map((l: string) => `> ${l}`).join('\n');
  });

  // Remove remaining self-closing JSX tags
  text = text.replace(/<[A-Z][a-zA-Z]*\s*[^>]*\/>/g, '');

  // Remove remaining JSX component open/close tags (but keep text content)
  text = text.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
