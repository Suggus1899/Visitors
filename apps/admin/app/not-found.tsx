import { redirect } from 'next/navigation';

// Match the former react-router catch-all (`*` → `/`).
export default function NotFound() {
    redirect('/');
}
