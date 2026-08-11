import React, { useState } from 'react';
import { X, Loader2, Sparkles, Newspaper, MapPin, Check, ChevronDown, FileText, Save, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ResponsiveModal from './ResponsiveModal';
import { ingestNewsText, confirmIngestion, NewsIngestionResult } from '../services/newsIngestion';
import { geocodeAddress } from '../services/geocoding';

interface NewsIngestionModalProps {
  onClose: () => void;
  onCreated: (incident: any) => void;
  isDarkMode: boolean;
}

const INCIDENT_TYPES = ['accident', 'power', 'weather', 'pothole', 'show', 'party', 'noise', 'inauguration', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const translateType = (t: string) => {
  switch (t) {
    case 'accident': return 'Acidente';
    case 'power': return 'Energia';
    case 'weather': return 'Clima';
    case 'pothole': return 'Buraco';
    case 'show': return 'Show/Concerto';
    case 'party': return 'Festa/Evento';
    case 'noise': return 'Barulho/Reclamação';
    case 'inauguration': return 'Inauguração';
    default: return 'Outro';
  }
};

const translateSeverity = (s: string) => {
  switch (s) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    default: return 'Baixo';
  }
};

const inputClass = (isDarkMode: boolean) =>
  `w-full px-3 py-2 rounded-lg border outline-none transition-colors ${
    isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'
  }`;

export default function NewsIngestionModal({ onClose, onCreated, isDarkMode }: NewsIngestionModalProps) {
  const [newsText, setNewsText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewsIngestionResult | null>(null);

  // Campos editáveis do preview
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isRegeocoding, setIsRegeocoding] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setError(null);
    setIsAnalyzing(true);
    try {
      const res = await ingestNewsText(newsText);
      setResult(res);
      setTitle(res.analysis.title);
      setDescription(res.analysis.title);
      setType(res.analysis.type);
      setSeverity(res.analysis.severity);
      setAddress(res.analysis.address || res.geocodeAddress || '');
      setCity(res.analysis.city);
      setState(res.analysis.state);
      setConfidence(res.analysis.confidence_score);
      setLat(res.lat);
      setLng(res.lng);
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao analisar a notícia.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRegeocode = async () => {
    setIsRegeocoding(true);
    setError(null);
    try {
      const query = [address, city, state].filter(Boolean).join(', ');
      const geo = await geocodeAddress(query);
      if (geo) {
        setLat(geo.lat);
        setLng(geo.lng);
        if (!address) setAddress(geo.displayName);
        if (!city) setCity(geo.city);
        if (!state) setState(geo.state);
      } else {
        setError('Não foi possível geocodificar o endereço. Verifique os dados.');
      }
    } finally {
      setIsRegeocoding(false);
    }
  };

  const handleConfirm = async () => {
    if (!result || lat == null || lng == null) {
      setError('É necessário localizar o endereço (lat/lng) antes de criar o incidente.');
      return;
    }
    setIsConfirming(true);
    setError(null);
    try {
      const created = await confirmIngestion({
        rawReportId: result.rawReportId,
        model: result.model,
        analysis: {
          title,
          type,
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          address,
          city,
          state,
          confidence_score: confidence,
        },
        lat,
        lng,
        address,
      });
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao criar o incidente.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    if (isAnalyzing || isConfirming) return;
    onClose();
  };

  return (
    <ResponsiveModal isOpen={true} onClose={handleClose} className="max-w-lg" isDarkMode={isDarkMode}>
      <div className={`flex items-center justify-between p-4 border-b shrink-0 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2">
          <Newspaper size={18} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
          <h2 className="text-lg font-semibold">Ingestão de Notícias</h2>
        </div>
        <button
          onClick={handleClose}
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1 no-scrollbar">
        {!result ? (
          <>
            <p className="text-sm opacity-70">
              Cole o texto de uma notícia. A IA extrai os dados do incidente e localiza o endereço antes de criar o registro.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Texto da notícia</label>
              <textarea
                value={newsText}
                onChange={(e) => setNewsText(e.target.value)}
                rows={8}
                className={`${inputClass(isDarkMode)} resize-none`}
                placeholder="Cole aqui o texto da notícia..."
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={handleClose}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'hover:bg-[#333]' : 'hover:bg-gray-100'}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || newsText.trim().length < 10}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isAnalyzing ? 'Analisando...' : 'Analisar notícia'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${isDarkMode ? 'bg-[#172554] text-blue-300' : 'bg-blue-50 text-blue-700'} border ${isDarkMode ? 'border-[#1E3A8A]' : 'border-blue-200'}`}>
              <FileText size={16} className="shrink-0 mt-0.5" />
              <span>Analisado com {result.model}. Revise os dados antes de confirmar.</span>
            </div>

            {!result.aiAnalyzed && (
              <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${isDarkMode ? 'bg-[#3A2D1D] text-amber-300' : 'bg-amber-50 text-amber-700'} border ${isDarkMode ? 'border-[#4A3A1D]' : 'border-amber-200'}`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>Análise por IA indisponível (chave não configurada). Preencha os campos manualmente.</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Título</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass(isDarkMode)} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Descrição</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass(isDarkMode)} resize-none`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium mb-1 opacity-70">Tipo</label>
                <button
                  type="button"
                  onClick={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] hover:bg-[#333]' : 'bg-white border-gray-300 hover:bg-gray-50'} transition-colors`}
                >
                  <span>{translateType(type)}</span>
                  <ChevronDown size={16} className={`transition-transform ${activeDropdown === 'type' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'type' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={`absolute top-full mt-2 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto no-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                    >
                      {INCIDENT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setType(t); setActiveDropdown(null); }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          <span>{translateType(t)}</span>
                          {type === t && <Check size={14} className="text-blue-500" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium mb-1 opacity-70">Severidade</label>
                <button
                  type="button"
                  onClick={() => setActiveDropdown(activeDropdown === 'severity' ? null : 'severity')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] hover:bg-[#333]' : 'bg-white border-gray-300 hover:bg-gray-50'} transition-colors`}
                >
                  <span>{translateSeverity(severity)}</span>
                  <ChevronDown size={16} className={`transition-transform ${activeDropdown === 'severity' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'severity' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={`absolute top-full mt-2 left-0 w-full rounded-lg shadow-xl p-1 z-[60] ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                    >
                      {SEVERITIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => { setSeverity(s); setActiveDropdown(null); }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md capitalize ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          <span>{translateSeverity(s)}</span>
                          {severity === s && <Check size={14} className="text-blue-500" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-sm font-medium mb-1 opacity-70">Cidade</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass(isDarkMode)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Estado</label>
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} className={inputClass(isDarkMode)} placeholder="SP" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Confiança (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(confidence * 100)}
                  onChange={(e) => setConfidence(Number(e.target.value) / 100)}
                  className={inputClass(isDarkMode)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Endereço</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass(isDarkMode)} placeholder="Rua, número, bairro..." />
            </div>

            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${lat != null && lng != null ? (isDarkMode ? 'bg-[#1D3A2D] border-[#4A2525] text-green-400' : 'bg-green-50 border-green-200 text-green-700') : (isDarkMode ? 'bg-[#3A2D1D] border-[#4A3A1D] text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
              <MapPin size={16} className="shrink-0" />
              {lat != null && lng != null ? (
                <span>Localizado: {lat.toFixed(5)}, {lng.toFixed(5)}</span>
              ) : (
                <span>Localização não encontrada. Revise o endereço e tente novamente.</span>
              )}
              <button
                onClick={handleRegeocode}
                disabled={isRegeocoding}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium transition-colors"
              >
                {isRegeocoding ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                Localizar
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={() => { setResult(null); setError(null); }}
                disabled={isConfirming}
                className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${isDarkMode ? 'hover:bg-[#333]' : 'hover:bg-gray-100'}`}
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
              >
                {isConfirming ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isConfirming ? 'Criando...' : 'Criar Incidente'}
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
