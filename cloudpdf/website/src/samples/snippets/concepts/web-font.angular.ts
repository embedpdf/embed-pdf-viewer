import { mountWebFont } from '@embedpdf/angular/runtime';
import { createEngine } from './create-engine';

/** `provideEmbedPdf({ engine }, …)`: runs in the browser, before the first document opens. */
export const engine = async () => {
  const pdfEngine = await createEngine();
  const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

  await pdfEngine.fonts.register({ key: 'brand-sans', data });
  await mountWebFont('brand-sans', data);
  return pdfEngine;
};
