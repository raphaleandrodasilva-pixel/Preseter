import React, { useEffect } from 'react';
import { ModalShell } from '../ui/ModalShell';

interface HelpModalProps {
  onClose: () => void;
}

const SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: 'Começando',
    items: [
      'Ao abrir, o app pode mostrar os templates. Escolha um ou comece vazio.',
      'Use Arquivo → Novo Concert (Ctrl+N) para abrir o seletor novamente.',
      'Arquivo → Salvar (Ctrl+S) grava o concert; o título mostra um ponto quando há alterações.',
    ],
  },
  {
    title: 'Patch, Set e Concert',
    items: [
      'Um Concert contém Sets; cada Set contém Patches; cada Patch tem layers, mixer e controles.',
      'Clique em um patch para carregá-lo. O painel de patches permite renomear, duplicar e organizar.',
      'O botão Salvar da janela do instrumento grava os parâmetros no patch atual.',
    ],
  },
  {
    title: 'Instrumentos',
    items: [
      'Preseter Organ (setBfree), Preseter Tines (MDA ePiano) e Preseter Wurly (OpenWurli) já vêm no app.',
      'VST3/LV2: adicione pela lista de plugins ou pelos canais do set.',
      'Sampler: crie um layer de sampler e use “Abrir arquivo…” dentro da janela; não há prompt automático.',
    ],
  },
  {
    title: 'MIDI e áudio',
    items: [
      'Configure dispositivos de áudio e MIDI em Configurações.',
      'Cada layer tem faixa de notas/velocity, transpose e mapeamento de CC.',
      'MIDI externo: ative o strip de MIDI externo e escolha o dispositivo de saída.',
      'CC1 (modulação) controla o Leslie do órgão e o tremolo dos pianos elétricos.',
    ],
  },
  {
    title: 'Atalhos',
    items: [
      'Ctrl+N: novo concert (templates)',
      'Ctrl+O: abrir concert',
      'Ctrl+S: salvar',
      'Ctrl+Shift+S: salvar como',
      'Ctrl+W: fechar concert',
      'F1: esta ajuda',
    ],
  },
];

/** Ajuda rápida aberta pelo menu Ajuda (F1). */
export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalShell label="Ajuda" title="Como usar o Preseter" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4 p-5 text-xs" style={{ color: '#C6C6CB' }}>
        {SECTIONS.map((section) => (
          <section key={section.title} className="hw-inset p-3">
            <h4 className="hw-label mb-2">{section.title}</h4>
            <ul className="list-inside list-disc space-y-1">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-[10px]" style={{ color: '#8E8E93' }}>
          Dica: o menu Ajuda → Sobre mostra a versão e as licenças dos projetos usados nos
          instrumentos nativos.
        </p>
      </div>
    </ModalShell>
  );
};
