// @ts-check
// Luminaris frontend — LAYER-GATE lint (config SEPARADO do dev).
//
// Por que um config próprio (e não dentro de eslint.config.mjs):
// o frontend nunca foi lintado (next.config: eslint.ignoreDuringBuilds=true) e
// `eslint .` com o ruleset next produz ~6000 erros pré-existentes. Adotar aquele
// ruleset é iniciativa própria — NÃO esta fatia. Este gate roda ISOLADO: só as
// regras de camada/confinamento mecanizáveis do contrato, sem o ruleset next.
// É o análogo frontend do server/eslint.config.mjs. Spec: docs/architecture/lint-layer-gate.md
//
// CI: `eslint . --config eslint.gate.config.mjs` (npm run lint:gate).
// Dev/editor segue usando eslint.config.mjs (next lint).

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Cada entrada declara QUAL TRABALHO o `error` faz — os três não são o mesmo caso:
 *
 *  - apiClient  → BARRA: service layer (contrato §3). Só lib/services importa apiClient.
 *  - recharts   → BARRA ILHA: confinado aos wrappers de chart. Estado atual já é o correto;
 *                 o error impede que o próximo componente importe recharts cru.
 *  - dndkit /   → INVENTARIA (tripwire): NÃO há wrapper canônico único; os usos são
 *    fullcalendar  divergência de domínio SANCIONADA (boards/calendars legitimamente
 *                 diferentes). O error aqui não previne ilha — ele torna VISÍVEL a próxima
 *                 adição de path, que é onde o critério shape+posse deve ser aplicado por
 *                 julgamento. Adicionar um path ao allowlist abaixo = afirmar "isto é
 *                 divergência sancionada, não ilha". Se shape E posse forem iguais a um uso
 *                 existente, NÃO adicione — reuse aquele. NÃO se constrói wrapper único
 *                 para estas duas nesta fatia: forçar canônico onde os usos divergem acopla
 *                 coisas que só compartilham uma dependência.
 */
const RESTRICTED = {
  apiClient: {
    group: ['**/api/api-client'],
    message:
      'Service layer (contrato §3): só lib/services importa apiClient. ' +
      'Componentes/hooks chamam um *.service.ts — criar/usar um service aqui.',
  },
  recharts: {
    group: ['recharts'],
    message:
      'recharts confinado aos wrappers de chart (analytics/charts, analytics/kpi, GoldKpiWidgetView). ' +
      'Reuse o wrapper canônico — não importe recharts cru.',
  },
  dndkit: {
    group: ['@dnd-kit/*', '@dnd-kit/**'],
    message:
      'INVENTÁRIO @dnd-kit (sem wrapper único): uso sancionado de domínio. Path fora do allowlist? ' +
      'Valide shape+posse — mesmo shape/posse de um board existente = ilha, reuse aquele.',
  },
  fullcalendar: {
    group: ['@fullcalendar/*', '@fullcalendar/**'],
    message:
      'INVENTÁRIO @fullcalendar (sem wrapper único): uso sancionado de domínio. Path fora do allowlist? ' +
      'Valide shape+posse — mesmo shape/posse de um calendar existente = ilha, reuse aquele.',
  },
};

/** Re-declara no-restricted-imports com só o subconjunto de bans que vale na região. */
const restrict = (...keys) => ({
  rules: { 'no-restricted-imports': ['error', { patterns: keys.map((k) => RESTRICTED[k]) }] },
});

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'coverage/**', '**/*.config.*'],
  },
  // Parser TS + plugin registrado (regras off) para que `// eslint-disable @typescript-eslint/*`
  // pré-existentes não erre "rule not found". reportUnusedDisableDirectives off: diretivas de
  // regras que este gate não habilita não são problema desta fatia.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    languageOptions: { parser: tseslint.parser, parserOptions: { sourceType: 'module' } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    ...restrict('apiClient', 'recharts', 'dndkit', 'fullcalendar'),
  },
  // Service layer: apiClient permitido.
  {
    files: ['lib/services/**/*.{ts,tsx}', 'lib/api/**/*.{ts,tsx}'],
    ...restrict('recharts', 'dndkit', 'fullcalendar'),
  },
  // Wrappers de chart: recharts permitido (confinamento real).
  {
    files: [
      '**/analytics/charts/**/*.{ts,tsx}',
      '**/analytics/kpi/**/*.{ts,tsx}',
      'components/widgets/analytics/GoldKpiWidgetView.tsx',
    ],
    ...restrict('apiClient', 'dndkit', 'fullcalendar'),
  },
  // CRM: @dnd-kit (boards de pipeline) + @fullcalendar (MeetingsCalendar) sancionados.
  {
    files: ['features/crm/**/*.{ts,tsx}'],
    ...restrict('apiClient', 'recharts'),
  },
  // Shared dnd (CustomizeColumns/SortableColumn) + kanban canônico: @dnd-kit sancionado.
  {
    files: [
      'features/dashboard/shared/components/**/*.{ts,tsx}',
      'features/dashboard/category-views/kanban/**/*.{ts,tsx}',
    ],
    ...restrict('apiClient', 'recharts', 'fullcalendar'),
  },
  // Calendars de leads + planning: @fullcalendar sancionado.
  {
    files: ['**/leads/components/MeetingsCalendar.tsx', '**/planning/components/**/*.{ts,tsx}'],
    ...restrict('apiClient', 'recharts', 'dndkit'),
  },
);
