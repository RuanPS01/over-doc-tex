/** Uma ação que dá para desfazer e refazer (gravações no Firestore, por exemplo). */
export interface UndoEntry {
  /** O que a ação fez, curto e já traduzido ("comentário novo"); aparece nos botões. */
  label: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
}

/**
 * Pilhas de desfazer e refazer, sem React (testável). Uma ação nova apaga o
 * que dava para refazer. Se desfazer ou refazer falhar (sem rede, a regra
 * recusou porque outra pessoa mudou a mesma coisa), a ação sai das duas
 * pilhas e o erro sobe: repetir daria o mesmo erro.
 */
export class UndoHistory {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Próxima ação a desfazer (a mais recente). */
  get nextUndo(): UndoEntry | null {
    return this.past.at(-1) ?? null;
  }

  get nextRedo(): UndoEntry | null {
    return this.future.at(-1) ?? null;
  }

  push(entry: UndoEntry): void {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Desfaz a ação mais recente. Falso quando não havia o que desfazer. */
  async undo(): Promise<boolean> {
    const entry = this.past.pop();
    if (!entry) return false;
    await entry.undo();
    this.future.push(entry);
    return true;
  }

  /** Refaz a última ação desfeita. Falso quando não havia o que refazer. */
  async redo(): Promise<boolean> {
    const entry = this.future.pop();
    if (!entry) return false;
    await entry.redo();
    this.past.push(entry);
    return true;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
