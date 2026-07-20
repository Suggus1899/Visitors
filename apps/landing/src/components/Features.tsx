import {
  Users,
  CalendarDays,
  ClipboardCheck,
  ShieldCheck,
  Database,
  Building2,
} from 'lucide-react';
import type { FeatureItem } from '../types';

const features: FeatureItem[] = [
  {
    title: 'Visitor Control',
    description:
      'Register check-in, check-out and admissions in real time. Identify recurring visitors and manage permissions from a single panel.',
    icon: Users,
  },
  {
    title: 'Visit Calendar',
    description:
      'Plan events and scheduled visits. Visualize expected flow by day, week or month and avoid reception bottlenecks.',
    icon: CalendarDays,
  },
  {
    title: 'Full Audit Trail',
    description:
      'Every action is recorded: who, what and when. Filter by user, date or event type for compliance and traceability.',
    icon: ClipboardCheck,
  },
  {
    title: 'GDPR & Ley 25.326 Compliance',
    description:
      'Built-in consent capture, data retention controls and right-to-be-forgotten workflows to stay compliant with privacy regulations.',
    icon: ShieldCheck,
  },
  {
    title: 'Automatic Backups',
    description:
      'Keep your data safe with configurable backups. Recover information quickly after any incident with point-in-time restore.',
    icon: Database,
  },
  {
    title: 'Multi-tenant Architecture',
    description:
      'Each organization gets an isolated workspace with its own users, roles and data. Scale securely across many clients.',
    icon: Building2,
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 bg-surface-0" aria-labelledby="features-title">
      <div className="section-container">
        <div className="section-inner">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2
              id="features-title"
              className="font-display text-3xl sm:text-4xl font-bold mb-4"
            >
              Everything you need to <span className="text-gradient">control access</span>
            </h2>
            <p className="text-text-2 text-lg">
              A toolkit designed for reception, security and operations teams.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="group panel-tech rounded-xl p-6 transition duration-300 hover:-translate-y-1 hover:border-accent-0/30"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent-2/20 flex items-center justify-center mb-5 group-hover:bg-accent-0/20 transition">
                    <Icon className="w-6 h-6 text-accent-0" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-text-2 leading-relaxed text-sm">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
