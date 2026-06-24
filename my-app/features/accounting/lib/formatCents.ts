/** Format integer cents (the on-the-wire money unit) as BRL for display. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
