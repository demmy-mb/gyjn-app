import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useEffect } from 'react';

export function useMatches(userName, isEmployer) {
  const { data: matches = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['matches', userName],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
      const { data: dbProfile } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', user.id)
        .single();

      let query = supabase
        .from('matches')
        .select(`
          *,
          jobs(id, role, company, emoji, job_type, salary, description, reqs, tags, colors, category),
          messages(text, sender_type, created_at)
        `);

      if (!isEmployer) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Global Realtime listener
  useEffect(() => {
    if (!userName) return; // Don't subscribe if not logged in

    const channel = supabase
      .channel('matches-messages-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          refetch();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, userName]);

  return { matches, isLoading, isFetching, refetch };
}
