import { SessionRenewal } from '@/components/SessionRenewal';
import { safeReturnTo } from './safe-return-to';

export default async function RenewSessionPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return <SessionRenewal returnTo={returnTo} />;
}
