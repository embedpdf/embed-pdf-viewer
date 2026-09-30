import { mountWebFont } from '@embedpdf/react/runtime';
import { engine } from './pdf';

const data = await fetch('/fonts/brand-sans.ttf').then((response) => response.arrayBuffer());

await engine.fonts.register({ key: 'brand-sans', data });
const unmount = await mountWebFont('brand-sans', data);
