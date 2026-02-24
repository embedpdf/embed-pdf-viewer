import Footer from '@/components/footer'
import LayoutAnalysisLanding from '@/components/layout-analysis-landing'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export const metadata = {
  title:
    'Layout Analysis -- Client-Side Document Structure Detection | EmbedPDF',
  description:
    'Interactive demo: run PP-DocLayoutV3 and table-transformer models via ONNX Runtime directly in your browser. Detect text blocks, tables, figures, and document structure with no server required.',
}

export default async function LayoutAnalysisPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <LayoutAnalysisLanding />
    </ConfigProvider>
  )
}
