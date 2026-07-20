import { Check, Sparkles, X } from 'lucide-react';
import type { PricingTier } from '../types';

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'Ideal for trying out or small operations.',
    limits: ['Up to 100 visits/mo', '1 user', '1 site'],
    features: ['Check-in / check-out', 'Basic photo capture', 'Simple reports'],
    cta: 'Create free account',
  },
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    description: 'For growing offices and receptions.',
    limits: ['Up to 1,000 visits/mo', '5 users', '1 site'],
    features: [
      'Everything in Free',
      'Event audit trail',
      'Visit calendar',
      'Email support',
    ],
    cta: 'Get started',
  },
  {
    name: 'Professional',
    price: '$79',
    period: '/mo',
    description: 'Preferred by security and operations teams.',
    limits: ['Unlimited visits', '20 users', 'Multiple sites'],
    features: [
      'Everything in Starter',
      'Advanced reports & export',
      'Automatic backups',
      'Roles & permissions',
      'Priority support',
    ],
    highlighted: true,
    cta: 'Request access',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations with specific needs.',
    limits: ['Everything unlimited', 'Unlimited users', 'Dedicated infrastructure'],
    features: [
      'Everything in Professional',
      'API & webhooks',
      'SSO / LDAP integration',
      'Guaranteed SLA',
      'Assisted implementation',
    ],
    cta: 'Contact sales',
  },
];

const comparisonRows: { label: string; values: (boolean | string)[] }[] = [
  { label: 'Monthly visits', values: ['100', '1,000', 'Unlimited', 'Unlimited'] },
  { label: 'Users', values: ['1', '5', '20', 'Unlimited'] },
  { label: 'Sites', values: ['1', '1', 'Multiple', 'Multiple'] },
  { label: 'Check-in / check-out', values: [true, true, true, true] },
  { label: 'Photo capture', values: [true, true, true, true] },
  { label: 'Audit trail', values: [false, true, true, true] },
  { label: 'Visit calendar', values: [false, true, true, true] },
  { label: 'Advanced reports & export', values: [false, false, true, true] },
  { label: 'Automatic backups', values: [false, false, true, true] },
  { label: 'Roles & permissions', values: [false, false, true, true] },
  { label: 'API & webhooks', values: [false, false, false, true] },
  { label: 'SSO / LDAP', values: [false, false, false, true] },
  { label: 'Guaranteed SLA', values: [false, false, false, true] },
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="w-5 h-5 text-accent-0 mx-auto" aria-label="Included" />
    ) : (
      <X className="w-5 h-5 text-text-3 mx-auto opacity-50" aria-label="Not included" />
    );
  }
  return <span className="text-text-2 text-sm">{value}</span>;
}

export function Pricing() {
  const scrollToContact = () => {
    document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' });
  };
  const scrollToDemo = () => {
    document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="pricing" className="relative py-24 bg-bg-0 bg-grid" aria-labelledby="pricing-title">
      <div className="section-container">
        <div className="section-inner">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2
              id="pricing-title"
              className="font-display text-3xl sm:text-4xl font-bold mb-4"
            >
              Clear plans, <span className="text-gradient">no surprises</span>
            </h2>
            <p className="text-text-2 text-lg">
              Pick the plan that fits your operation and start controlling access today.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl p-6 flex flex-col transition duration-300 hover:-translate-y-1 ${
                  tier.highlighted
                    ? 'bg-surface-1 border-2 border-accent-0 shadow-[0_0_40px_-12px_rgba(74,222,128,0.3)]'
                    : 'panel-tech border border-border-1'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-0 text-[#081116] text-xs font-bold">
                    <Sparkles className="w-3 h-3" />
                    Most popular
                  </div>
                )}

                <h3 className="font-display text-xl font-bold mb-1">{tier.name}</h3>
                <p className="text-text-3 text-sm mb-4">{tier.description}</p>
                <p className="font-display text-3xl font-bold text-text-1 mb-1">
                  {tier.price}
                  {tier.period && (
                    <span className="text-base font-normal text-text-3">{tier.period}</span>
                  )}
                </p>

                <div className="space-y-4 mb-6 flex-1 mt-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">
                      Limits
                    </p>
                    <ul className="space-y-2">
                      {tier.limits.map((limit) => (
                        <li key={limit} className="flex items-start gap-2 text-sm text-text-2">
                          <Check className="w-4 h-4 text-accent-0 shrink-0 mt-0.5" />
                          {limit}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">
                      Includes
                    </p>
                    <ul className="space-y-2">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-text-2">
                          <Check className="w-4 h-4 text-accent-0 shrink-0 mt-0.5" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  onClick={tier.name === 'Enterprise' ? scrollToContact : scrollToDemo}
                  className={tier.highlighted ? 'btn-primary w-full' : 'btn-secondary w-full'}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>

          {/* Feature comparison table */}
          <div className="panel-tech rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border-0">
                    <th className="text-left p-4 text-text-3 text-xs uppercase tracking-wider font-semibold">
                      Feature
                    </th>
                    {tiers.map((tier) => (
                      <th
                        key={tier.name}
                        className={`p-4 text-center text-xs uppercase tracking-wider font-semibold ${
                          tier.highlighted ? 'text-accent-0' : 'text-text-3'
                        }`}
                      >
                        {tier.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-b border-border-0 last:border-0">
                      <td className="p-4 text-text-2 text-sm font-medium">{row.label}</td>
                      {row.values.map((value, idx) => (
                        <td key={idx} className="p-4 text-center">
                          <Cell value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
