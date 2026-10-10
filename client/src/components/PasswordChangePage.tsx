'use client';

import { PasswordChangeModal } from './PasswordChangeModal';
import { useAuth } from '@/hooks/useAuth';

export function PasswordChangePage() {
  const { logout } = useAuth();
  return <main className="grid min-h-screen place-items-center bg-[color:var(--bg-0)] p-4"><PasswordChangeModal show onPasswordChanged={logout} /></main>;
}
