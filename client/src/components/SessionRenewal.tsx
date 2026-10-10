'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function SessionRenewal({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw new Error('expired'); if (active) router.replace(returnTo); })
      .catch(() => { if (active) router.replace('/login'); });
    return () => { active = false; };
  }, [returnTo, router]);
  return <main className="grid min-h-screen place-items-center bg-[color:var(--bg-0)] text-[color:var(--text-2)]" role="status">Renovando sesión…</main>;
}
