/**
 * `withFilePicker(provider?)`: where the `stamp` and `attachment` tools get their file after a
 * click. The plugin has no DOM, so it asks a provider, and this feature gives it one: the
 * browser's file dialog by default, or your own function (a stamp library, a cloud drive).
 *
 *   provideEmbedPdf({ engine }, withStage(), withInteraction(), withAnnotation(), withFilePicker())
 *
 * React installs it with a hook in an always-mounted component; in Angular it is app-wide setup,
 * so it is a feature of `provideEmbedPdf()`.
 */
import { DestroyRef, inject } from '@angular/core';
import { devWarn, injectKernelHost, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  AnnotationToken,
  type AnnotationCapability,
  type FilePickerProvider,
} from '@embedpdf/plugin-annotation';
import { pickRequestedFile } from '@embedpdf/web';

/**
 * The browser's file dialog, filtered by the tool's `accept`: what `withFilePicker()` installs
 * when you give it nothing. A picked `File` carries its own name and type.
 */
export const filePickerProvider: FilePickerProvider = pickRequestedFile;

/**
 * The file dialog behind every click-then-pick tool, for every document the viewer opens.
 * Without an argument it is the browser's dialog ({@link filePickerProvider}); pass your own
 * function to pick from your library (it gets the tool, the page and the point, and returns the
 * file or `null` to cancel), or `null` to make those tools do nothing.
 */
export function withFilePicker(
  provider: FilePickerProvider | null = filePickerProvider,
): EmbedPdfFeature {
  return { plugins: [], setup: () => installFilePicker(provider) };
}

/** Give every open document's annotation plugin the provider, for as long as the viewer lives. */
function installFilePicker(provider: FilePickerProvider | null): void {
  const host = injectKernelHost('withFilePicker()');
  if (!host.provides(AnnotationToken)) {
    devWarn(
      'file-picker-without-annotation',
      'withFilePicker() has no annotation plugin to give its file dialog to. Add withAnnotation() to provideEmbedPdf().',
    );
    return;
  }
  // One install per document's plugin, removed when the document closes.
  const installed = new Map<AnnotationCapability, () => void>();
  // On every change of the kernel, not in an effect: a document is given the provider in the
  // same change that makes it ready, before anyone can click with a stamp tool.
  const follow = () => {
    const kernel = host.kernel();
    if (!kernel) return;
    const open = new Set<AnnotationCapability>();
    for (const document of kernel.documents.list()) {
      const annotation = kernel.tryCapability(AnnotationToken, document.id);
      if (!annotation) continue;
      open.add(annotation);
      if (!installed.has(annotation)) {
        installed.set(annotation, annotation.setFilePickerProvider(provider));
      }
    }
    for (const [annotation, remove] of installed) {
      if (open.has(annotation)) continue;
      remove();
      installed.delete(annotation);
    }
  };
  const stop = host.subscribe(follow);
  follow();
  inject(DestroyRef).onDestroy(() => {
    stop();
    for (const remove of installed.values()) remove();
    installed.clear();
  });
}
