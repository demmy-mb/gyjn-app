import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useSubscription() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['user_subscription_status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isPremium: false, subscription: null };

      // 1. Check user profile directly for is_premium = 'yes'
      const [seekerRes, employerRes, subRes] = await Promise.all([
        supabase.from('seeker_profiles').select('is_premium').eq('id', user.id).maybeSingle(),
        supabase.from('employer_profiles').select('is_premium').eq('id', user.id).maybeSingle(),
        supabase.from('subscriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const profilePremiumVal = seekerRes.data?.is_premium || employerRes.data?.is_premium || 'no';
      const isProfilePremium = profilePremiumVal.toLowerCase() === 'yes';

      const subscription = subRes.data || null;

      // User is premium if profile flag is 'yes' OR active subscription period is valid
      const isSubActive = Boolean(
        subscription &&
        (subscription.status === 'active' || subscription.status === 'cancelled') &&
        (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
      );

      return {
        isPremium: isProfilePremium || isSubActive,
        subscription,
      };
    },
    staleTime: 30_000,
  });

  const isPremium = Boolean(data?.isPremium);
  const subscription = data?.subscription || null;
  const isCancelled = subscription?.status === 'cancelled';

  // Mutation to cancel subscription
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cancel-subscription');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_subscription_status'] });
      queryClient.invalidateQueries({ queryKey: ['user_subscription'] });
    },
  });

  return {
    subscription,
    isPremium,
    isCancelled,
    isLoading: isLoading || isFetching,
    refetch,
    cancelSubscription: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}
