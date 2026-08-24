import { Capabilities } from '@/components/site/capabilities';
import { Hero } from '@/components/site/hero';
import { QuickStart } from '@/components/site/quickstart';
import { Testimonials } from '@/components/site/testimonials';
import { Trust } from '@/components/site/trust';
import { TwoWays } from '@/components/site/two-ways';

/**
 * No live-viewer section here on purpose. The hero already shows the UI, and
 * "try it yourself" is /demo — a full-screen viewer one click away, which a
 * boxed-in copy on the homepage can only lose to. It also keeps the wasm
 * engine off the landing page's critical path.
 */
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
