import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };
const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

const config: ViewerConfig = {
  documents: [
    { src: welcome, name: 'Welcome' },
    { src: article, name: 'Engineering blog' },
    { src: report, name: 'Q3 report', active: true },
  ],
};

export default function App() {
  return <PDFViewer {...config} style={{ height: '100%' }} />;
}
