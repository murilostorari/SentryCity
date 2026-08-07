import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase compartilhado da aplicação.
 *
 * As variáveis são injetadas em tempo de build pelo Vite (ver `vite.config.ts`,
 * bloco `define`). Usamos a chave anon (pública) — nunca a service role no
 * frontend.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Não quebra a aplicação, apenas avisa. As chamadas ao Supabase falharão
  // de forma controlada até as variáveis serem configuradas.
  console.warn(
    'Variáveis do Supabase ausentes. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
