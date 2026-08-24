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
  const jinaUrl = `https://r.jina.ai/${url}?returnFormat=markdown`;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Falha ao extrair artigo (Jina ${res.status}): ${detail}`);
  }

  const envelope = await res.json();

  // Jina envolve os dados em data.data (não data diretamente)
  const data = envelope.data ?? envelope;

  const title = (data.title || '').trim();
  const rawContent = (data.content || data.markdown || '').trim();
  const description = (data.description || '').trim();
  const author = (data.author || data.metadata?.author || '').trim();
  const publishedAt = data.date || data.metadata?.date || null;
  const imageUrl = data.image || data.metadata?.image || null;

  // Extrair domínio/fonte da URL
  let sourceName = '';
  try {
    const urlObj = new URL(url);
    sourceName = urlObj.hostname.replace(/^www\./, '');
  } catch {
    sourceName = url;
  }

  if (!rawContent || rawContent.length < 20) {
    throw new Error('Conteúdo extraído muito curto. Verifique se a URL é de uma notícia válida.');
  }

  // Limpar o conteúdo: remover imagens de banner, navegação e links de compartilhamento
  const content = cleanArticleContent(rawContent, title);

  if (content.length < 20) {
    throw new Error('Conteúdo do artigo vazio após limpeza. Tente colar o texto manualmente.');
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

/**
 * Remove ruído do conteúdo extraído (banners, navegação, links de compartilhamento)
 * e retorna apenas o texto do artigo.
 */
function cleanArticleContent(raw: string, articleTitle: string): string {
  // Estratégia: encontrar o corpo do artigo usando o título retornado pelo Jina
  // O Jina retorna o conteúdo completo da página em markdown

  // 1. Tentar encontrar o H1 com o título do artigo
  if (articleTitle) {
    // Escapar caracteres especiais do título para regex
    const escapedTitle = articleTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`^#\\s+${escapedTitle}`, 'im');
    const titleMatch = raw.match(titleRegex);

    if (titleMatch && titleMatch.index != null) {
      const afterTitle = raw.substring(titleMatch.index);
      // Limpar share links, imagens de banner, etc
      const cleaned = afterTitle
        // Share links: * [](https://www.facebook.com/...) ou * [](whatsapp://...)
        .replace(/^\*?\s*\[.*?\]\(https?:\/\/.*?(facebook|whatsapp|twitter|linkedin|compartilhe|copiar|mailto).*?\)/gim, '')
        .replace(/^\*?\s*\[\]\(whatsapp:\/\/.*?\)/gim, '')
        .replace(/^\*?\s*\[\]\(mailto:.*?\)/gim, '')
        // Imagens de banner: [![Image ...](url)](url)
        .replace(/\[!\[Image \d+:.*?\]\(.*?\)\]\(.*?\)/g, '')
        // Imagens inline: ![Image ...](url)
        .replace(/!\[Image \d+:.*?\]\(.*?\)/g, '')
        // Links de redirect/banner do site
        .replace(/\[.*?\]\(https?:\/\/www\.sigamais\.com\/(redirect|arquivo)\/.*?\)/g, '')
        // Linhas que são só links de imagem
        .replace(/^\[.*?\]\(https?:\/\/.*?\)$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (cleaned.length > 50) {
        return cleaned.substring(0, 4000);
      }
    }
  }

  // 2. Fallback: limpeza genérica
  return raw
    .replace(/^\*?\s*\[.*?\]\(https?:\/\/.*?(facebook|whatsapp|twitter|linkedin|compartilhe|copiar|mailto).*?\)/gim, '')
    .replace(/^\*?\s*\[\]\(whatsapp:\/\/.*?\)/gim, '')
    .replace(/^\*?\s*\[\]\(mailto:.*?\)/gim, '')
    .replace(/\[!\[Image \d+:.*?\]\(.*?\)\]\(.*?\)/g, '')
    .replace(/!\[Image \d+:.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(https?:\/\/www\.sigamais\.com\/(redirect|arquivo)\/.*?\)/g, '')
    .replace(/^\[.*?\]\(https?:\/\/.*?\)$/gm, '')
    .replace(/\[.*?(Cidades|Geral|Polícia|Saúde|Ensino|Especial Publicitário)\]\(.*?\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 4000);
}
