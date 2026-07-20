import { Capabilities } from '@/components/site/capabilities';
import { Hero } from '@/components/site/hero';
import { QuickStart } from '@/components/site/quickstart';
import { Testimonials } from '@/components/site/testimonials';
import { Trust } from '@/components/site/trust';
import { TwoWays } from '@/components/site/two-ways';

export default function HomePage() {
  return (
    <main className="bg-ep-bg relative overflow-x-clip">
      <Hero />
      <TwoWays />
      <Capabilities />
      <QuickStart />
      <Trust />
      <Testimonials />
    </main>
  );
}
