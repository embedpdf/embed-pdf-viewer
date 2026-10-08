// app/report/page.tsx: a server component. <PDFViewer> is a client component already.
import { PDFViewer } from '@embedpdf/viewer-react';

export default function ReportPage() {
  return <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />;
}
