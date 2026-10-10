import ResetPassword from '@/components/ResetPassword';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const token = (await searchParams).token;
  return <ResetPassword initialToken={Array.isArray(token) ? token[0] ?? '' : token ?? ''} />;
}
