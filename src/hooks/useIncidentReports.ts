import { useState, useEffect, useCallback } from 'react';
import { 
  fetchIncidentReports, 
  createIncidentReport, 
  getReportCounts, 
  fetchUnifiedTimeline,
  getReportTypeLabel,
  getReportTypeStyle,
  formatRelativeTime,
  IncidentReportRow,
  ReportCounts,
  TimelineItem,
  CreateIncidentReportInput
} from '../services/incidentReports';

export function useIncidentReports(incidentId: string | null) {
  const [reports, setReports] = useState<IncidentReportRow[]>([]);
  const [counts, setCounts] = useState<ReportCounts>({ confirm: 0, deny: 0, resolved: 0, update: 0, total: 0 });
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!incidentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [reportsData, countsData, timelineData] = await Promise.all([
        fetchIncidentReports(incidentId),
        getReportCounts(incidentId),
        fetchUnifiedTimeline(incidentId),
      ]);
      setReports(reportsData);
      setCounts(countsData);
      setTimeline(timelineData);
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
      return created;
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao enviar relato.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    reports,
    counts,
    timeline,
    isLoading,
    isSubmitting,
    error,
    submitReport,
    refresh,
  };
}

// Re-export para conveniência
export { getReportTypeLabel, getReportTypeStyle, formatRelativeTime } from '../services/incidentReports';
export type { ReportType, IncidentReportRow, ReportCounts, TimelineItem, CreateIncidentReportInput } from '../services/incidentReports';

// Re-export functions for use in components
export { getReportTypeLabel as getReportTypeLabelFn, getReportTypeStyle as getReportTypeStyleFn, formatRelativeTime as formatRelativeTimeFn } from '../services/incidentReports';