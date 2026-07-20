import { useState } from 'react';
import {
  Play,
  Wand2,
  Shield,
  Clock,
  Eye,
  CheckCircle2,
  ExternalLink,
  Copy,
  Loader2,
} from 'lucide-react';
import { useDemo } from '../hooks/useDemo';
import type { DemoRequest } from '../types';

const initialForm: DemoRequest = {
  name: '',
  email: '',
  company: '',
  phone: '',
};

export function LiveDemo() {
  const { loading, error, result, rateLimitedFor, startDemo, clearResult } = useDemo();
  const [form, setForm] = useState<DemoRequest>(initialForm);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await startDemo(form);
  };

  const handleReset = () => {
    clearResult();
    setForm(initialForm);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard may be unavailable; ignore silently.
    }
  };

  const isRateLimited = rateLimitedFor > 0;

  return (
    <section id="demo" className="relative py-24 bg-surface-0 overflow-hidden" aria-labelledby="demo-title">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-0/10 rounded-full blur-[120px]" />

      <div className="section-container relative z-10">
        <div className="section-inner">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-2/20 border border-accent-0/30 text-accent-0 text-sm font-medium mb-6">
              <Wand2 className="w-4 h-4" />
              No-commitment demo environment
            </div>

            <h2 id="demo-title" className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
              Try LogMaster <span className="text-gradient">before you decide</span>
            </h2>

            <p className="text-text-2 text-lg mb-10 max-w-2xl mx-auto">
              Activate a temporary demo account with sample data. Explore the operations panel,
              register visits, review audit logs and experience the full flow without installing
              anything.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-10 max-w-2xl mx-auto text-left">
              <div className="bg-surface-2 border border-border-1 rounded-xl p-4">
                <Shield className="w-5 h-5 text-accent-0 mb-2" />
                <p className="text-sm font-medium text-text-1">Isolated data</p>
                <p className="text-xs text-text-3 mt-1">Your demo environment is independent and secure.</p>
              </div>
              <div className="bg-surface-2 border border-border-1 rounded-xl p-4">
                <Clock className="w-5 h-5 text-accent-0 mb-2" />
                <p className="text-sm font-medium text-text-1">Ready in seconds</p>
                <p className="text-xs text-text-3 mt-1">No long forms or configuration required.</p>
              </div>
              <div className="bg-surface-2 border border-border-1 rounded-xl p-4">
                <Eye className="w-5 h-5 text-accent-0 mb-2" />
                <p className="text-sm font-medium text-text-1">Guided tour</p>
                <p className="text-xs text-text-3 mt-1">Discover key features step by step.</p>
              </div>
            </div>

            {result ? (
              <DemoSuccess result={result} onReset={handleReset} copied={copied} onCopy={copyToClipboard} />
            ) : (
              <form
                onSubmit={handleSubmit}
                className="max-w-2xl mx-auto text-left panel-tech rounded-xl p-6 lg:p-8 space-y-4"
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="demo-name" className="block text-sm font-medium text-text-2 mb-1.5">
                      Full name
                    </label>
                    <input
                      id="demo-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Jane Doe"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-email" className="block text-sm font-medium text-text-2 mb-1.5">
                      Work email
                    </label>
                    <input
                      id="demo-email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="jane@company.com"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-company" className="block text-sm font-medium text-text-2 mb-1.5">
                      Company
                    </label>
                    <input
                      id="demo-company"
                      type="text"
                      required
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Acme Corp"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-phone" className="block text-sm font-medium text-text-2 mb-1.5">
                      Phone
                    </label>
                    <input
                      id="demo-phone"
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+1 234 567 890"
                      className="input-field"
                    />
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || isRateLimited}
                  className="btn-primary text-lg px-8 py-4 gap-2 w-full sm:w-auto disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Provisioning your demo...
                    </>
                  ) : isRateLimited ? (
                    `Please wait ${rateLimitedFor}s before retrying`
                  ) : (
                    <>
                      Start free demo
                      <Play className="w-5 h-5 fill-current" />
                    </>
                  )}
                </button>

                <p className="text-xs text-text-3">
                  The demo expires automatically after 24 hours. No credit card required.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface DemoSuccessProps {
  result: import('../types').DemoResponse;
  onReset: () => void;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

function DemoSuccess({ result, onReset, copied, onCopy }: DemoSuccessProps) {
  const credentialRows = result.credentials
    ? ([
        { key: 'guardia', label: 'Guard', ...result.credentials.guardia },
        { key: 'admin', label: 'Admin', ...result.credentials.admin },
        { key: 'auditor', label: 'Auditor', ...result.credentials.auditor },
      ] as { key: string; label: string; email: string; password: string }[])
    : [];

  const linkRows = result.links
    ? ([
        { key: 'admin', label: 'Admin app', href: result.links.admin },
        { key: 'auditor', label: 'Auditor app', href: result.links.auditor },
        { key: 'system', label: 'System app', href: result.links.system },
      ].filter((l) => l.href) as { key: string; label: string; href: string }[])
    : [];

  return (
    <div className="max-w-2xl mx-auto text-left panel-tech rounded-xl p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 text-accent-0">
        <CheckCircle2 className="w-7 h-7" />
        <div>
          <p className="font-display text-xl font-bold text-text-1">Your demo is ready</p>
          <p className="text-sm text-text-3">
            Tenant: <span className="font-mono text-text-2">{result.demoSlug}</span>
          </p>
        </div>
      </div>

      {result.redirectUrl && (
        <a
          href={result.redirectUrl}
          className="btn-primary w-full gap-2"
          rel="noreferrer"
        >
          Open demo dashboard
          <ExternalLink className="w-4 h-4" />
        </a>
      )}

      {credentialRows.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-text-2 mb-3">Demo credentials</p>
          <div className="space-y-2">
            {credentialRows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col sm:flex-row sm:items-center gap-2 bg-surface-2 border border-border-1 rounded-lg p-3"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-accent-0 w-20 shrink-0">
                  {row.label}
                </span>
                <code className="flex-1 font-mono text-sm text-text-2 break-all">
                  {row.email} / {row.password}
                </code>
                <button
                  type="button"
                  onClick={() => onCopy(`${row.email} / ${row.password}`, row.key)}
                  className="btn-ghost text-xs shrink-0"
                  aria-label={`Copy ${row.label} credentials`}
                >
                  {copied === row.key ? (
                    <CheckCircle2 className="w-4 h-4 text-accent-0" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied === row.key ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {linkRows.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-text-2 mb-3">App links</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {linkRows.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="btn-secondary text-sm justify-between"
                rel="noreferrer"
              >
                {link.label}
                <ExternalLink className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={onReset} className="btn-ghost text-sm">
        Request another demo
      </button>
    </div>
  );
}
