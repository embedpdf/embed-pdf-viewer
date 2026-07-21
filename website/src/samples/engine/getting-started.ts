import { createLocalEngineWithWorker } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';

export async function inspectPdf(url: string) {
  const engine = await createLocalEngineWithWorker({
    worker: new EngineWorker(),
  });

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
    await engine.destroy();
  }
}
