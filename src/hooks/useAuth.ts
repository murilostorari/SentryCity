import { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/Profile';
import {
  signUpWithEmail,
  signInWithEmail,
  signOut as signOutService,
  getCurrentUser,
  getCurrentSession,
  fetchProfile,
  upsertProfile,
} from '../services/auth';

/**
 * Hook central de autenticação.
 *
 * - Mantém `user` (auth.users) e `profile` (public.profiles) sincronizados.
 * - Persiste a sessão automaticamente (localStorage via Supabase Auth).
 * - Reage a eventos de auth (login/logout/refresh) em tempo real.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Recarrega o profile do usuário atual. */
  const refreshProfile = useCallback(async (uid: string) => {
    const p = await fetchProfile(uid);
    if (p) setProfile(p);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await getCurrentSession();
      const u = await getCurrentUser();
      setUser(u);
      if (u) {
        await refreshProfile(u.id);
      } else if (!session) {
        setProfile(null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao carregar sessão.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshProfile]);

  // Carrega sessão persistida no mount e observa mudanças de auth.
  useEffect(() => {
    refresh();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, [refresh, refreshProfile]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    setError(null);
    const result = await signUpWithEmail(email, password, name);
    if (result.error) setError(result.error);
    else await refresh();
    return result;
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const result = await signInWithEmail(email, password);
    if (result.error) setError(result.error);
    else await refresh();
    return result;
  }, [refresh]);

  const signOut = useCallback(async () => {
    setError(null);
    const result = await signOutService();
    if (result.error) setError(result.error);
    else {
      setUser(null);
      setProfile(null);
    }
    return result;
  }, []);

  const updateName = useCallback(async (name: string) => {
    if (!user) return null;
    const p = await upsertProfile(user.id, name);
    if (p) setProfile(p);
    return p;
  }, [user]);

  return {
    user,
    profile,
    isLoading,
    error,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    updateName,
    refresh,
    refreshProfile,
  };
}
