/**
 * Serviço de Autenticação (Supabase Auth)
 * --------------------------------------------------------------------------
 * Camada de acesso ao Supabase Auth e à tabela `profiles`.
 * Fluxos: cadastro, login, logout, recuperação de sessão e profile.
 */
import { supabase } from '../lib/supabase';
import { Profile } from '../types/Profile';
import { User } from '@supabase/supabase-js';

/** Resultado de cadastro/login. */
export interface AuthResult {
  user: User | null;
  requiresEmailConfirmation: boolean;
  error: string | null;
}

/** Cadastra um novo usuário (email + senha) e cria o profile automaticamente. */
export async function signUpWithEmail(email: string, password: string, name?: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) return { user: null, requiresEmailConfirmation: false, error: error.message };

  // Se o profile não for criado pelo trigger (ex: email já existe), garante via upsert.
  if (data.user) {
    await upsertProfile(data.user.id, name);
  }

  // Com confirmação de email habilitada, signUp retorna o usuário mas sem sessão.
  const session = await getCurrentSession();
  return {
    user: data.user,
    requiresEmailConfirmation: !!data.user && !session,
    error: null,
  };
}

/** Login com email e senha. */
export async function signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

/** Logout. */
export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

/** Busca o usuário autenticado atual (via sessão persistida). */
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Busca a sessão atual. */
export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Cria/atualiza o profile de um usuário (upsert). */
export async function upsertProfile(userId: string, name?: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, name: name ?? null }, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.error('upsertProfile falhou:', error.message);
    return null;
  }
  return data as Profile;
}

/** Busca o profile de um usuário. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('fetchProfile falhou:', error.message);
    return null;
  }
  return data as Profile;
}
