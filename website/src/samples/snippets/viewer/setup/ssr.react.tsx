// app/report/page.tsx: a server component. <PDFViewer> is a client component already.
import { PDFViewer } from '@embedpdf/viewer-react';

export default function ReportPage() {
  return <PDFViewer src="https://www.embedpdf.com/pdfs/welcome.pdf" style={{ height: '100vh' }} />;
}
