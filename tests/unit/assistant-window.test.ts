import { describe, expect, it } from 'vitest';
import {
  assistantWindowSize,
  centeredPosition,
  clampWindowPosition,
  DEFAULT_ASSISTANT_WINDOW,
  dockedPosition,
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
});
