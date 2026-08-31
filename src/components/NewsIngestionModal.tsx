import React, { useState } from 'react';
import { X, Loader2, Sparkles, Newspaper, MapPin, Check, ChevronDown, Save, AlertTriangle, RefreshCw, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ResponsiveModal from './ResponsiveModal';
import ModalTabs from './ModalTabs';
import { ingestNewsText, ingestNewsUrl, confirmIngestion, NewsIngestionResult } from '../services/newsIngestion';
import { geocodeAddress, fetchByCep } from '../services/geocoding';
import { buildGeocodeQuery, formatLocation, NewsLocation, LocationPrecision } from '../services/newsAnalysis';

interface NewsIngestionModalProps {
  isOpen: boolean;
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

const translatePrecision = (p: LocationPrecision) => {
  switch (p) {
    case 'exact': return 'Exato (rua + número)';
    case 'street': return 'Rua';
    case 'neighborhood': return 'Bairro';
    case 'city': return 'Cidade';
    case 'unknown': return 'Desconhecido';
    default: return p;
  }
};

const inputClass = (isDarkMode: boolean) =>
  `w-full px-3 py-2 rounded-lg border outline-none transition-colors ${
    isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'
  }`;

const formatCep = (v: string) => {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const emptyLoc = (): NewsLocation => ({
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  cross_street: '',
  reference: '',
});

type Tab = 'general' | 'address';

export default function NewsIngestionModal({ isOpen, onClose, onCreated, isDarkMode }: NewsIngestionModalProps) {
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text');
  const [newsText, setNewsText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewsIngestionResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isCepLoading, setIsCepLoading] = useState(false);
  const cepTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Campos editáveis do preview
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [confidence, setConfidence] = useState(0);
  const [source, setSource] = useState('');
  const [loc, setLoc] = useState<NewsLocation>(emptyLoc());
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationPrecision, setLocationPrecision] = useState<LocationPrecision>('unknown');
  const [isRegeocoding, setIsRegeocoding] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const setLocField = (field: keyof NewsLocation, value: string) =>
    setLoc((prev) => ({ ...prev, [field]: value }));

  const handleAnalyze = async () => {
    setError(null);
    setIsAnalyzing(true);
    try {
      const res = inputMode === 'url'
        ? await ingestNewsUrl(urlInput)
        : await ingestNewsText(newsText);
      setResult(res);
      setTitle(res.analysis.title);
      setDescription(res.analysis.description || res.analysis.title);
      setType(res.analysis.type);
      setSeverity(res.analysis.severity);
      setConfidence(res.analysis.confidence_score);
      setLocationPrecision(res.analysis.location_precision);
      setLoc(res.analysis.location);
      setLat(res.lat);
      setLng(res.lng);
      // Preenche fonte da URL automaticamente
      if (res.sourceName) setSource(res.sourceName);
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
      const query = buildGeocodeQuery(loc);
      const geo = await geocodeAddress(query, {
        expectedCity: loc.city || undefined,
        expectedState: loc.state || undefined,
      });
      if (geo) {
        setLat(geo.lat);
        setLng(geo.lng);
        if (!loc.zip_code && geo.zipCode) {
          setLoc((prev) => ({ ...prev, zip_code: geo.zipCode || '' }));
        }
      } else {
        setError('Não foi possível geocodificar o endereço. Verifique os dados.');
      }
    } finally {
      setIsRegeocoding(false);
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatCep(e.target.value);
    setLocField('zip_code', value);

    if (cepTimeout.current) clearTimeout(cepTimeout.current);
    if (value.replace(/\D/g, '').length === 8) {
      // Só chama a ViaCEP quando o CEP estiver completo (8 dígitos / padrão 00000-000).
      cepTimeout.current = setTimeout(async () => {
        setIsCepLoading(true);
        const data = await fetchByCep(value);
        if (data) {
          setLoc((prev) => ({
            ...prev,
            street: data.logradouro || prev.street,
            complement: data.complemento || prev.complement,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.localidade || prev.city,
            state: data.uf || prev.state,
          }));
        }
        setIsCepLoading(false);
      }, 400);
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
      const mergeResult = await confirmIngestion({
        rawReportId: result.rawReportId,
        model: result.model,
        source: source.trim() || undefined,
        analysis: {
          title,
          description,
          type,
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          confidence_score: confidence,
          location_precision: locationPrecision,
          location: loc,
        },
        lat,
        lng,
        address: formatLocation(loc),
      });
      onCreated(mergeResult);
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
    <ResponsiveModal isOpen={isOpen} onClose={handleClose} className="max-w-lg" isDarkMode={isDarkMode}>
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
              Cole o texto ou a URL de uma notícia. A IA extrai os dados do incidente e localiza o endereço.
            </p>

            {/* Toggle Texto / URL */}
            <div className={`flex rounded-lg border overflow-hidden ${isDarkMode ? 'border-[#444]' : 'border-gray-300'}`}>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'text'
                    ? 'bg-blue-600 text-white'
                    : isDarkMode ? 'bg-[#2C2C2C] text-[#888888] hover:bg-[#333]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Newspaper size={14} />
                Texto
              </button>
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                  inputMode === 'url'
                    ? 'bg-blue-600 text-white'
                    : isDarkMode ? 'bg-[#2C2C2C] text-[#888888] hover:bg-[#333]' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Link size={14} />
                URL
              </button>
            </div>

            {inputMode === 'text' ? (
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
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">URL da notícia</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className={inputClass(isDarkMode)}
                  placeholder="https://g1.globo.com/..."
                />
              </div>
            )}
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
                disabled={isAnalyzing || (inputMode === 'text' ? newsText.trim().length < 10 : !urlInput.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isAnalyzing ? 'Analisando...' : 'Analisar notícia'}
              </button>
            </div>
          </>
        ) : (
          <>
            {!result.aiAnalyzed && (
              <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${isDarkMode ? 'bg-[#3A2D1D] text-amber-300' : 'bg-amber-50 text-amber-700'} border ${isDarkMode ? 'border-[#4A3A1D]' : 'border-amber-200'}`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>Análise por IA indisponível (chave não configurada). Preencha os campos manualmente.</span>
              </div>
            )}

            {/* Status da localização (discreto) */}
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${lat != null && lng != null ? (isDarkMode ? 'bg-[#0F1F17] border-[#1E4D35] text-green-400' : 'bg-green-50 border-green-200 text-green-700') : (isDarkMode ? 'bg-[#3A2D1D] border-[#4A3A1D] text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
              <MapPin size={14} className="shrink-0" />
              {lat != null && lng != null ? (
                <span className="truncate">
                  {formatLocation(loc) || 'Local encontrado'}{' '}
                  <span className="opacity-60">({lat.toFixed(5)}, {lng.toFixed(5)})</span>
                </span>
              ) : (
                <span>Localização não encontrada. Ajuste o endereço e clique em Localizar.</span>
              )}
              <button
                onClick={handleRegeocode}
                disabled={isRegeocoding}
                className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium transition-colors"
              >
                {isRegeocoding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Localizar
              </button>
            </div>

            {/* Precisão da localização */}
            {result.aiAnalyzed && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${isDarkMode ? 'bg-[#1A1A1A] text-[#888888]' : 'bg-gray-50 text-gray-500'}`}>
                <MapPin size={12} />
                <span>Precisão: <strong>{translatePrecision(locationPrecision)}</strong></span>
              </div>
            )}

            {/* Abas */}
            <ModalTabs
              active={activeTab}
              onChange={(t) => setActiveTab(t as Tab)}
              isDarkMode={isDarkMode}
              tabs={[
                { id: 'general', label: 'Dados Gerais' },
                { id: 'address', label: 'Endereço' },
              ]}
            />

            {activeTab === 'general' ? (
              <>
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Título</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass(isDarkMode)} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Fonte</label>
              <input type="text" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass(isDarkMode)} placeholder="G1, UOL, site da prefeitura..." />
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

            <div className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${isDarkMode ? 'bg-[#1A1A1A] text-[#888888]' : 'bg-gray-50 text-gray-500'}`}>
              <span className="flex items-center gap-2">
                <Sparkles size={14} />
                Confiança da análise
              </span>
              <span className={`font-bold ${confidence >= 0.7 ? 'text-green-500' : confidence >= 0.4 ? 'text-amber-500' : 'text-red-500'}`}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
              </>
            ) : (
              <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-sm font-medium mb-1 opacity-70">CEP</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={loc.zip_code}
                    onChange={handleCepChange}
                    className={`${inputClass(isDarkMode)} ${isCepLoading ? 'opacity-60' : ''}`}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {isCepLoading && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1 opacity-70">Logradouro</label>
                <input type="text" value={loc.street} onChange={(e) => setLocField('street', e.target.value)} className={inputClass(isDarkMode)} placeholder="Rua, Avenida..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Número</label>
                <input type="text" value={loc.number} onChange={(e) => setLocField('number', e.target.value)} className={inputClass(isDarkMode)} placeholder="123" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Complemento</label>
                <input type="text" value={loc.complement} onChange={(e) => setLocField('complement', e.target.value)} className={inputClass(isDarkMode)} placeholder="Apto, bloco, lote..." />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Bairro</label>
              <input type="text" value={loc.neighborhood} onChange={(e) => setLocField('neighborhood', e.target.value)} className={inputClass(isDarkMode)} placeholder="Nome do bairro" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Cidade</label>
                <input type="text" value={loc.city} onChange={(e) => setLocField('city', e.target.value)} className={inputClass(isDarkMode)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Estado</label>
                <input type="text" value={loc.state} onChange={(e) => setLocField('state', e.target.value)} className={inputClass(isDarkMode)} placeholder="SP" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Ponto de referência</label>
              <input type="text" value={loc.reference} onChange={(e) => setLocField('reference', e.target.value)} className={inputClass(isDarkMode)} placeholder="Próximo ao..." />
            </div>
              </>
            )}

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
