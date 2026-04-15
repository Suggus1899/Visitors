import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VisitService } from '../services/api.v1';

export const visitQueryKeys = {
    all: ['visits'] as const,
    active: () => [...visitQueryKeys.all, 'active'] as const,
    waiting: () => [...visitQueryKeys.all, 'waiting'] as const,
};

interface QueryOptions {
    refetchInterval?: number | false;
    enabled?: boolean;
}

export const useActiveVisitsQuery = (options?: QueryOptions) => {
    return useQuery({
        queryKey: visitQueryKeys.active(),
        queryFn: VisitService.getActiveVisits,
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
    });
};

export const useWaitingVisitsQuery = (options?: QueryOptions) => {
    return useQuery({
        queryKey: visitQueryKeys.waiting(),
        queryFn: VisitService.getWaitingVisits,
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
    });
};

export const useCheckOutMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, notes }: { id: number; notes?: string }) => VisitService.checkOut(id, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
        },
    });
};

export const useAdmitVisitorMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => VisitService.admitVisitor(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
        },
    });
};

export const useInvalidateVisitQueries = () => {
    const queryClient = useQueryClient();

    return () => {
        queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
    };
};
