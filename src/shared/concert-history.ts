/**
 * Pilha de desfazer/refazer (Fase 2.5). Guarda instantâneos do concert e usa
 * uma função de assinatura para saber se algo realmente mudou.
 */

const snapshotKey = (state: unknown): string =>
  JSON.stringify(state, (key, item) => (key === 'updatedAt' ? undefined : item));

export class ConcertHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private present: T | null = null;

  constructor(
    private readonly keyOf: (state: T) => string = snapshotKey,
    private readonly limit = 100
  ) {}

  reset(): void {
    this.past = [];
    this.future = [];
    this.present = null;
  }

  /**
   * Registra o estado atual. Retorna true quando isso criou um ponto de
   * desfazer (ou seja, houve mudança em relação ao estado anterior).
   */
  commit(state: T): boolean {
    if (this.present !== null && this.keyOf(this.present) === this.keyOf(state)) {
      return false;
    }
    const created = this.present !== null;
    if (created) {
      this.past.push(this.present as T);
      if (this.past.length > this.limit) this.past.shift();
      this.future = [];
    }
    this.present = state;
    return created;
  }

  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    if (this.present !== null) this.future.push(this.present);
    this.present = previous;
    return previous;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    if (this.present !== null) this.past.push(this.present);
    this.present = next;
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
