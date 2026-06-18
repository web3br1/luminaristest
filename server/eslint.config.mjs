// @ts-check
// Luminaris server — LAYER-GATE lint.
//
// Escopo deliberadamente mínimo: este config NÃO adota o ruleset recomendado do
// typescript-eslint (o backend nunca foi lintado; ligá-lo vermelharia o CI com
// centenas de findings fora do escopo desta fatia). Ele liga SÓ as regras de
// CAMADA mecanizáveis do contrato (.claude/skills/_ARCHITECTURE-CONTRACT.md §2),
// transformando convenção em gate determinístico. Spec: docs/architecture/lint-layer-gate.md
//
// Pagamento de dívida e ampliação do ruleset são fatias próprias — não aqui.

import tseslint from 'typescript-eslint';

/**
 * R1 — Singleton Prisma confinado a Repository.
 * Repository é a única camada com acesso a `prisma.*` (contrato §2). Controllers
 * e Services orquestram via repository. `import type` de `generated/prisma` (tipos)
 * NÃO é alvo — só o singleton de acesso a dados (`lib/prisma`, default export).
 */
const PRISMA_SINGLETON = {
  group: ['@/lib/prisma', '**/lib/prisma', '*/lib/prisma'],
  message:
    'Layer boundary (contrato §2): só Repository importa o singleton Prisma. ' +
    'Mover este acesso para um Repository — controllers/services não falam com Prisma direto.',
};

/**
 * R1b — Service não conhece Express.
 * Service é regra de negócio pura: sem req/res/Express (contrato §2). HTTP fica no Controller.
 */
const EXPRESS = {
  name: 'express',
  message: 'Layer boundary (contrato §2): Service não importa Express (sem req/res). HTTP fica no Controller.',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'generated/**', 'node_modules/**', 'coverage/**', '**/*.js', '**/*.mjs'],
  },
  // Parser TS para todo o src, sem regras de base (slice = só camada).
  // O plugin @typescript-eslint é REGISTRADO mas suas regras ficam TODAS off:
  // o codebase já tem `// eslint-disable @typescript-eslint/no-explicit-any` espalhados;
  // sem o plugin registrado o eslint 9 erraria "rule not found" nessas diretivas.
  // reportUnusedDisableDirectives=off: diretivas de regras que esta fatia não habilita
  // (no-var, no-control-regex…) não são problema desta fatia.
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module' },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {},
  },
  // Controllers: proibido importar o singleton Prisma (Express é legítimo aqui).
  {
    files: ['src/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [PRISMA_SINGLETON] }],
    },
  },
  // Services: proibido Prisma singleton + Express.
  {
    files: ['src/**/services/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [PRISMA_SINGLETON], paths: [EXPRESS] }],
    },
  },
  // Testes não são camada de produção — fora do gate.
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
