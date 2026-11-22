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
      'O template Guitarra já traz três patches (Clean, Crunch e Lead) com a cadeia Guitarix no Master; adicione seu VST/sampler de guitarra.',
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
      'Preseter Synth2: a coleção Fábrica traz 58 patches .sy1 do projeto; Importar/+ Pasta carrega os seus (Documentos/Preseter/Synth2).',
      'Synth2: o seletor de programas no topo também usa o banco Fábrica; Program Change não usado chega ao instrumento se a opção em Concert Settings estiver ligada.',
      'Em qualquer controle do Synth2, o botão MIDI arma o próximo CC do controlador (o mapping fica salvo no concert).',
      'VST3/LV2: adicione pela lista de plugins ou pelos canais do set.',
      'Sampler: crie um layer de sampler e use “Abrir arquivo…” dentro da janela; não há prompt automático.',
    ],
  },
  {
    title: 'Efeitos',
    items: [
      'Os efeitos Preseter (Reverb, Delay, Compressor, EQ, Chorus, Overdrive, Amp…) já vêm no app.',
      'Os efeitos de guitarra (Overdrive, Preamp, Cab, Amp, Tremolo) têm o selo GUITARIX e painel Preseter; a UI original do Guitarix não é distribuída.',
      'No insert, clique em “E” para abrir o painel Preseter; “Editor original” abre a interface do plugin.',
      'O seletor no topo traz os presets de fábrica; “+ Preset” guarda os valores atuais na sua lista.',
      'Analyzer e Tuner continuam abrindo o editor original do plugin.',
      'Para controlar um efeito por MIDI: Mapeamentos → Destino “Parâmetro de plugin” → escolha o insert.',
    ],
  },
  {
    title: 'Preseter Drums',
    items: [
      'Adicione o Preseter Drums como instrumento. O kit padrão é o MuseScore_General (MIT), baixado pela Loja.',
      'Toque as notas 36..51 pelo teclado MIDI ou clique nos pads da janela para pré-ouvir.',
      'Na grade, clique liga/desliga o passo; arraste na vertical para a velocity; clique direito/duplo cria acento.',
      'Barra de topo: liga/desliga o sequenciador, resolução (8/12/16/32), compassos (1/2/4), swing, volume e Limpar padrão.',
      'O seletor de padrão de fábrica traz rock, pop, funk, shuffle, balada, bossa, samba e eletrônico (dados do projeto).',
      'O botão ▶ Tocar / ■ Parar usa o transporte do concert (e liga o sequenciador ao tocar); Stop volta ao compasso 1.',
      'Kit: “Trocar kit (SF2/SFZ)…” escolhe o arquivo, e Banco/Programa aplicam outro kit do mesmo arquivo.',
      'O botão … de cada linha escolhe um SF2/SFZ, banco, programa e nota só para aquele pad; “Usar kit” volta ao kit do layer.',
      'Padrões, kit, samples por pad e volumes ficam salvos no patch; M/S fazem mudo/solo do pad.',
    ],
  },
  {
    title: 'Créditos',
    items: [
      'Preseter Organ: setBfree (GPL-2.0-or-later).',
      'Preseter Tines, Piano, DX10 e JX10: MDA / Paul Kellett, porte JUCE de M.I. Hollemans (MIT).',
      'Preseter Wurly: OpenWurli (GPL-3.0-or-later).',
      'Preseter Synth2: Oxo Synth2, François Chabloz (chab), sl23 e Eufex (MIT). Recriação do Synth1 de Daichi Laboratory; nenhum código ou arte do original.',
      'Preseter Drums: kit MuseScore_General, S. Christian Collins / FluidR3 (MIT); ver docs/LICENCAS.md.',
      'Efeitos Preseter: calfnXT / Calf Studio Gear, fork boomshop/calfnxt (GPL-3.0-or-later).',
      'Efeitos de guitarra: Guitarix (GPL-3.0-or-later), com zita-convolver/resampler (GPL-3.0-or-later) e FFTW (GPL-2.0-or-later).',
      'Ajuda → Sobre mostra a versão e a lista completa de licenças.',
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
