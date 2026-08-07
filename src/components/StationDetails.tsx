import { useState } from 'react';
import type { ReactNode } from 'react';
import { X, Copy, Info, ChevronDown, ChevronUp, AlertTriangle, Clock, MapPin, Shield, Activity, Users, CheckCircle2, XCircle, ShieldCheck, Loader2, MessageSquare, CheckCircle, XCircle as XCircleIcon, Shield as ShieldIcon, Edit3 } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, AreaChart, Area, CartesianGrid, YAxis } from 'recharts';
import { Incident, ReportCounts, TimelineItem, ReportType, HourlyFrequencyData, ConfidenceDetails } from '../types/Incident';
import { useIncidentReports, getReportTypeLabel as getReportTypeLabelFn, getReportTypeStyle as getReportTypeStyleFn, formatRelativeTime as formatRelativeTimeFn } from '../hooks/useIncidentReports';
import { motion, AnimatePresence } from 'motion/react';

const severityData = Array.from({ length: 24 }).map((_, i) => ({
  time: `${i}:00`,
  value: 30 + Math.random() * 40 + (i > 15 ? 20 : 0)
}));

const reportActions: { type: ReportType; label: string; icon: ReactNode; description: string }[] = [
  { type: 'confirm', label: 'Confirmar ocorrência', icon: <CheckCircle2 size={16} />, description: 'Confirmo que este incidente está ocorrendo' },
  { type: 'resolved', label: 'Informar resolução', icon: <ShieldCheck size={16} />, description: 'O incidente foi resolvido/normalizado' },
  { type: 'deny', label: 'Negar ocorrência', icon: <XCircle size={16} />, description: 'Este incidente não está ocorrendo/é falso' },
];

export default function StationDetails({ incident, onClose, isAuthenticated, onRequireAuth }: { incident: Incident, onClose: () => void, isAuthenticated?: boolean, onRequireAuth?: () => void }) {
  const [activeTab, setActiveTab] = useState('Detalhes');
  const [reportModal, setReportModal] = useState<{ type: ReportType | null; comment: string }>({ type: null, comment: '' });
  
  const { 
    counts, 
    timeline, 
    hourlyFrequency,
    confidence,
    isLoading, 
    isSubmitting, 
    submitReport, 
    refresh,
    refreshConfidence
  } = useIncidentReports(incident.id);

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

  const openReportModal = (type: ReportType) => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    setReportModal({ type, comment: '' });
  };

  const closeReportModal = () => {
    setReportModal({ type: null, comment: '' });
  };

  const handleReportSubmit = async () => {
    if (!reportModal.type) return;
    await submitReport(reportModal.type, reportModal.comment || undefined);
    closeReportModal();
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
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Report Counters - Inline style like action buttons */}
        <ReportCounters counts={counts} />

        {/* Confidence Display */}
        <ConfidenceDisplay confidence={confidence} onRefresh={refreshConfidence} />

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
          onReportClick={openReportModal}
          hourlyFrequency={hourlyFrequency}
        />}
        {activeTab === 'Linha do Tempo' && <TimelineTab 
          timeline={timeline} 
          isLoading={isLoading} 
          onRefresh={refresh}
        />}
        {activeTab === 'Recursos' && <ResourcesTab />}
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {reportModal.type && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={closeReportModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {reportActions.find(a => a.type === reportModal.type)?.label}
                </h3>
                <button 
                  onClick={closeReportModal}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-sm text-gray-500 dark:text-[#888888] mb-4">
                {reportActions.find(a => a.type === reportModal.type)?.description}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportCounters({ counts }: { counts: ReportCounts }) {
  const counterStyles = [
    { key: 'confirm' as keyof ReportCounts, label: 'Confirmam', icon: <CheckCircle size={14} />, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-900/30' },
    { key: 'deny' as keyof ReportCounts, label: 'Negam', icon: <XCircleIcon size={14} />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-900/30' },
    { key: 'resolved' as keyof ReportCounts, label: 'Resolvem', icon: <ShieldIcon size={14} />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-900/30' },
    { key: 'total' as keyof ReportCounts, label: 'Total', icon: <MessageSquare size={14} />, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/20', border: 'border-gray-200 dark:border-gray-700' },
  ];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {counterStyles.map(({ key, label, icon, color, bg, border }) => (
        <button
          key={key}
          type="button"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${border} ${bg} ${color} hover:opacity-80 transition-opacity text-sm`}
          disabled
          aria-label={`${counts[key]} ${label}`}
        >
          <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
          <span className="font-medium">{counts[key]}</span>
          <span className="text-xs opacity-70">{label}</span>
        </button>
      ))}
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

function DetailsTab({ incident, translateSeverity, onReportClick, hourlyFrequency }: { incident: Incident, translateSeverity: (s: string) => string, onReportClick: (type: ReportType) => void, hourlyFrequency: HourlyFrequencyData[] }) {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 dark:bg-[#3A1D1D] border border-red-200 dark:border-[#4A2525] rounded-lg p-3 flex items-start gap-3 text-red-700 dark:text-[#E54D4D] text-sm">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">{incident.title}</span>
          <span className="opacity-90">{incident.description}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Frequência de Relatos (últimas 24h)</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        <div className="h-[140px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyFrequency} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="count" fill="#EF4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 dark:text-[#666666] mt-2">
            <span>{hourlyFrequency[0]?.label || '-24h'}</span>
            <span>{hourlyFrequency[23]?.label || 'Agora'}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Informações do Incidente</h3>
        <div className="space-y-4">
          <DetailRow label="Tipo" value={incident.type} />
          <DetailRow label="Fonte" value="OSINT / Twitter" />
          <DetailRow label="Status" value={<span className="text-red-600 dark:text-[#EF4444] flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-[#EF4444] animate-pulse"></div>{incident.status}</span>} />
          <DetailRow label="ID" value={<div className="flex items-center justify-between w-full"><span>{incident.id}</span><Copy size={14} className="text-gray-400 dark:text-[#666666] cursor-pointer hover:text-black dark:hover:text-white transition-colors" /></div>} hasInfo />
          <DetailRow label="Severidade" value={translateSeverity(incident.severity)} />
          <DetailRow label="Reportado" value={<span className="flex items-center gap-1.5"><Clock size={14} /> {incident.time}</span>} hasInfo />
          <DetailRow label="Impacto" value={`${incident.radius}m de raio`} />
        </div>
      </div>

      {/* Report Actions */}
      <div className="pt-4 border-t border-gray-200 dark:border-[#2C2C2C]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-3 uppercase">Ações</h3>
        <div className="flex flex-wrap gap-2">
          {reportActions.map((action) => (
            <button
              key={action.type}
              onClick={() => onReportClick(action.type)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#262626] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors text-sm"
            >
              <span className="w-5 h-5 flex items-center justify-center">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
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

function TimelineTab({ timeline, isLoading, onRefresh }: { timeline: TimelineItem[]; isLoading: boolean; onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Tendência de Severidade</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        <div className="h-[140px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={severityData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSeverity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-[#2C2C2C]" />
              <YAxis orientation="right" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorSeverity)" />
            </AreaChart>
          </ResponsiveContainer>
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
              <UnifiedTimelineItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UnifiedTimelineItem({ item, key }: { item: TimelineItem; key?: string }) {
  const isUserReport = item.type === 'user_report';
  const style = isUserReport && item.report_type ? getReportTypeStyleFn(item.report_type) : { bg: 'bg-gray-100 dark:bg-[#2A2A2A]', text: 'text-gray-700 dark:text-gray-300', icon: '•' };
  const timeAgo = formatRelativeTimeFn(new Date(item.created_at).getTime());
  
  const sourceLabel = isUserReport 
    ? (item.user_id ? `Usuário ${item.user_id.slice(0, 8)}...` : 'Comunidade')
    : 'Sistema';

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
              <span className="text-[10px] text-gray-400 dark:text-[#666666] whitespace-nowrap">{sourceLabel}</span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-[#666666] whitespace-nowrap">{timeAgo}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-[#CCCCCC] mt-1">{item.description}</p>
          {item.comment && isUserReport && (
            <p className="text-sm text-gray-500 dark:text-[#888888] mt-1 italic">"{item.comment}"</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesTab() {
  return (
    <div className="space-y-6">
      <div className="text-center py-12 text-gray-500 dark:text-[#888888]">
        <Shield size={48} className="mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Recursos</h3>
        <p className="text-sm">Em breve: recursos de emergência, contatos úteis, rotas de evacuação.</p>
      </div>
    </div>
  );
}