import { redirect } from 'next/navigation';
import { OperationsView } from '@/App';
import { requireUser } from '@/server/session';

export default async function OperationsPage() {
  const user = await requireUser('/', ['operador', 'admin', 'root', 'demo']);
  if (user.role === 'auditor') redirect('/audit');
  return <OperationsView />;
}
