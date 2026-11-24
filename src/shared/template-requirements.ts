/**
 * Dependências dos templates de concert.
 *
 * `storeIds` são itens da Loja (plugins/samples). Templates nativos (Teclado,
 * Worship, Guitarra…) não precisam de nada. O Full Set usa os instrumentos
 * livres documentados no patch; a análise só avisa o que falta instalar.
 */
export interface TemplateRequirements {
  /** Ids do catálogo da Loja. */
  storeIds: string[];
}

/** Item da Loja que falta para o template. */
export interface TemplateMissingItem {
  id: string;
  name: string;
  kind: string;
  approxBytes: number;
  status: string;
}

export interface TemplateReadiness {
  templateId: string;
  total: number;
  ready: number;
  missing: TemplateMissingItem[];
  missingIds: string[];
  approxBytes: number;
}

const REQUIREMENTS: Record<string, TemplateRequirements> = {
  fullset: {
    storeIds: ['sforzando', 'surge-xt', 'mda', 'odin2', 'helm', 'musescore-general'],
  },
};

export function templateRequirements (templateId: string): TemplateRequirements {
  return REQUIREMENTS[templateId] ?? { storeIds: [] };
}
