import { useQueryClient } from '@tanstack/react-query';

export const useVisitRefresh = () => {
  const queryClient = useQueryClient();

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['visits'] });
    queryClient.invalidateQueries({ queryKey: ['activeVisits'] });
    queryClient.invalidateQueries({ queryKey: ['waitingVisits'] });
    queryClient.invalidateQueries({ queryKey: ['intermittentVisits'] });
    queryClient.invalidateQueries({ queryKey: ['visitors'] });
  };

  const refreshVisits = () => {
    queryClient.invalidateQueries({ queryKey: ['visits'] });
    queryClient.invalidateQueries({ queryKey: ['activeVisits'] });
  };

  return { refreshAll, refreshVisits };
};

export default useVisitRefresh;
