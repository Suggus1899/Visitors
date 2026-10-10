import { SessionRenewal } from '@/components/SessionRenewal';

export default async function RenewSessionPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const requested = (await searchParams).returnTo || '/';
  let returnTo = '/';
  try {
    const url = new URL(requested, 'https://logmaster.invalid');
    if (url.origin === 'https://logmaster.invalid') returnTo = `${url.pathname}${url.search}`;
  } catch { /* use the safe default */ }
  return <SessionRenewal returnTo={returnTo} />;
}
