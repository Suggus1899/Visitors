import { useState } from 'react';
import {
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ArrowUp,
  Twitter,
  Linkedin,
  Github,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Demo', href: '#demo' },
    { label: 'FAQ', href: '#faq' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#contact' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'GDPR & Ley 25.326', href: '#' },
    { label: 'Cookie Policy', href: '#' },
  ],
};

const socialLinks = [
  { label: 'Twitter', icon: Twitter, href: '#' },
  { label: 'LinkedIn', icon: Linkedin, href: '#' },
  { label: 'GitHub', icon: Github, href: '#' },
];

export function ContactFooter() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    // TODO(backend): Wire this form to a real contact endpoint
    // (e.g. POST /v1/contact or an email service). For now we simulate success.
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    setSubmitted(true);
    setName('');
    setEmail('');
    setCompany('');
    setMessage('');
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <footer id="contact" className="relative bg-surface-0 border-t border-border-0">
      <div className="section-container py-16">
        <div className="section-inner grid lg:grid-cols-2 gap-12">
          <div className="space-y-6">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                scrollToTop();
              }}
              className="flex items-center gap-2 font-display text-2xl font-bold tracking-wider text-text-1"
            >
              <ShieldCheck className="w-8 h-8 text-accent-0" />
              LogMaster
            </a>
            <p className="text-text-2 max-w-md">
              Visitor management software for organizations that value security, traceability
              and a great user experience.
            </p>
            <div className="space-y-3 text-text-2">
              <a href="mailto:hello@logmaster.com" className="flex items-center gap-3 hover:text-accent-0 transition">
                <Mail className="w-5 h-5 text-accent-0" />
                hello@logmaster.com
              </a>
              <a href="tel:+1234567890" className="flex items-center gap-3 hover:text-accent-0 transition">
                <Phone className="w-5 h-5 text-accent-0" />
                +1 234 567 890
              </a>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-accent-0" />
                <span>Available worldwide</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    className="p-2 rounded-lg bg-surface-2 border border-border-1 text-text-2 hover:text-accent-0 hover:border-accent-0 transition"
                    aria-label={social.label}
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="panel-tech rounded-xl p-6 lg:p-8 border border-border-1">
            <h3 className="font-display text-xl font-bold mb-2">Request access</h3>
            <p className="text-text-3 text-sm mb-6">
              Tell us about your organization and we will reach out to activate your account.
            </p>
            {submitted ? (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-lg border border-accent-0/30 bg-accent-0/10 px-4 py-4 text-accent-0"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm">Thanks for your interest. We will be in touch shortly.</span>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-text-2 mb-1.5">
                      Name
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-text-2 mb-1.5">
                      Email
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      className="input-field"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="contact-company" className="block text-sm font-medium text-text-2 mb-1.5">
                    Company
                  </label>
                  <input
                    id="contact-company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Corp"
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-text-2 mb-1.5">
                    How can we help?
                  </label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your needs..."
                    className="input-field resize-none"
                  />
                </div>
                <button type="submit" className="btn-primary w-full gap-2" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send request'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border-0">
        <div className="section-container py-8">
          <div className="section-inner grid gap-8 md:grid-cols-4">
            {Object.entries(footerLinks).map(([section, links]) => (
              <div key={section}>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">
                  {section}
                </p>
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-text-2 hover:text-accent-0 transition"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex md:justify-end items-start">
              <button
                onClick={scrollToTop}
                className="p-2 rounded-lg bg-surface-2 text-text-2 hover:text-accent-0 hover:border-accent-0 border border-border-1 transition"
                aria-label="Back to top"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border-0">
        <div className="section-container py-6">
          <div className="section-inner flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-text-3 text-sm">
              &copy; {new Date().getFullYear()} LogMaster. All rights reserved.
            </p>
            <p className="text-text-3 text-xs">
              Built with security and privacy at the core.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
