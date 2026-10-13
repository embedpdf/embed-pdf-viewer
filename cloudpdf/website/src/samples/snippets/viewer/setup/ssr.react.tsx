// app/report/page.tsx: a server component. <PDFViewer> is a client component already.
import { PDFViewer } from '@cloudpdf/viewer-react';

export default function ReportPage() {
  return <PDFViewer src={{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }} style={{ height: '100vh' }} />;
}
