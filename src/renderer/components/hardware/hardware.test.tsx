import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HardwareBadge, HardwareLabel, HardwarePanel } from './HardwarePanel';
import { PatchLcd } from './PatchLcd';
import { VuMeter } from './VuMeter';

describe('hardware displays', () => {
  it('formats the patch LCD program, name and tempo', () => {
    const { rerender } = render(
      <PatchLcd programNumber={4} patchName="Piano" tempo={120} />
    );
    expect(screen.getByText('005')).toBeInTheDocument();
    expect(screen.getByText('Piano')).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();

    rerender(<PatchLcd programNumber={127} patchName={null} tempo={60} />);
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Nenhum patch')).toBeInTheDocument();
  });

  it('renders the VU meter label and clamps its needle', () => {
    const { rerender } = render(<VuMeter value={0.5} />);
    expect(screen.getByText('Reverb')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    rerender(<VuMeter value={-1} label="Delay" />);
    expect(screen.getByText('Delay')).toBeInTheDocument();
    rerender(<VuMeter value={2} label="Delay" />);
    expect(screen.getByText('Delay')).toBeInTheDocument();
  });

  it('renders hardware panels with optional screws and labels', () => {
    const { container, rerender } = render(
      <HardwarePanel>
        <span>Content</span>
      </HardwarePanel>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(container.querySelectorAll('.hw-screw')).toHaveLength(4);

    rerender(
      <HardwarePanel screws={false} className="custom">
        <HardwareLabel>Label</HardwareLabel>
        <HardwareBadge title="tip">Badge</HardwareBadge>
      </HardwarePanel>
    );
    expect(container.querySelectorAll('.hw-screw')).toHaveLength(0);
    expect(container.querySelector('.hw-panel.custom')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByTitle('tip')).toHaveTextContent('Badge');
  });
});
