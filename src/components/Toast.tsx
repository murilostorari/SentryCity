import { useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

const toastIcons: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={20} className="text-green-500" />,
  error: <AlertCircle size={20} className="text-red-500" />,
  warning: <AlertTriangle size={20} className="text-amber-500" />,
  info: <Info size={20} className="text-blue-500" />,
};

const toastColors: Record<ToastType, string> = {
  success: 'border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-900/20',
  error: 'border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20',
  warning: 'border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/20',
  info: 'border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/20',
};

function ToastItem({ toast, onClose, isDarkMode, key }: { toast: Toast; onClose: (id: string) => void; isDarkMode: boolean; key?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border ${toastColors[toast.type]} ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">{toastIcons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.message && <p className="text-sm opacity-80 mt-0.5">{toast.message}</p>}
      </div>
      <button
        onClick={() => onClose(toast.id)}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label="Fechar"
      >
        <X size={16} className="opacity-50" />
      </button>
    </motion.div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
  isDarkMode: boolean;
}

let toastIdCounter = 0;
const generateId = () => `toast-${Date.now()}-${toastIdCounter++}`;

const toastContext = {
  toasts: [] as Toast[],
  addToast: null as ((toast: Omit<Toast, 'id'>) => void) | null,
  removeToast: null as ((id: string) => void) | null,
};

export function ToastProvider({ children, isDarkMode }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = generateId();
    const newToast: Toast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    if (toast.duration !== 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration ?? 5000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  toastContext.toasts = toasts;
  toastContext.addToast = addToast;
  toastContext.removeToast = removeToast;

  return (
    <>
      {children}
      <AnimatePresence>
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onClose={removeToast}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </AnimatePresence>
    </>
  );
}

export function useToast() {
  return {
    success: (title: string, message?: string, duration?: number) => 
      toastContext.addToast?.({ type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration?: number) => 
      toastContext.addToast?.({ type: 'error', title, message, duration }),
    warning: (title: string, message?: string, duration?: number) => 
      toastContext.addToast?.({ type: 'warning', title, message, duration }),
    info: (title: string, message?: string, duration?: number) => 
      toastContext.addToast?.({ type: 'info', title, message, duration }),
  };
}

export function showSuccess(title: string, message?: string, duration?: number) {
  toastContext.addToast?.({ type: 'success', title, message, duration });
}

export function showError(title: string, message?: string, duration?: number) {
  toastContext.addToast?.({ type: 'error', title, message, duration });
}

export function showWarning(title: string, message?: string, duration?: number) {
  toastContext.addToast?.({ type: 'warning', title, message, duration });
}

export function showInfo(title: string, message?: string, duration?: number) {
  toastContext.addToast?.({ type: 'info', title, message, duration });
}