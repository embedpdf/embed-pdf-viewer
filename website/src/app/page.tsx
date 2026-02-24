import Footer from '@/components/footer'
import Homepage from '@/components/homepage'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'

export default async function HomePage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <Homepage />
    </ConfigProvider>
  )
}
