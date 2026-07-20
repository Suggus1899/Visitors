'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FaqItem } from '../types';

const faqs: FaqItem[] = [
  {
    question: 'How long does the demo last?',
    answer:
      'Demo environments expire automatically after 24 hours. You can request a new demo at any time, subject to a 60-second rate limit between requests to prevent abuse.',
  },
  {
    question: 'Do I need a credit card to try LogMaster?',
    answer:
      'No. The Free plan and the demo environment require no credit card. You only need to provide billing details when upgrading to a paid plan.',
  },
  {
    question: 'Is my visitor data compliant with GDPR and Ley 25.326?',
    answer:
      'Yes. LogMaster includes built-in consent capture, configurable data retention, and right-to-be-forgotten workflows to help you meet GDPR and Argentina Ley 25.326 requirements.',
  },
  {
    question: 'Can I use LogMaster across multiple sites?',
    answer:
      'The Professional and Enterprise plans support multiple sites. Each site can have its own users and configuration while sharing a single tenant workspace.',
  },
  {
    question: 'How are backups handled?',
    answer:
      'Professional and Enterprise plans include automatic, configurable backups with point-in-time restore. You can also trigger manual backups from the admin panel.',
  },
  {
    question: 'Does LogMaster integrate with my existing systems?',
    answer:
      'The Enterprise plan exposes a REST API and webhooks, plus SSO and LDAP integration. Contact sales to discuss custom integrations.',
  },
  {
    question: 'What devices can my reception team use?',
    answer:
      'LogMaster is a web application that works on any modern browser, including tablets and laptops with a webcam for photo capture.',
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Yes. You can upgrade or downgrade your plan at any time from the subscription editor. Changes are prorated automatically.',
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-tech rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-text-1">{item.question}</span>
        <ChevronDown
          className={`w-5 h-5 text-text-3 shrink-0 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 text-text-2 text-sm leading-relaxed animate-fade-in">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="relative py-24 bg-surface-0" aria-labelledby="faq-title">
      <div className="section-container">
        <div className="section-inner max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 id="faq-title" className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Frequently asked <span className="text-gradient">questions</span>
            </h2>
            <p className="text-text-2 text-lg">Everything you need to know before getting started.</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqRow key={faq.question} item={faq} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
