import { OperationsView } from '@/App';
import { requireUser } from '@/server/session';

export default async function OperationsPage() {
  // requireUser already sends auditors to /audit.
  await requireUser('/', ['operador', 'admin', 'root', 'demo']);
  return <OperationsView />;
}
