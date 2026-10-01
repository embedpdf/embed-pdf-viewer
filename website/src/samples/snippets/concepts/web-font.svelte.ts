import { localEngine } from '@embedpdf/engine';
import { mountWebFont } from '@embedpdf/svelte/runtime';

export const engine = localEngine(); // the engine you give the viewer

const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

await engine.fonts.register({ key: 'brand-sans', data });
const unmount = await mountWebFont('brand-sans', data);
