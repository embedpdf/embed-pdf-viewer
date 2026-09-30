import { Viewer } from '@embedpdf/react/runtime';

import { contract, engine, plugins } from './setup';

export function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: contract }]}
    />
  );
}
