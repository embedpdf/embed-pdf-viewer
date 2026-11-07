// 2.x:
//
// import { useRef } from 'react';
// import { PDFViewer, type CommandsPlugin, type PDFViewerRef } from '@embedpdf/react-pdf-viewer';
//
// export function Review() {
//   const viewerRef = useRef<PDFViewerRef>(null);
//   const print = async () => {
//     const registry = await viewerRef.current?.registry;
//     registry?.getPlugin<CommandsPlugin>('commands')?.provides().execute('document:print');
//   };
//   return (
//     <>
//       <button onClick={print}>Print</button>
//       <PDFViewer ref={viewerRef} config={{ src: { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' } }} style={{ height: '80vh' }} />
//     </>
//   );
// }

import { useState } from 'react';
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-react';

export function Review() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  return (
    <>
      <button disabled={!viewer} onClick={() => viewer?.commands.execute('document:print')}>
        Print
      </button>
      <PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} onReady={setViewer} style={{ height: '80vh' }} />
    </>
  );
}
