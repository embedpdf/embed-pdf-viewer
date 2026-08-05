import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LayerLab } from './LayerLab';
import { SelectionDemo } from './SelectionDemo';

// `?demo=layers` → the layer-document demo; `?demo=selection` → text selection
// without the Stage (standalone PageView); otherwise the full viewer.
const demo = new URLSearchParams(window.location.search).get('demo');

const root = demo === 'layers' ? <LayerLab /> : demo === 'selection' ? <SelectionDemo /> : <App />;

createRoot(document.getElementById('root')!).render(root);
