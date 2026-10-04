import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { X, Info, Clock, MapPin, Shield, Activity, CheckCircle2, XCircle, ShieldCheck, Loader2, MessageSquare, CheckCircle, RefreshCw, Bot } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { Incident, ReportCounts, TimelineItem, ReportType, HourlyFrequencyData, ConfidenceDetails } from '../types/Incident';
import { useIncidentReports, getReportTypeLabel as getReportTypeLabelFn, getReportTypeStyle as getReportTypeStyleFn, formatRelativeTime as formatRelativeTimeFn } from '../hooks/useIncidentReports';
import { getHoursUntilAutoResolve, getAutoResolveDeadline, getAutoResolveHours, bumpIncidentActivity } from '../services/incidents';
import ResponsiveModal from './ResponsiveModal';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types/Profile';

const reportActions: { type: ReportType; label: string; icon: ReactNode; description: string }[] = [
  { type: 'confirm', label: 'Confirmar ocorrência', icon: <CheckCircle2 size={16} />, description: 'Confirmo que este incidente está ocorrendo' },
  { type: 'resolved', label: 'Informar resolução', icon: <ShieldCheck size={16} />, description: 'O incidente foi resolvido/normalizado' },
  { type: 'deny', label: 'Negar ocorrência', icon: <XCircle size={16} />, description: 'Este incidente não está ocorrendo/é falso' },
];

const REPORT_TYPE_COLORS: Record<string, string> = {
  confirm: '#10B981',
  deny: '#EF4444',
  resolved: '#3B82F6',
  update: '#F59E0B',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  confirm: 'Confirmam',
  deny: 'Negam',
  resolved: 'Resolvem',
  update: 'Atualizam',
};

function ChartContainer({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={100}>
      {ready ? children : <div />}
    </ResponsiveContainer>
  );
}

export default function StationDetails({ 
  incident, 
  onClose, 
  isAuthenticated, 
  onRequireAuth,
  user,
  profile
}: { 
  incident: Incident, 
  onClose: () => void, 
  isAuthenticated?: boolean, 
  onRequireAuth?: () => void,
  user?: User | null,
  profile?: Profile | null
}) {
  const [activeTab, setActiveTab] = useState('Detalhes');
  const [reportModal, setReportModal] = useState<{ type: ReportType | null; comment: string }>({ type: null, comment: '' });
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // Mantido após o fechamento para o conteúdo não sumir durante a animação de saída.
  const [lastReportType, setLastReportType] = useState<ReportType | null>(null);
  const [isBumping, setIsBumping] = useState(false);
  const [bumpError, setBumpError] = useState<string | null>(null);
  const [bumpSuccess, setBumpSuccess] = useState(false);
  const [countdown, setCountdown] = useState<{ label: string; ms: number } | null>(null);

  const { 
    counts, 
    timeline, 
    hourlyFrequency,
    confidence,
    reports,
    isLoading, 
    isSubmitting, 
    submitReport, 
    refresh, 
    refreshConfidence
  } = useIncidentReports(incident.id);

  // Última atividade = criação ou relato mais recente (espelha o auto-resolve do banco)
  const lastActivityMs = reports.length
    ? Math.max(incident.timestamp, ...reports.map(r => new Date(r.created_at).getTime()))
    : incident.timestamp;

  useEffect(() => {
    const updateCountdown = () => {
      if (incident.status === 'resolved' && incident.expiresAt) {
        const ms = incident.expiresAt - Date.now();
        if (ms > 0) {
          setCountdown({ label: 'Sai do mapa em', ms });
        } else {
          setCountdown(null);
        }
        return;
      }
      if (incident.status === 'active' || incident.status === 'pending') {
        const ms = (getAutoResolveDeadline(incident, lastActivityMs) ?? 0) - Date.now();
        if (ms > 0 && getHoursUntilAutoResolve(incident, lastActivityMs) > 0) {
          setCountdown({ label: 'Auto-resolve em', ms });
        } else {
          setCountdown(null);
        }
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, [incident.id, incident.status, incident.timestamp, incident.expiresAt, lastActivityMs]);

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return '0h 0m';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  };

  const translateSeverity = (sev: string) => {
    switch(sev) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return sev;
    }
  };

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D]';
      case 'high': return 'bg-orange-100 dark:bg-[#3A2D1D] text-orange-600 dark:text-[#F97316]';
      case 'medium': return 'bg-yellow-100 dark:bg-[#3A351D] text-yellow-600 dark:text-[#F59E0B]';
      case 'low': return 'bg-green-100 dark:bg-[#1D3A2D] text-green-600 dark:text-[#10B981]';
      default: return 'bg-gray-100 dark:bg-[#2A2A2A] text-gray-600 dark:text-[#888888]';
    }
  };

  const translateType = (t: string) => {
    switch(t) {
      case 'accident': return 'Acidente';
      case 'traffic_accident': return 'Acidente de Trânsito';
      case 'motorcycle_accident': return 'Acidente de Moto';
      case 'power': return 'Energia';
      case 'power_outage': return 'Falta de Energia';
      case 'weather': return 'Clima';
      case 'flood': return 'Alagamento/Enchente';
      case 'fire': return 'Incêndio';
      case 'pothole': return 'Buraco na Via';
      case 'infrastructure_damage': return 'Dano na Infraestrutura';
      case 'road_closure': return 'Fechamento de Via';
      case 'show': return 'Show/Concerto';
      case 'party': return 'Festa/Evento';
      case 'noise': return 'Barulho/Reclamação';
      case 'inauguration': return 'Inauguração';
      case 'violence': return 'Violência';
      case 'other': return 'Outro';
      default: return t;
    }
  };

  const translateStatus = (s: string) => {
    switch(s) {
      case 'active': return 'Ativo';
      case 'pending': return 'Pendente';
      case 'resolved': return 'Resolvido';
      case 'dismissed': return 'Descartado';
      default: return s;
    }
  };

  const getSeverityTextColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'text-red-600 dark:text-[#EF4444]';
      case 'high': return 'text-orange-600 dark:text-[#F97316]';
      case 'medium': return 'text-yellow-600 dark:text-[#F59E0B]';
      case 'low': return 'text-green-600 dark:text-[#10B981]';
      default: return 'text-gray-600 dark:text-[#888888]';
    }
  };

  const getSeverityDotColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'bg-red-600 dark:bg-[#EF4444]';
      case 'high': return 'bg-orange-600 dark:bg-[#F97316]';
      case 'medium': return 'bg-yellow-600 dark:bg-[#F59E0B]';
      case 'low': return 'bg-green-600 dark:bg-[#10B981]';
      default: return 'bg-gray-600 dark:bg-[#888888]';
    }
  };

  const isCreator = user && incident.created_by && user.id === incident.created_by;

  const openReportModal = (type: ReportType) => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    if (isCreator && (type === 'confirm' || type === 'deny')) {
      // Criador não pode confirmar nem negar o próprio incidente
      return;
    }
    // Cada ação é única por usuário por incidente (bloqueio extra no banco)
    if (reports.some(r => r.user_id === user?.id && r.type === type)) {
      return;
    }
    setReportModal({ type, comment: '' });
    setLastReportType(type);
    setReportModalOpen(true);
  };

  const closeReportModal = () => {
    setReportModalOpen(false);
  };

  const handleReportSubmit = async () => {
    if (!reportModal.type) return;
    const created = await submitReport(reportModal.type, reportModal.comment || undefined);
    if (created) closeReportModal();
  };

  const handleBumpActivity = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    setIsBumping(true);
    setBumpError(null);
    setBumpSuccess(false);
    try {
      await bumpIncidentActivity(incident.id);
      setBumpSuccess(true);
      setBumpError(null);
      refresh();
      setTimeout(() => setBumpSuccess(false), 3000);
    } catch (err: any) {
      setBumpError(err?.message ?? 'Falha ao confirmar presença.');
    } finally {
      setIsBumping(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-xl shadow-2xl h-full flex flex-col overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white truncate">{incident.title}</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${getSeverityColor(incident.severity)} shrink-0`}>
                {translateSeverity(incident.severity)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-[#888888] text-sm min-w-0">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{incident.address || `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}`}</span>
            </div>

            {incident.status === 'resolved' && countdown && countdown.ms > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#888888]">
                <Clock size={12} />
                <span>{countdown.label}: {formatCountdown(countdown.ms)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-200 dark:border-[#2C2C2C]">
          <Tab label="Detalhes" active={activeTab === 'Detalhes'} onClick={() => setActiveTab('Detalhes')} />
          <Tab label="Linha do Tempo" active={activeTab === 'Linha do Tempo'} badge="Novo" onClick={() => setActiveTab('Linha do Tempo')} />
          <Tab label="Recursos" active={activeTab === 'Recursos'} onClick={() => setActiveTab('Recursos')} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
        {activeTab === 'Detalhes' && <DetailsTab 
          incident={incident} 
          translateSeverity={translateSeverity} 
          translateType={translateType}
          translateStatus={translateStatus}
          getSeverityTextColor={getSeverityTextColor}
          getSeverityDotColor={getSeverityDotColor}
          hourlyFrequency={hourlyFrequency}
        />}
        {activeTab === 'Linha do Tempo' && <TimelineTab 
          timeline={timeline} 
          counts={counts}
          isLoading={isLoading} 
          onRefresh={refresh}
          currentUserId={user?.id ?? null}
          currentUserName={profile?.name ?? null}
        />}
        {activeTab === 'Recursos' && <ResourcesTab
          incident={incident}
          confidence={confidence}
          onRefreshConfidence={refreshConfidence}
          onReportClick={openReportModal}
          isCreator={isCreator}
          reports={reports}
          currentUserId={user?.id ?? null}
          countdown={countdown}
          onBump={handleBumpActivity}
          isBumping={isBumping}
          bumpSuccess={bumpSuccess}
          bumpError={bumpError}
          formatCountdown={formatCountdown}
          lastActivityMs={lastActivityMs}
        />}
      </div>

      {/* Report Modal (bottom sheet no mobile/tablet via portal) */}
      <ResponsiveModal
        isOpen={reportModalOpen}
        onClose={closeReportModal}
        className="max-w-md"
      >
        <div className="overflow-y-auto p-6 no-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {reportActions.find(a => a.type === lastReportType)?.label}
            </h3>
            <button 
              onClick={closeReportModal}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-sm text-gray-500 dark:text-[#888888] mb-4">
            {reportActions.find(a => a.type === lastReportType)?.description}
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Comentário (opcional)
            </label>
            <textarea
              value={reportModal.comment}
              onChange={(e) => setReportModal(prev => ({ ...prev, comment: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-[#2C2C2C] border-gray-300 dark:border-[#444] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white transition-colors"
              placeholder="Adicione detalhes adicionais..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={closeReportModal}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-[#2A2A2A] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleReportSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
              {isSubmitting ? 'Enviando...' : 'Enviar Relato'}
            </button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function ConfidenceDisplay({ confidence, onRefresh }: { confidence: ConfidenceDetails | null; onRefresh: () => void }) {
  if (!confidence) return null;

  return (
    <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border bg-white dark:bg-[#262626] transition-colors">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${confidence.bg} ${confidence.color}`}>
        {confidence.percentage}%
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-sm ${confidence.color}`}>Confiança: {confidence.label}</span>
          <button
            onClick={onRefresh}
            className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
            title="Recalcular"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Atualizar
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Fonte: {Math.round(confidence.factors.sourceTrust * 100)}%</span>
          <span>✓ {confidence.factors.userConfirms}</span>
          <span>✕ {confidence.factors.userDenies}</span>
          <span>✓R {confidence.factors.userResolved}</span>
          <span>Peso: {confidence.factors.userConfirmWeights.toFixed(1)}</span>
          {confidence.factors.aiConfidence !== undefined && (
            <span>IA: {Math.round(confidence.factors.aiConfidence * 100)}%</span>
          )}
          {confidence.factors.sourceConfirmationsCount && confidence.factors.sourceConfirmationsCount > 0 && (
            <span>Fontes: {confidence.factors.sourceConfirmationsCount} (avg {Math.round((confidence.factors.sourceConfirmationsAvg || 0) * 100)}%)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Tab({ label, active, badge, onClick }: any) {
  return (
    <button 
      className={`pb-3 text-sm font-medium relative flex items-center gap-2 transition-colors ${active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#888888] hover:text-gray-700 dark:hover:text-[#CCCCCC]'}`}
      onClick={onClick}
    >
      {label}
      {badge && (
        <span className="bg-blue-100 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white rounded-t-full"></div>
      )}
    </button>
  );
}

/** Agrupa as 24 horas em 8 buckets de 3h (mais antigo → agora). */
function buildFreqBuckets(hourlyFrequency: HourlyFrequencyData[]) {
  const buckets = Array.from({ length: 8 }, (_, b) => ({
    label: `${hourlyFrequency[b * 3]?.hour ?? 0}h`,
    count: 0,
    confirm: 0,
    deny: 0,
    resolved: 0,
    update: 0,
  }));
  hourlyFrequency.forEach((h, i) => {
    const b = Math.floor(i / 3);
    if (b >= 8) return;
    buckets[b].count += h.count;
    buckets[b].confirm += h.confirm;
    buckets[b].deny += h.deny;
    buckets[b].resolved += h.resolved;
    buckets[b].update += h.update;
  });
  return buckets;
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500 dark:text-[#888888]">
      {(['confirm', 'deny', 'resolved', 'update'] as const).map(key => (
        <span key={key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REPORT_TYPE_COLORS[key] }} />
          {REPORT_TYPE_LABELS[key]}
        </span>
      ))}
    </div>
  );
}

function DetailsTab({ 
  incident, 
  translateSeverity, 
  translateType,
  translateStatus,
  getSeverityTextColor,
  getSeverityDotColor,
  hourlyFrequency
}: { 
  incident: Incident, 
  translateSeverity: (s: string) => string, 
  translateType: (s: string) => string,
  translateStatus: (s: string) => string,
  getSeverityTextColor: (s: string) => string,
  getSeverityDotColor: (s: string) => string,
  hourlyFrequency: HourlyFrequencyData[]
}) {
  const freqBuckets = buildFreqBuckets(hourlyFrequency);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{incident.title}</h3>
        <p className="text-gray-600 dark:text-[#AAAAAA] leading-relaxed">{incident.description}</p>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Frequência de Relatos (últimas 24h)</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        <div className="h-[160px] w-full">
          <ChartContainer>
            <BarChart data={freqBuckets} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(value: number, name: string) => [value, REPORT_TYPE_LABELS[name] ?? name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
              />
              <Bar dataKey="confirm" stackId="a" fill={REPORT_TYPE_COLORS.confirm} />
              <Bar dataKey="deny" stackId="a" fill={REPORT_TYPE_COLORS.deny} />
              <Bar dataKey="resolved" stackId="a" fill={REPORT_TYPE_COLORS.resolved} />
              <Bar dataKey="update" stackId="a" fill={REPORT_TYPE_COLORS.update} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
        <ChartLegend />
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Informações do Incidente</h3>
        <div className="space-y-4">
          <DetailRow label="Tipo" value={translateType(incident.type)} />
          <DetailRow label="Fonte" value={(() => {
            const primary = (incident.source || '').split(' | ')[0].trim() || incident.news?.[0]?.source || 'Manual';
            const extraCount = new Set((incident.news || []).map(n => n.source).filter(s => s && s !== primary)).size;
            return extraCount > 0 ? `${primary} +${extraCount}` : primary;
          })()} />
          <DetailRow label="Status" value={<span className={`${getSeverityTextColor(incident.severity)} flex items-center gap-1.5`}><div className={`w-1.5 h-1.5 rounded-full ${getSeverityDotColor(incident.severity)} animate-pulse`}></div>{translateStatus(incident.status)}</span>} />
          <DetailRow label="Severidade" value={translateSeverity(incident.severity)} />
          <DetailRow label="Reportado" value={<span className="flex items-center gap-1.5"><Clock size={14} /> {incident.time}</span>} hasInfo />
          <DetailRow label="Impacto" value={`${incident.radius}m de raio`} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, hasInfo }: any) {
  return (
    <div className="flex items-start justify-between text-sm">
      <div className="text-gray-500 dark:text-[#888888] flex items-center gap-1.5 w-1/3">
        {label}
        {hasInfo && <Info size={12} className="text-gray-400 dark:text-[#444444]" />}
      </div>
      <div className="text-gray-900 dark:text-white w-2/3 text-right flex justify-end capitalize">{value}</div>
    </div>
  );
}

/** Série acumulada (confirmações × negações) a partir dos relatos reais da timeline. */
function buildConfirmTrend(timeline: TimelineItem[]) {
  const asc = timeline
    .filter(t => t.type === 'user_report' && (t.report_type === 'confirm' || t.report_type === 'deny'))
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let confirm = 0;
  let deny = 0;
  return asc.map(t => {
    if (t.report_type === 'confirm') confirm++;
    else deny++;
    return {
      time: new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      confirm,
      deny,
    };
  });
}

function TimelineTab({ timeline, counts, isLoading, onRefresh, currentUserId, currentUserName }: {
  timeline: TimelineItem[];
  counts: ReportCounts;
  isLoading: boolean;
  onRefresh: () => void;
  currentUserId: string | null;
  currentUserName: string | null;
}) {
  const trend = buildConfirmTrend(timeline);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Relatos da Comunidade</h3>
        <div className="space-y-4">
          <DetailRow label="Confirmam" value={counts.confirm} />
          <DetailRow label="Negam" value={counts.deny} />
          <DetailRow label="Resolvem" value={counts.resolved} />
          <DetailRow label="Total" value={counts.total} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Tendência de Confirmações</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        {trend.length < 2 ? (
          <div className="h-[140px] flex items-center justify-center text-xs text-gray-400 dark:text-[#666666] border border-dashed border-gray-200 dark:border-[#2C2C2C] rounded-lg">
            Dados insuficientes — pelo menos 2 relatos da comunidade são necessários.
          </div>
        ) : (
          <div className="h-[160px] w-full">
            <ChartContainer>
              <LineChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="time" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  formatter={(value: number, name: string) => [value, name === 'confirm' ? 'Confirmam (acum.)' : 'Negam (acum.)']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                />
                <Line type="monotone" dataKey="confirm" stroke={REPORT_TYPE_COLORS.confirm} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deny" stroke={REPORT_TYPE_COLORS.deny} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500 dark:text-[#888888]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REPORT_TYPE_COLORS.confirm }} />Confirmam (acum.)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REPORT_TYPE_COLORS.deny }} />Negam (acum.)</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#2C2C2C] pb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors text-sm"
          >
            <Activity size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Timeline Unificada</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500 dark:text-[#888888]">
            <Activity size={24} className="animate-spin mr-2" />
            Carregando timeline...
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-[#888888]">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum evento na timeline</p>
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((item) => (
              <UnifiedTimelineItem
                key={item.id}
                item={item}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CRAWLER_COMMENT_RE = /^(?:Notícia relacionada via crawler|Via crawler):\s*(.*)$/i;

function UnifiedTimelineItem({ item, key, currentUserId, currentUserName }: {
  item: TimelineItem;
  key?: string;
  currentUserId: string | null;
  currentUserName: string | null;
}) {
  const isUserReport = item.type === 'user_report';
  const style = isUserReport && item.report_type ? getReportTypeStyleFn(item.report_type) : { bg: 'bg-gray-100 dark:bg-[#2A2A2A]', text: 'text-gray-700 dark:text-gray-300', icon: '•' };
  const timeAgo = formatRelativeTimeFn(new Date(item.created_at).getTime());

  const crawlerMatch = isUserReport && item.comment ? item.comment.match(CRAWLER_COMMENT_RE) : null;
  const isCrawler = isUserReport && !item.user_id && !!item.comment && /crawler/i.test(item.comment);

  let sourceLabel = 'Sistema';
  if (isUserReport) {
    if (isCrawler) sourceLabel = 'Crawler/IA';
    else if (item.user_id) {
      const name = item.user_name
        ?? (item.user_id === currentUserId ? currentUserName : null)
        ?? null;
      sourceLabel = name || 'Usuário';
    }
  }

  const strippedComment = crawlerMatch ? crawlerMatch[1] : (item.comment || null);

  return (
    <div className={`bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${style.bg}`}>
          <span className={`text-sm font-bold ${style.text}`}>{style.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`text-xs font-bold ${style.text}`}>{isUserReport && item.report_type ? getReportTypeLabelFn(item.report_type) : item.event_type}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap ${isCrawler ? 'bg-blue-50 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6]' : 'text-gray-400 dark:text-[#666666]'}`}>
                {isCrawler && <Bot size={10} />}
                {sourceLabel}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-[#666666] whitespace-nowrap">{timeAgo}</span>
          </div>
          {isUserReport ? (
            isCrawler && strippedComment ? (
              <p className="text-sm text-gray-600 dark:text-[#CCCCCC] mt-1">Fonte: {strippedComment}</p>
            ) : strippedComment ? (
              <p className="text-sm text-gray-500 dark:text-[#888888] mt-1 italic">"{strippedComment}"</p>
            ) : null
          ) : (
            <p className="text-sm text-gray-600 dark:text-[#CCCCCC] mt-1">{item.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesTab({
  incident,
  confidence,
  onRefreshConfidence,
  onReportClick,
  isCreator,
  reports,
  currentUserId,
  countdown,
  onBump,
  isBumping,
  bumpSuccess,
  bumpError,
  formatCountdown,
  lastActivityMs,
}: {
  incident: Incident;
  confidence: ConfidenceDetails | null;
  onRefreshConfidence: () => void;
  onReportClick: (type: ReportType) => void;
  isCreator: boolean;
  reports: { type: ReportType; user_id: string | null }[];
  currentUserId: string | null;
  countdown: { label: string; ms: number } | null;
  onBump: () => void;
  isBumping: boolean;
  bumpSuccess: boolean;
  bumpError: string | null;
  formatCountdown: (ms: number) => string;
  lastActivityMs: number;
}) {
  const isActive = incident.status === 'active' || incident.status === 'pending';
  const autoResolveHours = getAutoResolveHours(incident.type);
  const lastActivity = new Date(lastActivityMs).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  // Ações que este usuário já usou neste incidente (uma única vez por ação)
  const myReportTypes = new Set(
    reports.filter(r => r.user_id && r.user_id === currentUserId).map(r => r.type),
  );

  return (
    <div className="space-y-6">
      <ConfidenceDisplay confidence={confidence} onRefresh={onRefreshConfidence} />

      {/* Report Actions */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-3 uppercase">Ações</h3>
        <div className="flex flex-wrap gap-2">
          {reportActions
            .filter((action) => !(isCreator && (action.type === 'confirm' || action.type === 'deny')))
            .map((action) => {
              const alreadySent = myReportTypes.has(action.type);
              return (
                <button
                  key={action.type}
                  onClick={() => onReportClick(action.type)}
                  disabled={alreadySent}
                  title={alreadySent ? 'Você já enviou esta ação para este incidente' : action.description}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#333] text-sm transition-colors ${
                    alreadySent
                      ? 'bg-gray-50 dark:bg-[#1E1E1E] text-gray-400 dark:text-[#666666] cursor-not-allowed'
                      : 'bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2C2C2C]'
                  }`}
                >
                  <span className="w-5 h-5 flex items-center justify-center">
                    {alreadySent ? <CheckCircle2 size={16} /> : action.icon}
                  </span>
                  <span>{alreadySent ? 'Enviado' : action.label}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Lifecycle: countdown + confirmar ativo */}
      {isActive && (
        <div className="border-t border-gray-200 dark:border-[#2C2C2C] pt-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider uppercase">Ciclo de Vida</h3>
          {countdown && countdown.ms > 0 ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Clock size={14} />
                <span>{countdown.label}: <strong>{formatCountdown(countdown.ms)}</strong></span>
              </div>
              {!isCreator && (
                <button
                  onClick={onBump}
                  disabled={isBumping}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center gap-1.5 transition-colors text-sm"
                  title="Confirmar que o incidente ainda está ativo"
                >
                  {isBumping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Confirmar ativo
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-[#888888] flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" /> Sem auto-resolve pendente</span>
              {!isCreator && (
                <button
                  onClick={onBump}
                  disabled={isBumping}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center gap-1.5 transition-colors text-sm"
                >
                  {isBumping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Confirmar ativo
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-[#888888] leading-relaxed">
            Resolve automaticamente após <strong>{autoResolveHours}h</strong> sem atividade
            (última atividade: {lastActivity}). Qualquer relato — inclusive confirmações do crawler — reinicia o timer.
          </p>
          {isCreator && (
            <p className="text-xs text-gray-400 dark:text-[#666666] leading-relaxed">
              Como criador, você pode apenas informar a resolução — confirmar/negar é exclusivo de outros membros da comunidade.
            </p>
          )}
          {bumpSuccess && (
            <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <CheckCircle size={12} />
              Atividade confirmada! Timer reiniciado.
            </div>
          )}
          {bumpError && <div className="text-xs text-red-500">{bumpError}</div>}
        </div>
      )}

      <div className="text-center py-8 text-gray-500 dark:text-[#888888] border-t border-gray-200 dark:border-[#2C2C2C] pt-6">
        <Shield size={40} className="mx-auto mb-3 opacity-50" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Mais recursos em breve</h3>
        <p className="text-xs">Recursos de emergência, contatos úteis, rotas de evacuação.</p>
      </div>
    </div>
  );
}