import { useState, ReactNode } from 'react';

/** Extrai o favicon de uma URL (Google S2, sem chave). */
export function getFaviconUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

interface FaviconProps {
  /** URL da notícia (de onde sai o domínio). */
  url?: string | null;
  alt: string;
  className?: string;
  /** Ícone exibido quando não há favicon ou ele falhar ao carregar. */
  fallback: ReactNode;
}

/** Favicon do site da notícia com fallback para ícone genérico. */
export default function Favicon({ url, alt, className, fallback }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
