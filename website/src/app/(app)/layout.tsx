import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'
import { PdfEngineWrapper } from '@/components/pdf-engine-wrapper'
import Footer from '@/components/footer'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pageMap = await getPageMap()

  return (
    <PdfEngineWrapper>
      <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
        {children}
      </ConfigProvider>
    </PdfEngineWrapper>
  )
}
