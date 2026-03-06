import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  isDarkMode?: boolean;
}

export default function ResponsiveModal({ isOpen, onClose, children, className, isDarkMode }: ResponsiveModalProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100) {
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
          />

          {/* Modal Content */}
          {isMobile ? (
            // Mobile Bottom Sheet
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className={`
                fixed bottom-0 left-0 right-0 z-[9999]
                w-full max-h-[90vh] flex flex-col
                rounded-t-2xl shadow-2xl
                bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white
                ${className || ''}
              `}
              style={{
                backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                color: isDarkMode ? '#FFFFFF' : '#111827',
              }}
            >
              {/* Drag Handle */}
              <div className="w-full flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none">
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
              </div>
              
              {/* Content Container */}
              <div className="flex-1 overflow-hidden flex flex-col pb-6 safe-area-bottom">
                {children}
              </div>
            </motion.div>
          ) : (
            // Desktop Modal
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={`
                fixed inset-0 m-auto z-[9999]
                w-full max-w-md h-fit rounded-xl shadow-2xl
                bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white
                ${className || ''}
              `}
              style={{
                backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
                color: isDarkMode ? '#FFFFFF' : '#111827',
              }}
            >
              <div className="flex-1 overflow-hidden flex flex-col">
                {children}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
