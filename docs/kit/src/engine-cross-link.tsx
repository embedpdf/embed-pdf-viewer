/**
 * What a non-matching `<Engine href="…">` block degrades to at compile time
 * (see `mdx/remark-engine-axis.mjs`): a one-line pointer to the sibling
 * site instead of silently vanished content. Register it in the site's MDX
 * components — authors never write it by hand.
 */
const ENGINE_LABELS: Record<string, { product: string; note: string }> = {
  cloud: {
    product: 'CloudPDF',
    note: 'This part of the workflow is covered by the cloud engine.',
  },
  local: {
    product: 'EmbedPDF',
    note: 'This part of the workflow is covered by the local engine.',
  },
};

export function EngineCrossLink({ engine, href }: { engine: string; href: string }) {
  const label = ENGINE_LABELS[engine] ?? {
    product: engine,
    note: 'This content lives in the sibling documentation.',
  };

  return (
    <p className="mt-5 flex max-w-[72ch] items-baseline gap-2 rounded-[10px] border border-dashed border-[var(--dk-border)] bg-[#FBFCFE] px-4 py-3 font-sans text-[13.5px] leading-[1.55] text-[var(--dk-muted)]">
      <span>
        {label.note}{' '}
        <a
          href={href}
          className="font-semibold text-[var(--dk-accent)] underline-offset-[3px] hover:underline"
        >
          See the {label.product} docs →
        </a>
      </span>
    </p>
  );
}
