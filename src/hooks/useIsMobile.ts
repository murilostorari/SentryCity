import { useState, useEffect } from 'react';

/**
 * true quando a tela é de mobile/tablet (< 1024px).
 * Avaliado de forma lazy no primeiro render (sem flash de layout errado).
 */
export function useIsMobile(breakpoint: number = 1024): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
