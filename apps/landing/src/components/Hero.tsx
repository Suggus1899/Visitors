import { ArrowRight, Play, ShieldCheck, CheckCircle2 } from 'lucide-react';

const trustBadges = [
  'GDPR & Ley 25.326 compliant',
  'SOC 2 ready audit trail',
  '99.9% uptime SLA',
];

export function Hero() {
  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-20 bg-glow bg-grid"
      aria-labelledby="hero-title"
    >
      <div className="section-container relative z-10">
        <div className="section-inner grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 lg:py-24">
          <div className="space-y-8 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-2/20 border border-accent-0/30 text-accent-0 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" />
              Simplified access control
            </div>

            <h1
              id="hero-title"
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight"
            >
              Visitor management <br />
              <span className="text-gradient">fast, secure and audited</span>
            </h1>

            <p className="text-lg text-text-2 max-w-xl leading-relaxed">
              LogMaster digitalizes visitor check-in and check-out for your organization.
              Capture photos, generate reports, audit movements, and keep your data backed
              up — all in one place.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => scrollTo('#demo')}
                className="btn-primary gap-2"
              >
                Request Demo
                <Play className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => scrollTo('#pricing')}
                className="btn-secondary gap-2"
              >
                View Plans
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-3 text-text-3 text-sm">
              {trustBadges.map((badge) => (
                <li key={badge} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent-0" />
                  {badge}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative hidden lg:block animate-fade-in" aria-hidden="true">
            <div className="panel-tech rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-accent-0/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-border-0">
                  <span className="font-display text-lg font-semibold">Control panel</span>
                  <span className="text-xs text-accent-0 bg-accent-2/20 px-2 py-1 rounded">Live</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface-2 rounded-xl p-4 border border-border-0">
                    <p className="text-text-3 text-xs uppercase tracking-wider">Visits today</p>
                    <p className="text-2xl font-bold text-text-1 mt-1">42</p>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-4 border border-border-0">
                    <p className="text-text-3 text-xs uppercase tracking-wider">Active</p>
                    <p className="text-2xl font-bold text-accent-0 mt-1">18</p>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-4 border border-border-0">
                    <p className="text-text-3 text-xs uppercase tracking-wider">Waiting</p>
                    <p className="text-2xl font-bold text-text-1 mt-1">5</p>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-4 border border-border-0">
                    <p className="text-text-3 text-xs uppercase tracking-wider">Audit</p>
                    <p className="text-2xl font-bold text-text-1 mt-1">100%</p>
                  </div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-border-0 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent-2/30 flex items-center justify-center text-accent-0 font-bold text-sm">GC</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Gustavo Colina</p>
                      <p className="text-xs text-text-3">Meeting · 10:30</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-accent-2/20 text-accent-0">In</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-0 border border-border-1 flex items-center justify-center text-text-3 font-bold text-sm">MR</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Maria Rojas</p>
                      <p className="text-xs text-text-3">Delivery · 11:00</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-surface-0 border border-border-1 text-text-3">Waiting</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
