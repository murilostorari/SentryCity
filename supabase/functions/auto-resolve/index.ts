import { withSupabase } from "@supabase/functions-js";

/**
 * Edge Function: Auto-resolve inactive incidents
 * --------------------------------------------------------------------------
 * Executa a função `auto_resolve_inactive_incidents()` (migration 0013) que:
 *   - Marca como 'resolved' incidentes 'active'/'pending' sem novas
 *     interações por mais do que auto_resolve_hours (horas configuráveis
 *     por tipo em incident_visibility_config).
 *   - O trigger trg_incident_lifecycle (migration 0008) preenche
 *     automaticamente resolved_at e expires_at.
 *
 * Agende via:
 *   - pg_cron (Supabase Pro): select cron.schedule('auto-resolve', '0 * * * *', 'select auto_resolve_inactive_incidents()');
 *   - cron-job.org: POST https://<project>.supabase.co/functions/v1/auto-resolve
 *
 * Auth: requer 'secret' (service_role key). Ninguém anônimo pode disparar.
 */
export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    try {
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "auto_resolve_inactive_incidents"
      );

      if (error) {
        console.error("[auto-resolve] RPC falhou:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const count = data as number;
      return new Response(JSON.stringify({ resolved: count }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auto-resolve] Erro:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
};
