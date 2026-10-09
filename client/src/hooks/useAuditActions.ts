import { useQuery } from '@tanstack/react-query';
import api from '../services/api.v1';

export const useAuditActions = () => useQuery({
    queryKey: ['auditActions'],
    queryFn: async (): Promise<string[]> => (await api.get('/audit/actions')).data.data,
    staleTime: 60_000,
});
