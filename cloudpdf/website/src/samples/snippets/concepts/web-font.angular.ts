import { cloudEngine } from '@cloudpdf/engine';
import { mountWebFont } from '@embedpdf/angular/runtime';

/** `provideEmbedPdf({ engine }, …)`: runs in the browser, before the first document opens. */
export const engine = async () => {
  const pdfEngine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

  await pdfEngine.fonts.register({ key: 'brand-sans', data });
  await mountWebFont('brand-sans', data);
  return pdfEngine;
};
