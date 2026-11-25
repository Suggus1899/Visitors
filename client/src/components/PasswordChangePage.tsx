'use client';

import { PasswordChangeModal } from './PasswordChangeModal';
import { useAuth } from '@/hooks/useAuth';

export function PasswordChangePage() {
  const { logout } = useAuth();
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-[#14532d] via-[#166534] to-[#15803d] p-4">
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
      <PasswordChangeModal show onPasswordChanged={logout} />
    </main>
  );
}
