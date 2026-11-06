import { describe, expect, it } from 'vitest';
import { UndoHistory } from '@/lib/undo-history';

describe('desfazer e refazer', () => {
  const counter = () => {
    const state = { value: 0 };
    const step = (amount: number, label = `+${amount}`) => ({
      label,
      undo: async () => {
        state.value -= amount;
      },
      redo: async () => {
        state.value += amount;
      },
    });
    return { state, step };
  };

  it('desfaz e refaz na ordem, e uma ação nova apaga o que dava para refazer', async () => {
    const { state, step } = counter();
    const history = new UndoHistory();
    state.value += 1;
    history.push(step(1));
    state.value += 2;
    history.push(step(2));
    expect(history.nextUndo?.label).toBe('+2');
    await history.undo();
    expect(state.value).toBe(1);
    await history.undo();
    expect(state.value).toBe(0);
    expect(await history.undo()).toBe(false);
    await history.redo();
    expect(state.value).toBe(1);
    expect(history.canRedo).toBe(true);
    state.value += 5;
    history.push(step(5));
    expect(history.canRedo).toBe(false);
    expect(history.nextUndo?.label).toBe('+5');
  });

  it('guarda no máximo o limite de ações (as mais antigas saem)', async () => {
    const { step } = counter();
    const history = new UndoHistory(2);
    history.push(step(1));
    history.push(step(2));
    history.push(step(3));
    await history.undo();
    await history.undo();
    expect(history.canUndo).toBe(false);
  });

  it('ação que falha ao desfazer sai das duas pilhas e o erro sobe', async () => {
    const history = new UndoHistory();
    history.push({ label: 'x', undo: () => Promise.reject(new Error('sem permissão')), redo: async () => undefined });
    await expect(history.undo()).rejects.toThrow('sem permissão');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
