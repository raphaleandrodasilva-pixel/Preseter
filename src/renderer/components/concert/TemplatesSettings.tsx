import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

interface TemplatesSettingsProps {
  onClose: () => void;
}

/** Configurações → Templates: cria um concert a partir de um template. */
export const TemplatesSettings: React.FC<TemplatesSettingsProps> = ({ onClose }) => {
  const {
    concertTemplates,
    chooseTemplate,
    openConcertFile,
    preferences,
    updatePreferences,
  } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useTemplate = async (templateId: string) => {
    setBusy(true);
    setError(null);
    try {
      if (templateId === 'midi-externo' && !preferences?.externalMidiEnabled) {
        const next = await updatePreferences({ externalMidiEnabled: true });
        if (next?.externalMidiEnabled !== true) {
          setError('Não foi possível ligar o MIDI externo. Confira as Configurações.');
          return;
        }
      }
      await chooseTemplate(templateId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar o concert.');
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    setBusy(true);
    setError(null);
    try {
      await openConcertFile();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="hw-inset space-y-2 p-3">
        <h4 className="hw-label">Templates de concert</h4>
        <p className="text-[11px] leading-relaxed" style={{ color: '#9A9AA0' }}>
          Ao abrir o app, você já entra pronto para criar um patch. Use os
          templates abaixo quando quiser começar com sets, órgãos ou uma
          orquestra.
        </p>
      </section>

      <section className="space-y-2">
        <button
          type="button"
          className="hw-inset flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
          onClick={() => void openFile()}
          disabled={busy}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ background: '#3A3A3C', color: '#fff' }}>
            📂
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium" style={{ color: '#F2F2F7' }}>Abrir arquivo…</span>
            <span className="block text-[11px]" style={{ color: '#9A9AA0' }}>Abrir um concert .pst existente</span>
          </span>
          <span style={{ color: '#9A9AA0' }}>›</span>
        </button>

        <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />

        {concertTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="hw-inset flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:opacity-50"
            onClick={() => void useTemplate(template.id)}
            disabled={busy}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ background: '#0A6FE0', color: '#fff' }}>
              {template.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium" style={{ color: '#F2F2F7' }}>{template.name}</span>
              <span className="block text-[11px]" style={{ color: '#9A9AA0' }}>{template.description}</span>
            </span>
            <span className="text-[10px] font-semibold" style={{ color: '#7FB6FF' }}>
              Usar
            </span>
          </button>
        ))}

        {error && (
          <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>
            {error}
          </div>
        )}
      </section>
    </div>
  );
};
