import { Viewer } from '@embedpdf/react/runtime';
import { SearchToken } from '@embedpdf/react/search';
import { engine, plugins } from './pdf';

export function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      onReady={(viewer) => {
        const search = viewer.capability(SearchToken);
      }}
    />
  );
}
