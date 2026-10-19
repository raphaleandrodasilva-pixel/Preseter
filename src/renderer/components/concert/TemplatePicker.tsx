import React, { useEffect } from 'react';
import type { ConcertTemplateSummary } from '@shared/types';
import { ModalShell } from '../ui/ModalShell';

interface TemplatePickerProps {
  templates: ConcertTemplateSummary[];
  onPick: (templateId: string) => void;
  onCancel: () => void;
}

/** Seletor de template mostrado ao criar um concert novo (Fase 2.3). */
export const TemplatePicker: React.FC<TemplatePickerProps> = ({ templates, onPick, onCancel }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onPick(template.id)}
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
        </div>
      </div>
    </ModalShell>
  );
};
