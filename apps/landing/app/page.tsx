import { Navbar } from '../src/components/Navbar';
import { Hero } from '../src/components/Hero';
import { Features } from '../src/components/Features';
import { Pricing } from '../src/components/Pricing';
import { LiveDemo } from '../src/components/LiveDemo';
import { Testimonials } from '../src/components/Testimonials';
import { FAQ } from '../src/components/FAQ';
import { ContactFooter } from '../src/components/ContactFooter';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-0 text-text-1 overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <LiveDemo />
        <Testimonials />
        <FAQ />
      </main>
      <ContactFooter />
    </div>
  );
}
