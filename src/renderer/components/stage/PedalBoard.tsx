import React from 'react';

/** Prévia visual dos pedais (Fase B). Interação chega com o Composer/Fase C. */
export const PedalBoard: React.FC = () => (
  <div className="stg-pedals" title="Prévia dos pedais">
    {['Sustain', 'Expression'].map((name) => (
      <div key={name} className="stg-pedal">
        <div className="stg-pedalbody">
          <div className="stg-pedalsw" />
        </div>
        <span className="stg-pedalname">{name}</span>
      </div>
    ))}
  </div>
);
