import { localEngine } from '@embedpdf/engine';

export async function inspectPdf(url: string) {
  // `localEngine()` IS the engine — synchronous, nothing allocated yet. The
  // first operation boots PDFium in a Web Worker; no worker wiring needed
  // (the default worker is bundler-portable).
  const engine = localEngine();

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
        firstPage: pages[0]?.ref,
      };
    } finally {
      await document.close();
    }
  } finally {
    // We created the engine, so we destroy it — ownership follows acquisition.
    await engine.destroy();
  }
}
