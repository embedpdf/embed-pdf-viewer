import { ScreenshotZoom } from './screenshot-zoom';
import { screenshotOf } from '@/lib/screenshots';

/**
 * A screenshot of the CloudPDF dashboard. The platform's capture script
 * makes every one of them (never a person), so they can all be made again
 * when the dashboard changes. Its size comes from the script's manifest, so
 * the page doesn't move while it loads; a click shows it full size.
 */
export function Screenshot({ name, alt, caption }: { name: string; alt: string; caption?: string }) {
  const shot = screenshotOf(name);
  return (
    <figure className="mt-6 max-w-[760px]">
      <ScreenshotZoom alt={alt} height={shot.height} src={shot.src} width={shot.width} />
      {caption ? (
        <figcaption className="text-cp-muted mt-2.5 font-sans text-sm leading-[1.5]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
