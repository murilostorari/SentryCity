import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const penv = (name: string) => JSON.stringify(process.env[name] || env[name] || '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GOOGLE_MAPS_API_KEY': penv('GOOGLE_MAPS_API_KEY'),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': penv('NEXT_PUBLIC_SUPABASE_URL'),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': penv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      'process.env.GROQ_API_KEY': penv('GROQ_API_KEY'),
      'process.env.AI_PRODUCT_MODEL': penv('AI_PRODUCT_MODEL'),
      'process.env.AI_PRODUCT_PROVIDER': penv('AI_PRODUCT_PROVIDER'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
