import Footer from '@/components/footer'
import VuePDFViewer from '@/components/vue-pdf-viewer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title: 'Vue PDF Viewer – Open Source, Headless & Customizable | EmbedPDF',
  description:
    'Build your Vue PDF viewer your way. Choose between a drop-in component with beautiful UI or headless composables for complete control. Open source, TypeScript-first, works with Vuetify, Quasar, PrimeVue, Nuxt & more.',
}

export default async function VuePDFViewerPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <VuePDFViewer />
    </ConfigProvider>
  )
}
