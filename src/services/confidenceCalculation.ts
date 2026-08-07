/**
 * Cálculo de Confiança do Incidente
 * --------------------------------------------------------------------------
 * Função pura para calcular confidence_score baseada em:
 * - Fonte original (trust_score da source)
 * - Confirmações de usuários ponderadas por reputação (peso = reputação/100)
 * - Negativas de usuários (incident_reports type=deny)
 * - Análises de IA (ai_analysis.confidence)
 * - Confirmações de fontes (incident_confirmations)
 *
 * Retorna valor entre 0.0 e 1.0
 */

export interface ConfidenceFactors {
  /** Trust score da fonte original (0-1) */
  sourceTrust: number;
  /** Número de confirmações de usuários */
  userConfirms: number;
  /** Soma dos pesos (reputação/100) das confirmações. Se ausente, usa userConfirms */
  userConfirmWeights?: number;
  /** Número de negações de usuários */
  userDenies: number;
  /** Número de resoluções informadas */
  userResolved: number;
  /** Confiança da IA (se disponível) */
  aiConfidence?: number;
  /** Confiança média das confirmações de fontes (incident_confirmations) */
  sourceConfirmationsAvg?: number;
  /** Número de fontes que confirmaram */
  sourceConfirmationsCount?: number;
}

/** Pesos para cada fator (somam 1.0) */
const WEIGHTS = {
  sourceTrust: 0.30,      // 30% - confiabilidade da fonte original
  userReports: 0.35,      // 35% - relatos de usuários (confirms ponderados - denies)
  aiConfidence: 0.20,     // 20% - análise de IA
  sourceConfirmations: 0.15, // 15% - confirmações de outras fontes
} as const;

/** Clampa reputação para peso entre 0 e 1 (reputação/100). */
export function reputationToWeight(reputation: number): number {
  return Math.min(Math.max(reputation / 100, 0), 1);
}

/** Calcula score de relatos de usuários (-1 a 1, depois normalizado 0-1). */
function calculateUserReportScore(confirmWeight: number, confirms: number, denies: number, resolved: number): number {
  const total = confirms + denies + resolved;
  if (total === 0) return 0.5; // Neutro se sem relatos

  // Confirmações (ponderadas por reputação) e resoluções contam positivo, negações negativo
  const positive = confirmWeight + resolved;
  const negative = denies;

  // Score bruto: (positivo - negativo) / total
  // Resultado entre -1 e 1
  const raw = (positive - negative) / total;

  // Normalizar para 0-1: (-1 -> 0, 0 -> 0.5, 1 -> 1)
  return (raw + 1) / 2;
}

/** Calcula score de confirmações de fontes (0-1) */
function calculateSourceConfirmationScore(avgSimilarity: number, count: number): number {
  if (count === 0) return 0.5;
  // Média de similaridade ponderada pela quantidade (mais fontes = mais confiança)
  const countFactor = Math.min(count / 5, 1); // Satura em 5 fontes
  return avgSimilarity * countFactor + 0.5 * (1 - countFactor);
}

/**
 * Calcula confidence_score final (0.0 a 1.0)
 */
export function calculateIncidentConfidence(factors: ConfidenceFactors): number {
  const {
    sourceTrust,
    userConfirms,
    userConfirmWeights,
    userDenies,
    userResolved,
    aiConfidence,
    sourceConfirmationsAvg,
    sourceConfirmationsCount,
  } = factors;

  // 1. Source trust (já é 0-1)
  const sourceScore = sourceTrust;

  // 2. User reports score (confirmações ponderadas por reputação)
  const confirmWeight = userConfirmWeights ?? userConfirms;
  const userScore = calculateUserReportScore(confirmWeight, userConfirms, userDenies, userResolved);

  // 3. AI confidence (se disponível, senão neutro)
  const aiScore = aiConfidence ?? 0.5;

  // 4. Source confirmations (se disponível, senão neutro)
  const sourceConfScore = sourceConfirmationsAvg !== undefined && sourceConfirmationsCount !== undefined
    ? calculateSourceConfirmationScore(sourceConfirmationsAvg, sourceConfirmationsCount)
    : 0.5;

  // Weighted average
  const weightedSum =
    sourceScore * WEIGHTS.sourceTrust +
    userScore * WEIGHTS.userReports +
    aiScore * WEIGHTS.aiConfidence +
    sourceConfScore * WEIGHTS.sourceConfirmations;

  // Clamp to 0-1 with 3 decimal precision
  return Math.round(Math.max(0, Math.min(1, weightedSum)) * 1000) / 1000;
}

/** Versão simplificada para uso rápido */
export function calculateSimpleConfidence(
  sourceTrust: number,
  confirms: number,
  denies: number,
  resolved: number = 0,
  confirmWeights?: number
): number {
  return calculateIncidentConfidence({
    sourceTrust,
    userConfirms: confirms,
    userConfirmWeights: confirmWeights,
    userDenies: denies,
    userResolved: resolved,
  });
}

/** Converte score 0-1 para label e cor */
export function getConfidenceLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.8) return { label: 'Muito Alta', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/30' };
  if (score >= 0.6) return { label: 'Alta', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' };
  if (score >= 0.4) return { label: 'Média', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/20' };
  if (score >= 0.2) return { label: 'Baixa', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/20' };
  return { label: 'Muito Baixa', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30' };
}

/** Formata score como porcentagem */
export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}