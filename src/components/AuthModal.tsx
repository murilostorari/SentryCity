import { useState, FormEvent } from 'react';
import { X, Loader2, LogIn, UserPlus, Mail, Lock, User as UserIcon, MailCheck } from 'lucide-react';
import ResponsiveModal from './ResponsiveModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onSignIn: (email: string, password: string) => Promise<{ error: string | null; requiresEmailConfirmation?: boolean }>;
  onSignUp: (email: string, password: string, name?: string) => Promise<{ error: string | null; requiresEmailConfirmation?: boolean }>;
  initialMode?: 'login' | 'signup';
}

export default function AuthModal({ isOpen, onClose, isDarkMode, onSignIn, onSignUp, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
    }

    setIsSubmitting(true);
    const result = mode === 'login'
      ? await onSignIn(email, password)
      : await onSignUp(email, password, name || undefined);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // Cadastro com confirmação de email habilitada: sessão ainda não existe.
    if (mode === 'signup' && result.requiresEmailConfirmation) {
      setSuccessMessage('Conta criada! Confirme seu email para fazer login.');
      return;
    }
    onClose();
  };

  const inputClass = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
    isDarkMode
      ? 'bg-[#2C2C2C] border-[#444] text-white placeholder-gray-500 focus:border-blue-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
  }`;

  const tabClass = (active: boolean) =>
    `flex-1 py-2.5 text-sm font-medium transition-colors rounded-lg ${
      active
        ? isDarkMode ? 'bg-[#2A2A2A] text-white' : 'bg-gray-100 text-gray-900'
        : isDarkMode ? 'text-[#888888] hover:text-white' : 'text-gray-500 hover:text-gray-900'
    }`;

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} className="max-w-sm" isDarkMode={isDarkMode}>
      <div className={`flex items-center justify-between p-4 border-b shrink-0 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
        <h2 className="text-lg font-semibold">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </h2>
        <button
          onClick={onClose}
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1 no-scrollbar">
        {/* Mode Toggle */}
        <div className={`flex gap-1 p-1 rounded-lg ${isDarkMode ? 'bg-[#1A1A1A]' : 'bg-gray-50'} border ${isDarkMode ? 'border-[#2C2C2C]' : 'border-gray-200'}`}>
          <button type="button" onClick={() => switchMode('login')} className={tabClass(mode === 'login')}>
            <span className="flex items-center justify-center gap-1.5"><LogIn size={14} /> Entrar</span>
          </button>
          <button type="button" onClick={() => switchMode('signup')} className={tabClass(mode === 'signup')}>
            <span className="flex items-center justify-center gap-1.5"><UserPlus size={14} /> Cadastrar</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Nome</label>
              <div className="relative">
                <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="Seu nome"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 opacity-70">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="voce@exemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 opacity-70">Senha</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="••••••••"
              />
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Confirmar senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <MailCheck size={16} className="shrink-0" />
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {isSubmitting ? (mode === 'login' ? 'Entrando...' : 'Criando conta...') : (mode === 'login' ? 'Entrar' : 'Criar conta')}
          </button>
        </form>
      </div>
    </ResponsiveModal>
  );
}
