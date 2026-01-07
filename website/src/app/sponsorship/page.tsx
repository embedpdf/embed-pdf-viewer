import Footer from '@/components/footer'
import Navbar from '@/components/navbar'
import { ConfigProvider } from '@/components/stores/config'
import { getPageMap } from 'nextra/page-map'
import Sponsorship from '@/components/sponsorship'

export const metadata = {
  title:
    'Sponsor EmbedPDF – Help Build the Open-Source Alternative to Expensive PDF SDKs',
  description:
    "Help fund the open-source PDF SDK that's breaking the cycle of expensive vendor lock-in. Join companies saving 80-95% on PDF technology by sponsoring EmbedPDF development. MIT licensed forever.",
}

export default async function SponsorshipPage() {
  const pageMap = await getPageMap()

  return (
    <ConfigProvider navbar={<Navbar />} pageMap={pageMap} footer={<Footer />}>
      <Sponsorship />
    </ConfigProvider>
  )
}
