'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/useAuth';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login({ email, password });
      toast.success('Welcome back, superadmin.');
      router.push('/dashboard');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Login failed.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-0)] bg-grid p-4">
      <div className="w-full max-w-md animate-slideUp">
        <div className="panel-tech rounded-2xl p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-0)] to-[var(--accent-1)] text-[#081116] shadow-lg shadow-emerald-500/20">
              <Shield size={32} />
            </div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-1)]">
              LogMaster Platform
            </h1>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Superadmin access only
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@logmaster.io"
              required
              autoFocus
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-[var(--text-3)]">
            Only accounts with <code className="text-[var(--text-2)]">isSuperAdmin</code> can access
            this console. Mock mode accepts any credentials.
          </div>
        </div>
      </div>
    </div>
  );
}
