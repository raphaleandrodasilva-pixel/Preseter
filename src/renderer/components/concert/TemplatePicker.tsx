import React, { useEffect, useState } from 'react';
import type { ConcertTemplateSummary } from '@shared/types';
import { ModalShell } from '../ui/ModalShell';

interface TemplatePickerProps {
  templates: ConcertTemplateSummary[];
  /** Estado atual do recurso de timbres MIDI externos. */
  externalMidiEnabled: boolean;
  /** Liga o recurso e devolve true quando ele ficou ativo. */
  onEnableExternalMidi: () => Promise<boolean>;
  onPick: (templateId: string) => void;
  onOpenFile: () => void;
  onCancel: () => void;
}

/** Página de entrada: escolher um template ou abrir um concert existente. */
export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  templates,
  externalMidiEnabled,
  onEnableExternalMidi,
  onPick,
  onOpenFile,
  onCancel,
}) => {
  const [confirmExternal, setConfirmExternal] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pickTemplate = (template: ConcertTemplateSummary) => {
    if (template.id === 'midi-externo' && !externalMidiEnabled) {
      setEnableError(null);
      setConfirmExternal(true);
      return;
    }
    onPick(template.id);
  };

  const enableAndPick = async () => {
    setEnabling(true);
    setEnableError(null);
    try {
      const enabled = await onEnableExternalMidi();
      if (!enabled) {
        setEnableError('Não foi possível ligar o MIDI externo. Confira as Configurações.');
        return;
      }
      setConfirmExternal(false);
      onPick('midi-externo');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <ModalShell
      label="Novo Concert"
      title="Escolha um template"
      lcd={`${templates.length} template(s)`}
      onClose={onCancel}
      maxWidth="max-w-2xl"
      zIndex="z-[60]"
      footer={
        <button onClick={onCancel} className="hw-squarebtn px-4 py-1.5 text-xs">
          Cancelar
        </button>
      }
    >
      <div className="px-5 pb-2 pt-3">
        <div className="hw-label mb-3">Template</div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onOpenFile}
            className="hw-inset flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: '#3A3A3C', color: '#fff' }}
            >
              📂
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium" style={{ color: '#F2F2F7' }}>
                Abrir arquivo…
              </span>
              <span className="block text-[11px]" style={{ color: '#9A9AA0' }}>
                Abrir um concert .preseter já existente
              </span>
            </span>
            <span style={{ color: '#9A9AA0' }}>›</span>
          </button>
          <div className="my-1 border-t" style={{ borderColor: '#3A3A3C' }} />
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => pickTemplate(template)}
              className="hw-inset flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                style={{ background: '#0A6FE0', color: '#fff' }}
              >
                {template.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium" style={{ color: '#F2F2F7' }}>{template.name}</span>
                <span className="block text-[11px]" style={{ color: '#9A9AA0' }}>{template.description}</span>
              </span>
              <span style={{ color: '#9A9AA0' }}>→</span>
            </button>
          ))}

          {confirmExternal && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: '#0A84FF', background: 'rgba(10,132,255,0.08)' }}
            >
              <div className="text-sm font-medium" style={{ color: '#F2F2F7' }}>
                Comandar um dispositivo MIDI externo?
              </div>
              <p className="mt-1 text-[11px]" style={{ color: '#9A9AA0' }}>
                O MIDI externo está desligado. Vamos ligar agora e criar o concert com teclado na tela.
              </p>
              {enableError && (
                <div className="mt-2 text-[11px] text-red-300">{enableError}</div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void enableAndPick()}
                  disabled={enabling}
                  className="rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                  style={{ background: '#0A84FF', color: '#FFFFFF' }}
                >
                  {enabling ? 'Ligando…' : 'Ligar e continuar'}
                </button>
                <button
                  onClick={() => setConfirmExternal(false)}
                  disabled={enabling}
                  className="hw-squarebtn px-3 py-1.5 text-[11px]"
                >
                  Agora não
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
