import { localEngine } from '@embedpdf/engine';

export async function inspectPdf(url: string) {
  // `localEngine()` is a recipe; call it to boot a live engine (PDFium in a
  // Web Worker). No worker wiring — the default worker is bundler-portable.
  const engine = await localEngine()();

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to fetch PDF: ${response.status}`);

    const document = await engine.open(
      {
        kind: 'bytes',
        id: 'document',
        bytes: await response.arrayBuffer(),
      },
      { scope: ['*'] },
    );

    try {
      const { pageCount, pages } = await document.pages.list();
      return {
        pageCount,
        firstPageObjectNumber: pages[0]?.pageObjectNumber,
      };
    } finally {
      await document.close();
    }
  } finally {
    // We created the engine, so we destroy it — ownership follows acquisition.
    await engine.destroy();
  }
}
