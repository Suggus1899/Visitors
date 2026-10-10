import type { ReactNode } from 'react';
import { requireUser } from '@/server/session';

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  await requireUser('/');
  return <>{children}</>;
}
