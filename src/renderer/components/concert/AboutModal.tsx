import React, { useEffect, useState } from 'react';
import { ModalShell } from '../ui/ModalShell';

interface AboutModalProps {
  onClose: () => void;
}

const PROJECTS = [
  { name: 'Preseter', license: 'AGPL-3.0-or-later', use: 'Aplicativo' },
  { name: 'setBfree', license: 'GPL-2.0-or-later', use: 'Preseter Organ' },
  { name: 'MDA ePiano (porte JUCE MIT)', license: 'MIT', use: 'Preseter Tines' },
  { name: 'MDA Piano (porte JUCE MIT)', license: 'MIT', use: 'Preseter Piano' },
  { name: 'MDA DX10 (porte JUCE MIT)', license: 'MIT', use: 'Preseter DX10' },
  { name: 'MDA JX10 (porte JUCE MIT)', license: 'MIT', use: 'Preseter JX10' },
  { name: 'OpenWurli', license: 'GPL-3.0-or-later', use: 'Preseter Wurly' },
  { name: 'Oxo Synth2 (Synth2)', license: 'MIT', use: 'Preseter Synth2' },
  { name: 'Dexed (Pascal Gauthier)', license: 'GPL-3.0', use: 'Preseter Dexed' },
  { name: 'ZynAddSubFX (Nasca Octavian Paul)', license: 'GPL-2.0-or-later', use: 'Preseter Zyn' },
  { name: 'tuning-library (Surge Synth Team)', license: 'MIT', use: 'Dentro do Dexed' },
  { name: 'MTS-ESP Client (ODDSound)', license: 'MIT', use: 'Dentro do Dexed' },
  { name: 'Mini-XML (mxml)', license: 'Apache-2.0', use: 'Dentro do Preseter Zyn' },
  { name: 'rtosc', license: 'MIT', use: 'Dentro do Preseter Zyn' },
  { name: 'MuseScore_General (S. Christian Collins / FluidR3)', license: 'MIT', use: 'Kit do Preseter Drums' },
  { name: 'calfNXT / Calf Studio Gear', license: 'GPL-3.0-or-later', use: 'Efeitos Preseter' },
  { name: 'Guitarix', license: 'GPL-3.0-or-later', use: 'Efeitos Preseter de guitarra' },
  { name: 'zita-convolver / zita-resampler', license: 'GPL-3.0-or-later', use: 'Dentro do Guitarix' },
  { name: 'FFTW', license: 'GPL-2.0-or-later', use: 'Dentro do Guitarix' },
  { name: 'Element', license: 'GPL-3.0-or-later', use: 'Referência de áudio ASIO/WASAPI' },
  { name: 'JUCE', license: 'AGPL-3.0 / comercial', use: 'Motor e interface' },
];

/** Janela "Sobre o Preseter" aberta pelo menu Ajuda. */
export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.electronAPI.getAppVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalShell label="Sobre" title="Preseter" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5 p-5 text-xs" style={{ color: '#C6C6CB' }}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Performance ao vivo para tecladistas</p>
          <p>
            Aplicativo de performance ao vivo estilo Mainstage e Gig Performer: organize patches,
            sets e concerts, carregue VST3/LV2, use o sampler, o MIDI externo e os instrumentos
            nativos do Preseter.
          </p>
          {version && (
            <p className="font-mono text-[10px]" style={{ color: '#8E8E93' }}>
              Versão {version}
            </p>
          )}
        </div>

        <section className="hw-inset p-3">
          <h4 className="hw-label mb-2">Projetos e licenças</h4>
          <ul className="space-y-1.5">
            {PROJECTS.map((project) => (
              <li key={project.name} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-white">
                  {project.name}
                  <span className="ml-2 font-normal" style={{ color: '#8E8E93' }}>
                    {project.use}
                  </span>
                </span>
                <span className="font-mono text-[10px]" style={{ color: '#8E8E93' }}>
                  {project.license}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-[10px]" style={{ color: '#8E8E93' }}>
          O Preseter é distribuído sob AGPL-3.0-or-later. As licenças completas dos projetos de
          terceiros acompanham o instalador na pasta <span className="font-mono">licenses</span>.
        </p>
      </div>
    </ModalShell>
  );
};
