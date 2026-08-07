import { useState, useRef, useEffect } from 'react';
import { LogOut, User as UserIcon, ChevronDown, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Profile } from '../types/Profile';
import { User } from '@supabase/supabase-js';

interface UserMenuProps {
  user: User;
  profile: Profile | null;
  isDarkMode: boolean;
  onLogout: () => void;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email ? email[0].toUpperCase() : 'U';
}

export default function UserMenu({ user, profile, isDarkMode, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
  const initials = getInitials(profile?.name ?? user.user_metadata?.name, user.email ?? undefined);
  const roleLabel = profile?.role === 'admin' ? 'Administrador' : profile?.role === 'analyst' ? 'Analista' : 'Voluntário';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors shadow-sm ${
          isDarkMode
            ? 'bg-[#1E1E1E] border-[#2C2C2C] text-white hover:bg-[#2A2A2A]'
            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
        }`}
      >
        <div className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-[#333] flex items-center justify-center text-white font-bold text-xs border border-gray-200 dark:border-[#444]">
          {initials}
        </div>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-gray-500 dark:text-[#888888]`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 top-full mt-2 w-64 rounded-lg shadow-2xl border overflow-hidden z-50 ${
              isDarkMode ? 'bg-[#1E1E1E] border-[#2C2C2C]' : 'bg-white border-gray-200'
            }`}
          >
            <div className={`p-4 border-b ${isDarkMode ? 'border-[#2C2C2C]' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-900 dark:bg-[#333] flex items-center justify-center text-white font-bold text-sm border border-gray-200 dark:border-[#444] shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate text-gray-900 dark:text-white">{displayName}</p>
                  <p className="text-xs text-gray-500 dark:text-[#888888] truncate">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#888888]">
                <Shield size={12} />
                <span>{roleLabel}</span>
                {profile && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className={`font-medium ${profile.reputation_score >= 60 ? 'text-green-600 dark:text-green-400' : profile.reputation_score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {Math.round(profile.reputation_score)} pts
                    </span>
                  </span>
                )}
              </div>
              {profile && (
                <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-[#888888]">
                  <span><b className="text-gray-900 dark:text-white">{profile.reports_count}</b> relatos</span>
                  <span><b className="text-green-600 dark:text-green-400">{profile.confirmed_reports}</b> confirmados</span>
                  <span><b className="text-blue-600 dark:text-blue-400">{profile.resolved_reports}</b> resolvidos</span>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                isDarkMode
                  ? 'text-[#EF4444] hover:bg-[#2A2A2A]'
                  : 'text-red-600 hover:bg-gray-50'
              }`}
            >
              <LogOut size={15} />
              Sair da conta
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
