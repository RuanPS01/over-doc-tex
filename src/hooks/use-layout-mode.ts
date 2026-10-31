import { useMediaQuery } from './use-media-query';

/**
 * Os três layouts do editor (ver docs/08-responsividade.md):
 * - desktop: árvore, editor e PDF em colunas redimensionáveis (>= 1024px e altura > 500px);
 * - mobile-landscape: celular deitado, editor e PDF em duas colunas curtas;
 * - mobile-portrait: um painel por vez (editor OU PDF), alternados por abas.
 */
export type LayoutMode = 'desktop' | 'mobile-landscape' | 'mobile-portrait';

export const DESKTOP_QUERY = '(min-width: 1024px) and (min-height: 501px)';
export const LANDSCAPE_SHORT_QUERY = '(orientation: landscape) and (max-height: 500px)';

export function useLayoutMode(): LayoutMode {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isLandscapeShort = useMediaQuery(LANDSCAPE_SHORT_QUERY);
  if (isDesktop) return 'desktop';
  return isLandscapeShort ? 'mobile-landscape' : 'mobile-portrait';
}
