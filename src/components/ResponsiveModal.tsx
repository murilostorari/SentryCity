import { motion, AnimatePresence, PanInfo, useDragControls } from 'motion/react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  isDarkMode?: boolean;
}

/** Abaixo disso vira bottom sheet arrastável (inclui tablet). */
const SHEET_BREAKPOINT = 1024;

export default function ResponsiveModal({ isOpen, onClose, children, className, isDarkMode }: ResponsiveModalProps) {
  // Avaliado de forma lazy no primeiro render: evita o flash de "diálogo
  // desktop" em telas pequenas antes do useEffect rodar.
  const [isSheet, setIsSheet] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < SHEET_BREAKPOINT : false
  );
  const [mounted, setMounted] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    setMounted(true);
    const check = () => setIsSheet(window.innerWidth < SHEET_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Trava o scroll do fundo enquanto o modal está aberto.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // ESC fecha (desktop/mobile com teclado).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Arrastar para baixo fecha a bottom sheet (arrasto iniciado só no handle,
  // para não conflitar com o scroll do conteúdo).
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop (filho direto do AnimatePresence → anima a saída) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
          />
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <AnimatePresence>
        {isOpen && (isSheet ? (
          // Bottom sheet (mobile/tablet) — arrastável pelo handle
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className={`
              fixed bottom-0 left-0 right-0 z-[9999]
              w-full max-h-[90dvh] flex flex-col
              rounded-t-2xl shadow-2xl
              bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white
              ${className || ''}
            `}
            style={{
              backgroundColor: isDarkMode ? '#1E1E1E' : undefined,
              color: isDarkMode ? '#FFFFFF' : undefined,
            }}
          >
            {/* Drag Handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="w-full flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
            >
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 pb-6">
              {children}
            </div>
          </motion.div>
        ) : (
          // Diálogo centralizado (desktop)
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={`
              fixed inset-0 m-auto z-[9999]
              w-full max-w-md h-fit max-h-[85vh] rounded-xl shadow-2xl flex flex-col
              bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white
              ${className || ''}
            `}
            style={{
              backgroundColor: isDarkMode ? '#1E1E1E' : undefined,
              color: isDarkMode ? '#FFFFFF' : undefined,
            }}
          >
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {children}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </>,
    document.body
  );
}
