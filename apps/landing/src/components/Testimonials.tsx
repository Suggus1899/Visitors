import { Quote, Star } from 'lucide-react';
import type { Testimonial } from '../types';

const testimonials: Testimonial[] = [
  {
    quote:
      'LogMaster transformed our reception. Check-in that used to take five minutes now takes seconds, and our audit trail is finally bulletproof.',
    author: 'Laura Mendez',
    role: 'Operations Director',
    company: 'Northwind Logistics',
    initials: 'LM',
  },
  {
    quote:
      'The compliance features alone justified the purchase. We passed our GDPR audit with zero findings on visitor data thanks to LogMaster.',
    author: 'Diego Fernandez',
    role: 'Compliance Officer',
    company: 'Meridian Health',
    initials: 'DF',
  },
  {
    quote:
      'We rolled LogMaster out across 12 sites in a week. The multi-tenant model let each branch keep autonomy while HQ gets full visibility.',
    author: 'Priya Nair',
    role: 'Head of Corporate Security',
    company: 'Atlas Manufacturing',
    initials: 'PN',
  },
];

const logos = ['Northwind', 'Meridian', 'Atlas', 'Vortex', 'Helios', 'Quartz'];

export function Testimonials() {
  return (
    <section
      id="testimonials"
      className="relative py-24 bg-bg-0"
      aria-labelledby="testimonials-title"
    >
      <div className="section-container">
        <div className="section-inner">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2
              id="testimonials-title"
              className="font-display text-3xl sm:text-4xl font-bold mb-4"
            >
              Trusted by teams that <span className="text-gradient">take access seriously</span>
            </h2>
            <p className="text-text-2 text-lg">
              Organizations of every size rely on LogMaster to keep their reception secure and auditable.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {testimonials.map((testimonial) => (
              <figure
                key={testimonial.author}
                className="panel-tech rounded-xl p-6 flex flex-col"
              >
                <Quote className="w-8 h-8 text-accent-0/40 mb-4" />
                <blockquote className="text-text-2 leading-relaxed text-sm flex-1">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div className="flex gap-1 mt-4 mb-4" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-accent-0 fill-accent-0" />
                  ))}
                </div>
                <figcaption className="flex items-center gap-3 pt-4 border-t border-border-0">
                  <div className="w-10 h-10 rounded-full bg-accent-2/30 flex items-center justify-center text-accent-0 font-bold text-sm">
                    {testimonial.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-1">{testimonial.author}</p>
                    <p className="text-xs text-text-3">
                      {testimonial.role} · {testimonial.company}
                    </p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
            {logos.map((logo) => (
              <span
                key={logo}
                className="font-display text-xl font-bold tracking-wider text-text-3"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
