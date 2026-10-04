import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza filhos em document.body. Necessário para dropdowns posicionados
 * com coordenadas de viewport (position: fixed + getBoundingClientRect) dentro
 * de modais animados (elementos transformados viram o containing block e
 * quebram o posicionamento fixed).
 */
export default function Portal({ children, key }: { children: ReactNode; key?: string }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
