// app/report/page.tsx: a server component. <PDFViewer> is a client component already.
import { PDFViewer } from '@cloudpdf/viewer-react';

export default function ReportPage() {
  return <PDFViewer src={{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }} style={{ height: '100vh' }} />;
}
