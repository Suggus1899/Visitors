import { redirect } from 'next/navigation';
import { getServerSession } from '../../lib/auth';
import Login from '@/components/Login';

export default async function LoginPage() {
    // If already authenticated (access cookie present), go to dashboard.
    const session = await getServerSession();
    if (session?.authenticated) {
        redirect('/');
    }
    return <Login />;
}
