/**
 * Learn de parâmetro por clique (Fase 4.3).
 *
 * O inspetor arma um controle de tela; o próximo clique num parâmetro de
 * plugin (channel strips) liga o parâmetro àquele controle.
 */

type LearnHandler = (elementId: string, pluginPath: string, parameterId: string) => void;

let targetElementId: string | null = null;
let handler: LearnHandler | null = null;
const listeners = new Set<(active: boolean) => void>();

function notify(active: boolean): void {
  for (const listener of listeners) {
    try {
      listener(active);
    } catch {
      /* listener com defeito não quebra o fluxo */
    }
  }
}

export function setParameterLearnHandler(next: LearnHandler | null): void {
  handler = next;
}

export function armParameterLearn(elementId: string): void {
  targetElementId = elementId;
  notify(true);
}

export function cancelParameterLearn(): void {
  targetElementId = null;
  notify(false);
}

export function isParameterLearnArmed(): boolean {
  return targetElementId !== null;
}

export function subscribeParameterLearn(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  listener(targetElementId !== null);
  return () => listeners.delete(listener);
}

export function learnParameter(pluginPath: string, parameterId: string): boolean {
  if (!targetElementId || !handler) return false;
  const target = targetElementId;
  targetElementId = null;
  notify(false);
  handler(target, pluginPath, parameterId);
  return true;
}
