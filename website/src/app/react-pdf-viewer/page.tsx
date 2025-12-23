import Footer from '@/components/footer'
import ReactPDFViewer from '@/components/react-pdf-viewer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title: 'React PDF Viewer – Open Source, Headless & Customizable | EmbedPDF',
  description:
    'Build your React PDF viewer your way. Choose between a drop-in component with beautiful UI or headless hooks for complete control. Open source, TypeScript-first, works with MUI, Chakra, Tailwind & more.',
}

export default async function ReactPDFViewerPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <ReactPDFViewer />
    </ConfigProvider>
  )
}
