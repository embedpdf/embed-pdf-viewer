import Footer from '@/components/footer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'
import OurSponsors from '@/components/our-sponsors'

export const metadata = {
  title: 'Our Sponsors – EmbedPDF',
  description:
    'Meet the companies and individuals supporting the development of EmbedPDF, the open-source PDF viewer.',
}

export default async function SponsorsPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <OurSponsors />
    </ConfigProvider>
  )
}
