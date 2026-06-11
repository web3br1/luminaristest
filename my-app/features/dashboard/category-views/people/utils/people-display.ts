/**
 * people-display.ts — Display helpers shared by PeopleRow and PersonCard.
 * Module-level, pure functions — zero dependencies.
 */

export const AVATAR_COLORS = [
    'bg-blue-500',
    'bg-purple-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-pink-500',
];

/** Gera as iniciais (até 2 letras) do nome completo. */
export function getInitials(name: string): string {
    return name
        .split(' ')
        .slice(0, 2)
        .map(n => n[0] || '')
        .join('')
        .toUpperCase();
}

/**
 * Retorna uma classe Tailwind de cor de fundo para o avatar,
 * determinística com base no nome.
 */
export function getAvatarColor(name: string): string {
    const hash =
        (name.charCodeAt(0) || 0) +
        (name.charCodeAt(1) || 0) +
        (name.charCodeAt(2) || 0);
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
