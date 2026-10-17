import React, { useEffect } from 'react';
import type { ConcertTemplateSummary } from '@shared/types';

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{ background: '#2C2C2E', border: '1px solid #3A3A3C', boxShadow: '0 24px 60px rgba(0,0,0,0.65)' }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: '#3A3A3C' }}>
          <div className="text-sm font-semibold" style={{ color: '#F2F2F7' }}>Novo Concert</div>
          <div className="mt-0.5 text-[11px]" style={{ color: '#9A9AA0' }}>
            Escolha um template para começar. Você pode mudar tudo depois.
          </div>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onPick(template.id)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
              style={{ background: '#363638', border: '1px solid #3F3F42' }}
              onMouseEnter={(event) => (event.currentTarget.style.background = '#3F3F42')}
              onMouseLeave={(event) => (event.currentTarget.style.background = '#363638')}
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

        <div className="flex justify-end border-t px-4 py-3" style={{ borderColor: '#3A3A3C' }}>
          <button
            onClick={onCancel}
            className="hw-squarebtn px-4 py-1.5 text-xs"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
