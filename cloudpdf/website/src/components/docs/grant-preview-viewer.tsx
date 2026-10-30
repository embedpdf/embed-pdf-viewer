'use client';

import { useEffect, useRef, useState } from 'react';

type ViewerElement = HTMLElement & { src: unknown };

/**
 * Adds the viewer script to the page once, as the `<script type="module">` a reader pastes, and
 * settles when `<embedpdf-viewer>` is defined.
 */
function loadViewer(script: string): Promise<unknown> {
  if (!document.querySelector(`script[src="${script}"]`)) {
    const tag = document.createElement('script');
    tag.type = 'module';
    tag.src = script;
    document.head.append(tag);
  }
  return Promise.race([
    customElements.whenDefined('embedpdf-viewer'),
    new Promise((_, fail) => setTimeout(() => fail(new Error('The viewer script timed out')), 20_000)),
  ]);
}

export function GrantPreviewViewer({
  grant,
  height,
  script,
}: {
  grant: string;
  height: number;
  script: string;
}) {
  const viewer = useRef<ViewerElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadViewer(script).then(
      () => {
        // Set only once the element is defined, so `src` reaches the viewer, not a plain property.
        if (live && viewer.current) viewer.current.src = { grant };
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [grant, script]);

  return (
    <div className="border-cp-border mt-6 max-w-[760px] overflow-hidden rounded-[14px] border bg-white shadow-[0_18px_40px_-28px_rgba(10,26,77,0.35)]">
      {failed ? (
        <p className="text-cp-muted grid place-items-center p-10 font-sans text-sm" style={{ height }}>
          The viewer couldn&apos;t load here. It works the same on your own page.
        </p>
      ) : (
        <embedpdf-viewer ref={viewer} style={{ display: 'block', height }} />
      )}
    </div>
  );
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'embedpdf-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
