import Footer from '@/components/footer'
import SveltePDFViewer from '@/components/svelte-pdf-viewer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title: 'Svelte PDF Viewer – Open Source, Headless & Customizable | EmbedPDF',
  description:
    'Build your Svelte PDF viewer your way. Choose between a drop-in component with beautiful UI or headless components for complete control. Open source, TypeScript-first, works with SvelteKit, Flowbite & more.',
}

export default async function SveltePDFViewerPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <SveltePDFViewer />
    </ConfigProvider>
  )
}
