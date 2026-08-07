/** Perfil de usuário do SentryCity (estende auth.users). */
export interface Profile {
  id: string;
  name: string | null;
  role: 'admin' | 'analyst' | 'viewer';
  reputation_score: number;
  reports_count: number;
  confirmed_reports: number;
  resolved_reports: number;
  created_at: string;
}
