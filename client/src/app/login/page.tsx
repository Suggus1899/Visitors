import { redirect } from 'next/navigation';
import Login from '@/components/Login';
import { readCurrentUser } from '@/server/session';

export default async function LoginPage() {
  const user = await readCurrentUser();
  if (user && !user.mustChangePassword) redirect(user.role === 'root' ? '/root' : user.role === 'auditor' ? '/audit' : '/');
  if (user?.mustChangePassword) redirect('/change-password');
  return <Login />;
}
