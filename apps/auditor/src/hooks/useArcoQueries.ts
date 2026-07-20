import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivacyService } from '../services/privacyApi';
import type {
    ArcoCreatePayload,
    ArcoRequestFilters,
    ArcoStatusUpdatePayload,
} from '../types';

export const arcoQueryKeys = {
    all: ['arco'] as const,
    list: (tenantSlug: string, filters: ArcoRequestFilters) =>
        [...arcoQueryKeys.all, 'list', tenantSlug, filters] as const,
    detail: (tenantSlug: string, id: number) =>
        [...arcoQueryKeys.all, 'detail', tenantSlug, id] as const,
    subject: (tenantSlug: string, cedula: string) =>
        [...arcoQueryKeys.all, 'subject', tenantSlug, cedula] as const,
};

export const useArcoListQuery = (tenantSlug: string | null, filters: ArcoRequestFilters) => {
    return useQuery({
        queryKey: arcoQueryKeys.list(tenantSlug || '', filters),
        queryFn: () => PrivacyService.listArcoRequests(tenantSlug!, filters),
        enabled: !!tenantSlug,
    });
};

export const useArcoDetailQuery = (tenantSlug: string | null, id: number | null) => {
    return useQuery({
        queryKey: arcoQueryKeys.detail(tenantSlug || '', id ?? 0),
        queryFn: () => PrivacyService.getArcoRequest(tenantSlug!, id!),
        enabled: !!tenantSlug && id !== null,
    });
};

export const useCreateArcoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            tenantSlug,
            payload,
        }: {
            tenantSlug: string;
            payload: ArcoCreatePayload;
        }) => PrivacyService.createArcoRequest(tenantSlug, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: arcoQueryKeys.all });
        },
    });
};

export const useUpdateArcoStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            tenantSlug,
            id,
            payload,
        }: {
            tenantSlug: string;
            id: number;
            payload: ArcoStatusUpdatePayload;
        }) => PrivacyService.updateArcoStatus(tenantSlug, id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: arcoQueryKeys.all });
        },
    });
};

export const useSubjectDataQuery = (tenantSlug: string | null, cedula: string | null) => {
    return useQuery({
        queryKey: arcoQueryKeys.subject(tenantSlug || '', cedula || ''),
        queryFn: () => PrivacyService.getSubjectData(tenantSlug!, cedula!),
        enabled: !!tenantSlug && !!cedula,
    });
};

export const useExportSubjectDataMutation = () => {
    return useMutation({
        mutationFn: ({
            tenantSlug,
            cedula,
            format,
        }: {
            tenantSlug: string;
            cedula: string;
            format: 'pdf' | 'json';
        }) => PrivacyService.exportSubjectData(tenantSlug, cedula, format),
    });
};
