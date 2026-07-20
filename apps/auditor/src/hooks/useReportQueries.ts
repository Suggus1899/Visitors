import { useMutation } from '@tanstack/react-query';
import { ReportService } from '../services/reportApi';
import type { ReportGeneratePayload } from '../types';

export const useGenerateReportMutation = () => {
    return useMutation({
        mutationFn: ({
            tenantSlug,
            payload,
        }: {
            tenantSlug: string;
            payload: ReportGeneratePayload;
        }) => ReportService.generateReport(tenantSlug, payload),
    });
};
