import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VisitService } from './api';
import type { Visitor, VisitorWithHistory } from '@logmaster/types';

export const visitQueryKeys = {
    all: ['visits'] as const,
    active: () => [...visitQueryKeys.all, 'active'] as const,
    waiting: () => [...visitQueryKeys.all, 'waiting'] as const,
    intermittent: () => [...visitQueryKeys.all, 'intermittent'] as const,
    recent: () => [...visitQueryKeys.all, 'recent'] as const,
    visitors: ['visitors'] as const,
    visitor: (cedula: string) => [...visitQueryKeys.visitors, cedula] as const,
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

export const useIntermittentVisitsQuery = (options?: QueryOptions) => {
    return useQuery({
        queryKey: visitQueryKeys.intermittent(),
        queryFn: VisitService.getIntermittentVisits,
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
    });
};

export const useGoIntermittentMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, notes }: { id: number; notes?: string }) => VisitService.goIntermittent(id, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
        },
    });
};

export const useReactivateVisitMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => VisitService.reactivateVisit(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
        },
    });
};

export const useRecentVisitsQuery = (options?: QueryOptions) => {
    return useQuery({
        queryKey: visitQueryKeys.recent(),
        queryFn: () => VisitService.getRecentVisits(20),
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
    });
};

export const useInvalidateVisitQueries = () => {
    const queryClient = useQueryClient();

    return () => {
        queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
    };
};

// Visitor queries
export const useVisitorQuery = (cedula: string | null, includeHistory: boolean = false) => {
    return useQuery<Visitor | VisitorWithHistory | null>({
        queryKey: [...visitQueryKeys.visitor(cedula || ''), { includeHistory }],
        queryFn: () => cedula ? VisitService.getVisitorByCedula(cedula, includeHistory) : null,
        enabled: !!cedula,
    });
};

export const useAllVisitorsQuery = (page: number = 1, limit: number = 50, company?: string) => {
    return useQuery({
        queryKey: [...visitQueryKeys.visitors, 'all', { page, limit, company }],
        queryFn: () => VisitService.getAllVisitors(page, limit, company),
    });
};

type UpdateVisitorData = Partial<Visitor> & {
    first_name?: string;
    last_name?: string;
    company?: string;
    job_title?: string;
    phone?: string;
    photoBase64?: string;
    idPhotoBase64?: string;
};

export const useUpdateVisitorMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cedula, data }: { cedula: string; data: UpdateVisitorData }) => 
            VisitService.updateVisitor(cedula, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.visitor(variables.cedula) });
            queryClient.invalidateQueries({ queryKey: visitQueryKeys.visitors });
        },
    });
};
