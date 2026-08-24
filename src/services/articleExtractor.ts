/**
 * Serviço de Extração de Artigos (URL → Texto)
 * --------------------------------------------------------------------------
 * Usa o Jina Reader API (r.jina.ai) para extrair conteúdo limpo de URLs.
 * Serviço gratuito (1000 req/dia sem API key), suporta CORS.
 *
 * Retorna: título, texto principal, autor, data, domínio/fonte, imagem.
 */

export interface ArticleExtracted {
  title: string;
  content: string;
  description: string;
  author: string;
  publishedAt: string | null;
  sourceName: string;
  imageUrl: string | null;
}

/**
 * Extrai o conteúdo de uma notícia a partir de uma URL.
 * Retorna o texto limpo e metadados do artigo.
 */
export async function extractArticleFromUrl(url: string): Promise<ArticleExtracted> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Falha ao extrair artigo (Jina ${res.status}): ${detail}`);
  }

  const data = await res.json();

  const title = (data.title || '').trim();
  const content = (data.content || data.markdown || '').trim();
  const description = (data.description || '').trim();
  const author = (data.author || '').trim();
  const publishedAt = data.date || null;
  const imageUrl = data.image || null;

  // Extrair domínio/fonte da URL
  let sourceName = '';
  try {
    const urlObj = new URL(url);
    sourceName = urlObj.hostname.replace(/^www\./, '');
  } catch {
    sourceName = url;
  }

  if (!content || content.length < 20) {
    throw new Error('Conteúdo extraído muito curto. Verifique se a URL é de uma notícia válida.');
  }

  return {
    title,
    content,
    description,
    author,
    publishedAt,
    sourceName,
    imageUrl,
  };
}
