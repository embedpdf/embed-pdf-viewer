import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-react';

const registration = { grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

const config: ViewerConfig = {
  plugins: {
    stamp: {
      libraries: [{ id: 'marks', url: 'https://www.cloudpdf.com/pdfs/marks.pdf' }],
      quick: ['marks:Check', 'marks:Cross'],
    },
  },
};

export default function App() {
  return <PDFViewer src={registration} {...config} style={{ height: '100%' }} />;
}
