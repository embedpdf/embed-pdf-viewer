import { localEngine } from '@embedpdf/engine';

export const engine = localEngine(); // the engine you give the viewer

const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

await engine.fonts.register({ key: 'brand-sans', data });
