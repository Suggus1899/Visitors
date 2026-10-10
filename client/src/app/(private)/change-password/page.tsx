import { PasswordChangePage } from '@/components/PasswordChangePage';
import { requireUser } from '@/server/session';

export default async function ChangePasswordPage() {
  await requireUser('/change-password');
  return <PasswordChangePage />;
}
