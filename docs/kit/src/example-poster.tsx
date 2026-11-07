import { ArrowRight } from './icons';

/**
 * An example that opens on a page of its own, as a docs page shows it: its screenshot, a link to
 * that page with a button that says so. It's the preview of a `CodeExampleCard`, so the example's
 * code is still under it. The button names the link; the picture is only its face.
 */
export function ExamplePoster({
  src,
  width,
  height,
  href,
}: {
  /** The screenshot, and its size in pixels. */
  src: string;
  width: number;
  height: number;
  /** The example's own page. */
  href: string;
}) {
  return (
    <a
      href={href}
      className="group relative block overflow-hidden rounded-[10px] border border-[var(--dk-border)] shadow-[0_10px_30px_-14px_rgba(7,32,76,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-accent)] focus-visible:ring-offset-2"
    >
      <img
        src={src}
        width={width}
        height={height}
        alt=""
        loading="lazy"
        decoding="async"
        className="block h-auto w-full transition-[filter] duration-200 group-hover:brightness-[0.94]"
      />
      <span className="absolute inset-0 flex items-center justify-center p-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--dk-heading)] px-5 py-2.5 font-sans text-[14px] font-semibold text-white shadow-[0_8px_24px_-6px_rgba(7,32,76,0.45)] transition-transform duration-200 group-hover:scale-[1.04]">
          Open the example
          <ArrowRight width={15} height={15} />
        </span>
      </span>
    </a>
  );
}
