import { lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';

// Lazy-load below-the-fold sections for better initial load performance.
const Pricing = lazy(() =>
  import('./components/Pricing').then((m) => ({ default: m.Pricing }))
);
const LiveDemo = lazy(() =>
  import('./components/LiveDemo').then((m) => ({ default: m.LiveDemo }))
);
const Testimonials = lazy(() =>
  import('./components/Testimonials').then((m) => ({ default: m.Testimonials }))
);
const FAQ = lazy(() =>
  import('./components/FAQ').then((m) => ({ default: m.FAQ }))
);
const ContactFooter = lazy(() =>
  import('./components/ContactFooter').then((m) => ({ default: m.ContactFooter }))
);

function SectionFallback() {
  return (
    <div className="py-24 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-accent-0 border-t-transparent animate-spin" />
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-bg-0 text-text-1 overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Suspense fallback={<SectionFallback />}>
          <Pricing />
          <LiveDemo />
          <Testimonials />
          <FAQ />
        </Suspense>
      </main>
      <Suspense fallback={<SectionFallback />}>
        <ContactFooter />
      </Suspense>
    </div>
  );
}

export default App;
