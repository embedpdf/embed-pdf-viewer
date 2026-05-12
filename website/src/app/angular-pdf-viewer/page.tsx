import Footer from '@/components/footer'
import AngularPDFViewer from '@/components/angular-pdf-viewer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title: 'Angular PDF Viewer – Open Source, Headless & Customizable | EmbedPDF',
  description:
    'Build your Angular PDF viewer your way. Choose a drop-in standalone component today, with headless Angular injectables landing in v1.1. Open source, TypeScript-first, signals and zoneless ready, works with Angular Material, PrimeNG, Spartan/ng and Tailwind.',
}

export default async function AngularPDFViewerPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <AngularPDFViewer />
    </ConfigProvider>
  )
}
