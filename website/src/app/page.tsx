import { Capabilities } from '@/components/site/capabilities';
import { Hero } from '@/components/site/hero';
import { QuickStart } from '@/components/site/quickstart';
import { Testimonials } from '@/components/site/testimonials';
import { Trust } from '@/components/site/trust';
import { TwoWays } from '@/components/site/two-ways';
import { ViewerShowcase } from '@/components/site/viewer-showcase';

export default function HomePage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <Hero />
      <ViewerShowcase />
      <TwoWays />
      <Capabilities />
      <QuickStart />
      <Trust />
      <Testimonials />
    </main>
  );
}
