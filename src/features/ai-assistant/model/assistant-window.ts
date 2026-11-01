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

/** Altura da aba recolhida (a janela encaixada cresce a partir dela). */
export const DOCK_TAB_HEIGHT = 28;

/**
 * Transições da aba que vira janela (como as abas do puter.com):
 * - ao abrir, a própria aba cresce até o tamanho da janela, o rótulo da aba some
 *   logo, o conteúdo aparece desfocado e ganha nitidez durante o crescimento, e
 *   os controles laterais (parados no lugar final) aparecem no fim;
 * - ao fechar, conteúdo e controles somem primeiro e a janela encolhe até a aba,
 *   cujo rótulo volta no fim.
 * A visibilidade troca na hora ao abrir (o campo de texto aceita foco) e só no
 * fim do sumiço ao fechar. Valores no formato da propriedade CSS `transition`.
 */
export function dockMorphTransitions(revealed: boolean): { card: string; content: string; tab: string; controls: string } {
  if (revealed) {
    const grow = '280ms cubic-bezier(0.22, 1, 0.36, 1)';
    return {
      card: `width ${grow}, height ${grow}, border-radius ${grow}, box-shadow ${grow}`,
      content: 'opacity 200ms ease-out 90ms, filter 220ms ease-out 90ms, visibility 0s linear 0s',
      tab: 'opacity 90ms ease-out',
      controls: 'opacity 160ms ease-out 220ms, visibility 0s linear 0s',
    };
  }
  const shrink = '220ms cubic-bezier(0.4, 0, 0.2, 1) 70ms';
  return {
    card: `width ${shrink}, height ${shrink}, border-radius ${shrink}, box-shadow ${shrink}`,
    content: 'opacity 110ms ease-in, filter 110ms ease-in, visibility 0s linear 110ms',
    tab: 'opacity 140ms ease-out 200ms',
    controls: 'opacity 90ms ease-in, visibility 0s linear 90ms',
  };
}

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

/** Distância que o ponteiro precisa andar para virar arraste: um clique na alça não solta a janela. */
export const DRAG_THRESHOLD_PX = 4;

/** Altura do cabeçalho da janela solta (onde o cursor fica ao soltar a janela encaixada). */
const FLOATING_HEADER_HEIGHT = 44;

/**
 * Onde o cursor "segura" a janela solta durante o arraste. Da janela solta,
 * vale o ponto clicado. Da encaixada (mais larga e mais baixa), o cursor vai
 * para o cabeçalho da janela solta, na mesma proporção horizontal, para a
 * janela nascer debaixo do cursor e acompanhá-lo.
 */
export function grabOffset(
  pointer: { x: number; y: number },
  box: { left: number; top: number; width: number },
  size: Size,
  fromDocked: boolean,
): { x: number; y: number } {
  if (!fromDocked) return { x: pointer.x - box.left, y: pointer.y - box.top };
  const ratio = box.width > 0 ? (pointer.x - box.left) / box.width : 0.5;
  const edge = 24;
  return { x: Math.round(Math.min(size.width - edge, Math.max(edge, ratio * size.width))), y: FLOATING_HEADER_HEIGHT / 2 };
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
