/**
 * Janela do assistente no desktop (puro): encaixada no rodapé (à esquerda,
 * no meio ou à direita, onde abre por padrão) ou solta, arrastada como uma
 * janela. Encaixada, ela tem o mesmo tamanho nas três posições.
 */

import { msg } from '@/lib/i18n';

export type DockPosition = 'left' | 'center' | 'right';

export type AssistantWindowState = { mode: 'docked'; dock: DockPosition } | { mode: 'floating'; x: number; y: number };

export const DEFAULT_ASSISTANT_WINDOW: AssistantWindowState = { mode: 'docked', dock: 'right' };

export const DOCK_POSITIONS: readonly { value: DockPosition; label: string }[] = [
  { value: 'left', label: msg('Encaixar à esquerda') },
  { value: 'center', label: msg('Encaixar no meio') },
  { value: 'right', label: msg('Encaixar à direita') },
];

interface Size {
  width: number;
  height: number;
}

/** Distância das bordas da tela. */
export const WINDOW_MARGIN = 16;
/** A janela solta não sobe por cima do cabeçalho do editor (3rem). */
const TOP_LIMIT = 56;

/** Tamanho da janela: até 420 x 640, sempre cabendo na tela. */
export function assistantWindowSize(viewport: Size): Size {
  return {
    width: Math.max(280, Math.min(420, viewport.width - WINDOW_MARGIN * 2)),
    height: Math.max(320, Math.min(640, viewport.height - 96)),
  };
}

/** Mantém a janela solta inteira dentro da tela (e abaixo do cabeçalho). */
export function clampWindowPosition(position: { x: number; y: number }, size: Size, viewport: Size): { x: number; y: number } {
  const maxX = Math.max(WINDOW_MARGIN, viewport.width - size.width - WINDOW_MARGIN);
  const maxY = Math.max(TOP_LIMIT, viewport.height - size.height - WINDOW_MARGIN);
  return {
    x: Math.round(Math.min(maxX, Math.max(WINDOW_MARGIN, position.x))),
    y: Math.round(Math.min(maxY, Math.max(TOP_LIMIT, position.y))),
  };
}

/**
 * Encaixada, a janela vira uma aba no rodapé:
 * - "tab": só a aba aparece;
 * - "peek": o mouse está em cima e a janela aparece; ao sair sem interagir, volta à aba;
 * - "pinned": houve interação (clique, foco, digitação) e ela fica até ser ocultada.
 */
export type DockReveal = 'tab' | 'peek' | 'pinned';

/** enter/leave: o mouse entra ou sai; interact: clique ou foco dentro; open: aba clicada ou assistente ligado; hide: ocultar ou Esc. */
export type DockRevealEvent = 'enter' | 'leave' | 'interact' | 'open' | 'hide';

export function nextDockReveal(current: DockReveal, event: DockRevealEvent): DockReveal {
  switch (event) {
    case 'enter':
      return current === 'tab' ? 'peek' : current;
    case 'leave':
      return current === 'peek' ? 'tab' : current;
    case 'interact':
    case 'open':
      return 'pinned';
    case 'hide':
      return 'tab';
  }
}

/** Espera antes de encolher quando o mouse sai, para um desvio rápido não fechar a janela. */
export const DOCK_LEAVE_DELAY_MS = 350;

/** Encaixada e aberta, a janela é mais baixa e mais larga que a solta: até 560 de largura. */
export function dockedPanelWidth(viewport: Size): number {
  return Math.max(280, Math.min(560, viewport.width - WINDOW_MARGIN * 2 - 48));
}

/** Altura máxima da conversa encaixada: até 380, sem passar de 45% da tela. */
export function dockedMessagesMaxHeight(viewport: Size): number {
  return Math.max(160, Math.min(380, Math.round(viewport.height * 0.45)));
}

/** Canto superior esquerdo da janela encaixada (para soltar a janela de onde ela está). */
export function dockedPosition(dock: DockPosition, size: Size, viewport: Size): { x: number; y: number } {
  const x = dock === 'left' ? WINDOW_MARGIN : dock === 'center' ? (viewport.width - size.width) / 2 : viewport.width - size.width - WINDOW_MARGIN;
  return { x: Math.round(x), y: viewport.height - size.height };
}

/** Janela solta no centro da tela (soltar pelo menu, sem arrastar). */
export function centeredPosition(size: Size, viewport: Size): { x: number; y: number } {
  return clampWindowPosition({ x: (viewport.width - size.width) / 2, y: (viewport.height - size.height) / 2 }, size, viewport);
}

export function parseAssistantWindow(value: unknown): AssistantWindowState {
  if (!value || typeof value !== 'object') return DEFAULT_ASSISTANT_WINDOW;
  const state = value as Record<string, unknown>;
  if (state.mode === 'docked' && DOCK_POSITIONS.some((position) => position.value === state.dock)) {
    return { mode: 'docked', dock: state.dock as DockPosition };
  }
  if (state.mode === 'floating' && Number.isFinite(state.x) && Number.isFinite(state.y)) {
    return { mode: 'floating', x: state.x as number, y: state.y as number };
  }
  return DEFAULT_ASSISTANT_WINDOW;
}
