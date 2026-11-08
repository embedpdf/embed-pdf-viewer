'use client';

import { useRef } from 'react';

/** The screenshot in its frame, and full size in a dialog when clicked. */
export function ScreenshotZoom({
  alt,
  height,
  src,
  width,
}: {
  alt: string;
  height: number;
  src: string;
  width: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        aria-label={`Show full size: ${alt}`}
        className="border-cp-border block w-full cursor-zoom-in overflow-hidden rounded-[14px] border bg-white shadow-[0_18px_40px_-28px_rgba(10,26,77,0.35)] transition hover:shadow-[0_22px_48px_-26px_rgba(10,26,77,0.45)]"
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        <img
          alt={alt}
          className="block h-auto w-full"
          decoding="async"
          height={height}
          loading="lazy"
          src={src}
          width={width}
        />
      </button>
      <dialog
        className="m-auto max-h-none max-w-none cursor-zoom-out bg-transparent p-0 backdrop:bg-[rgba(10,26,77,0.72)]"
        onClick={() => dialog.current?.close()}
        ref={dialog}
      >
        <img
          alt={alt}
          className="block h-auto max-h-[92vh] w-auto max-w-[94vw] rounded-[14px]"
          height={height}
          src={src}
          width={width}
        />
      </dialog>
    </>
  );
}
