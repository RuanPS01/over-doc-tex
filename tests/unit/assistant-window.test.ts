import { describe, expect, it } from 'vitest';
import {
  assistantWindowSize,
  centeredPosition,
  clampWindowPosition,
  DEFAULT_ASSISTANT_WINDOW,
  dockedMessagesMaxHeight,
  dockedPanelWidth,
  dockedPosition,
  dockMorphTransitions,
  DRAG_THRESHOLD_PX,
  grabOffset,
  nextDockReveal,
  parseAssistantWindow,
} from '@/features/ai-assistant/model/assistant-window';

const viewport = { width: 1280, height: 800 };

describe('janela do assistente', () => {
  it('abre encaixada à direita, com até 420 x 640 cabendo na tela', () => {
    expect(DEFAULT_ASSISTANT_WINDOW).toEqual({ mode: 'docked', dock: 'right' });
    expect(assistantWindowSize(viewport)).toEqual({ width: 420, height: 640 });
    expect(assistantWindowSize({ width: 900, height: 600 })).toEqual({ width: 420, height: 504 });
  });

  it('encaixada fica presa ao rodapé, com o mesmo tamanho à esquerda, no meio e à direita', () => {
    const size = assistantWindowSize(viewport);
    expect(dockedPosition('left', size, viewport)).toEqual({ x: 16, y: 160 });
    expect(dockedPosition('center', size, viewport)).toEqual({ x: 430, y: 160 });
    expect(dockedPosition('right', size, viewport)).toEqual({ x: 844, y: 160 });
  });

  it('solta, nunca sai da tela nem sobe por cima do cabeçalho', () => {
    const size = assistantWindowSize(viewport);
    expect(clampWindowPosition({ x: -200, y: -50 }, size, viewport)).toEqual({ x: 16, y: 56 });
    expect(clampWindowPosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({ x: 844, y: 144 });
    expect(centeredPosition(size, viewport)).toEqual({ x: 430, y: 80 });
  });

  it('estado guardado inválido volta ao padrão', () => {
    expect(parseAssistantWindow({ mode: 'docked', dock: 'center' })).toEqual({ mode: 'docked', dock: 'center' });
    expect(parseAssistantWindow({ mode: 'floating', x: 100, y: 200 })).toEqual({ mode: 'floating', x: 100, y: 200 });
    expect(parseAssistantWindow({ mode: 'docked', dock: 'top' })).toEqual(DEFAULT_ASSISTANT_WINDOW);
    expect(parseAssistantWindow({ mode: 'floating', x: 'a' })).toEqual(DEFAULT_ASSISTANT_WINDOW);
    expect(parseAssistantWindow(null)).toEqual(DEFAULT_ASSISTANT_WINDOW);
  });

  it('encaixada vira aba: o mouse revela, sair sem interagir encolhe, interagir fixa até ocultar', () => {
    expect(nextDockReveal('tab', 'enter')).toBe('peek');
    expect(nextDockReveal('peek', 'leave')).toBe('tab');
    expect(nextDockReveal('peek', 'interact')).toBe('pinned');
    expect(nextDockReveal('pinned', 'leave')).toBe('pinned');
    expect(nextDockReveal('pinned', 'enter')).toBe('pinned');
    expect(nextDockReveal('pinned', 'hide')).toBe('tab');
    expect(nextDockReveal('tab', 'open')).toBe('pinned');
    expect(nextDockReveal('tab', 'leave')).toBe('tab');
  });

  it('encaixada e aberta ocupa pouco: até 560 de largura e conversa com até 45% da altura', () => {
    expect(dockedPanelWidth(viewport)).toBe(560);
    expect(dockedPanelWidth({ width: 500, height: 800 })).toBe(420);
    expect(dockedMessagesMaxHeight(viewport)).toBe(360);
    expect(dockedMessagesMaxHeight({ width: 1280, height: 1200 })).toBe(380);
    expect(dockedMessagesMaxHeight({ width: 1280, height: 300 })).toBe(160);
  });

  it('a aba cresce até virar a janela: conteúdo depois do crescimento, controles parados só no fim', () => {
    const delayOf = (transition: string, property: string) => {
      const part = transition.split(/,\s*(?![^(]*\))/).find((item) => item.startsWith(property)) ?? '';
      const times = part.match(/\d+(?:ms|s)/g) ?? [];
      return times.length > 1 ? parseFloat(times[1]!) * (times[1]!.endsWith('ms') ? 1 : 1000) : 0;
    };
    const open = dockMorphTransitions(true);
    expect(open.card).toMatch(/^width .*height .*/);
    expect(delayOf(open.card, 'width')).toBe(0);
    expect(delayOf(open.content, 'opacity')).toBeGreaterThan(0);
    expect(delayOf(open.content, 'visibility')).toBe(0);
    expect(delayOf(open.controls, 'opacity')).toBeGreaterThan(delayOf(open.content, 'opacity'));
    expect(open.controls).not.toMatch(/transform|translate/);

    const close = dockMorphTransitions(false);
    expect(delayOf(close.card, 'width')).toBeGreaterThan(0);
    expect(delayOf(close.content, 'visibility')).toBeGreaterThan(0);
    expect(delayOf(close.tab, 'opacity')).toBeGreaterThan(delayOf(close.card, 'width'));
  });

  it('ao soltar a encaixada, o cursor segura o cabeçalho da janela solta; da solta, vale o ponto clicado', () => {
    const size = assistantWindowSize(viewport);
    const docked = { left: 704, top: 649, width: 560 };
    expect(grabOffset({ x: 984, y: 655 }, docked, size, true)).toEqual({ x: 210, y: 22 });
    expect(grabOffset({ x: 1262, y: 655 }, docked, size, true)).toEqual({ x: 396, y: 22 });
    expect(grabOffset({ x: 300, y: 120 }, { left: 250, top: 100, width: 420 }, size, false)).toEqual({ x: 50, y: 20 });
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
