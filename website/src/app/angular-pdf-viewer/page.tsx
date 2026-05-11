import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Angular PDF Viewer – EmbedPDF',
  description:
    'Angular documentation and setup guide for the EmbedPDF drop-in viewer.',
}

export default function AngularPDFViewerPage() {
  redirect('/docs/angular')
}
