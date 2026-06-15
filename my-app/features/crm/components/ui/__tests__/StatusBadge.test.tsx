import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { StatusBadge } from '../StatusBadge';

// Tom de fallback aplicado a status fora do mapa (mesmo do componente).
const FALLBACK_TONE = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';

describe('StatusBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renderiza o texto do status', () => {
    render(<StatusBadge status="Won" />);
    expect(screen.getByText('Won')).toBeInTheDocument();
  });

  it('sempre aplica as classes estruturais do pill', () => {
    render(<StatusBadge status="Open" />);
    const badge = screen.getByText('Open');
    expect(badge).toHaveClass(
      'rounded-full',
      'border',
      'px-2',
      'py-0.5',
      'text-[10px]',
      'font-black',
      'uppercase',
      'tracking-widest',
    );
  });

  it('aplica o tom verde (emerald) para status de sucesso', () => {
    render(<StatusBadge status="Won" />);
    const badge = screen.getByText('Won');
    expect(badge).toHaveClass(
      'bg-emerald-500/10',
      'text-emerald-600',
      'dark:text-emerald-400',
      'border-emerald-500/20',
    );
  });

  it('aplica o tom vermelho (rose) para status de perda', () => {
    render(<StatusBadge status="Lost" />);
    const badge = screen.getByText('Lost');
    expect(badge).toHaveClass(
      'bg-rose-500/10',
      'text-rose-600',
      'dark:text-rose-400',
      'border-rose-500/20',
    );
  });

  it('aplica o tom cinza (gray) para Draft', () => {
    render(<StatusBadge status="Draft" />);
    const badge = screen.getByText('Draft');
    expect(badge).toHaveClass(
      'bg-gray-500/10',
      'text-gray-600',
      'dark:text-gray-300',
      'border-gray-500/20',
    );
  });

  it('aplica o tom âmbar (amber) para Expired', () => {
    render(<StatusBadge status="Expired" />);
    const badge = screen.getByText('Expired');
    expect(badge).toHaveClass(
      'bg-amber-500/10',
      'text-amber-600',
      'dark:text-amber-400',
      'border-amber-500/20',
    );
  });

  it('mapeia múltiplos status para o mesmo tom (Accepted → emerald)', () => {
    render(<StatusBadge status="Accepted" />);
    const badge = screen.getByText('Accepted');
    expect(badge).toHaveClass('bg-emerald-500/10', 'border-emerald-500/20');
  });

  it('usa o tom de fallback (blue) para status desconhecido', () => {
    render(<StatusBadge status="SomethingWeird" />);
    const badge = screen.getByText('SomethingWeird');
    FALLBACK_TONE.split(' ').forEach((cls) => expect(badge).toHaveClass(cls));
  });

  it('renderiza string vazia sem quebrar e ainda aplica o fallback', () => {
    const { container } = render(<StatusBadge status="" />);
    const badge = container.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('');
    FALLBACK_TONE.split(' ').forEach((cls) => expect(badge).toHaveClass(cls));
  });
});
