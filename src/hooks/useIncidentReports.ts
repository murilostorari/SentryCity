import { useState, useEffect, useCallback } from 'react';
import { 
  fetchIncidentReports, 
  createIncidentReport, 
  getReportCounts, 
  fetchUnifiedTimeline,
  fetchHourlyFrequency,
  fetchIncidentConfidence,
  recalculateConfidence,
  getReportTypeLabel,
  getReportTypeStyle,
  formatRelativeTime,
  IncidentReportRow,
  ReportCounts,
  TimelineItem,
  HourlyFrequencyData,
  ConfidenceDetails,
  CreateIncidentReportInput
} from '../services/incidentReports';
import { useToast } from '../components/Toast';

export function useIncidentReports(incidentId: string | null) {
  const [reports, setReports] = useState<IncidentReportRow[]>([]);
  const [counts, setCounts] = useState<ReportCounts>({ confirm: 0, deny: 0, resolved: 0, update: 0, total: 0 });
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [hourlyFrequency, setHourlyFrequency] = useState<HourlyFrequencyData[]>([]);
  const [confidence, setConfidence] = useState<ConfidenceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { success, error: showError } = useToast();

  const refresh = useCallback(async () => {
    if (!incidentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [reportsData, countsData, timelineData, frequencyData, confidenceData] = await Promise.all([
        fetchIncidentReports(incidentId),
        getReportCounts(incidentId),
        fetchUnifiedTimeline(incidentId),
        fetchHourlyFrequency(incidentId),
        fetchIncidentConfidence(incidentId),
      ]);
      setReports(reportsData);
      setCounts(countsData);
      setTimeline(timelineData);
      setHourlyFrequency(frequencyData);
      setConfidence(confidenceData);
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao carregar relatos.');
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitReport = async (type: CreateIncidentReportInput['type'], comment?: string): Promise<IncidentReportRow | null> => {
    if (!incidentId) return null;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createIncidentReport({ incident_id: incidentId, type, comment });
      // Atualiza estado local imediatamente
      setReports(prev => [created, ...prev]);
      setCounts(prev => ({ ...prev, [type]: prev[type] + 1, total: prev.total + 1 }));
      // Adiciona na timeline unificada
      const timelineItem: TimelineItem = {
        id: created.id,
        type: 'user_report',
        event_type: created.type,
        description: `${getReportTypeLabel(created.type)}${created.comment ? `: ${created.comment}` : ''}`,
        created_at: created.created_at,
        report_type: created.type,
        comment: created.comment,
        user_id: created.user_id,
      };
      setTimeline(prev => [timelineItem, ...prev]);
      // Atualizar confiança após envio
      try {
        const newConfidence = await recalculateConfidence(incidentId);
        setConfidence(prev => prev ? { ...prev, score: newConfidence, percentage: Math.round(newConfidence * 100) } : null);
      } catch {
        // Ignore confidence recalc errors
      }
      
      // Toast de sucesso
      const labels: Record<string, string> = {
        confirm: 'Ocorrência confirmada',
        deny: 'Ocorrência negada',
        resolved: 'Resolução informada',
        update: 'Atualização enviada',
      };
      success(labels[type] || 'Relato enviado');
      
      return created;
    } catch (err: any) {
      // Tratar erro de constraint única (usuário já fez esse tipo de relato)
      if (err?.code === '23505' || err?.details?.includes?.('incident_reports_unique_user_type')) {
        showError('Duplicado', 'Você já enviou este tipo de relato para este incidente.');
      } else {
        showError('Erro', err?.message ?? 'Falha ao enviar relato.');
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshConfidence = useCallback(async () => {
    if (!incidentId) return;
    try {
      const confidenceData = await fetchIncidentConfidence(incidentId);
      setConfidence(confidenceData);
    } catch (err) {
      console.error('refreshConfidence falhou:', err);
    }
  }, [incidentId]);

  return {
    reports,
    counts,
    timeline,
    hourlyFrequency,
    confidence,
    isLoading,
    isSubmitting,
    error,
    submitReport,
    refresh,
    refreshConfidence,
  };
}

// Re-export para conveniência
export { getReportTypeLabel, getReportTypeStyle, formatRelativeTime } from '../services/incidentReports';
export type { ReportType, IncidentReportRow, ReportCounts, TimelineItem, HourlyFrequencyData, ConfidenceDetails, CreateIncidentReportInput } from '../services/incidentReports';

// Re-export functions for use in components
export { getReportTypeLabel as getReportTypeLabelFn, getReportTypeStyle as getReportTypeStyleFn, formatRelativeTime as formatRelativeTimeFn } from '../services/incidentReports';