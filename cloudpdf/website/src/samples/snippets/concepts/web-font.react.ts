import { cloudEngine } from '@cloudpdf/engine';
import { mountWebFont } from '@embedpdf/react/runtime';

export const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }); // the engine you give the viewer

const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

await engine.fonts.register({ key: 'brand-sans', data });
const unmount = await mountWebFont('brand-sans', data);
