---
name: backend-test-suite-generator
description: Gera suítes Jest para service, repository, KPI processor e middleware — com mocks padronizados, factory builders e asserções de segurança
argument-hint: "[tipo: service|repository|kpi-processor|middleware|security] [nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Test Suite Generator

## Purpose

Gera arquivos `.test.ts` / `.spec.ts` alinhados com os padrões de teste reais do repositório: factory builders, `jest.clearAllMocks()` no `beforeEach`, `toBeCloseTo` para floats, e asserções de segurança (tenant isolation, LGPD). É a skill correta quando o usuário pede "quero testes para X" ou quando um KPI processor novo precisa de cobertura de regressão.

## When to use

- Novo KPI processor criado via `analytics-kpi-generator` — adicionar suíte de regressão
- Novo service criado via `backend-service-generator` — testar happy path + error cases
- Testar isolamento de tenant em nova feature multi-usuário
- Testar middleware de autenticação/autorização
- QA gate antes de PR de feature crítica

## Inputs

- `$ARGUMENTS[0]`: tipo — `service` | `repository` | `kpi-processor` | `middleware` | `security`
- `$ARGUMENTS[1]`: nome do recurso em PascalCase (ex: `Appointments`, `RevenueKpi`)

## Repository patterns to inspect first

```
server/src/features/analytics/kpis/revenue/__tests__/RevenueKpiProcessor.test.ts   ← KPI processor gold standard
server/src/features/documents/__tests__/rag-tenant-isolation.test.ts               ← security / mock service
server/src/features/users/__tests__/user-deletion-qdrant.test.ts                   ← service + LGPD
server/src/features/chatInstances/__tests__/tenant-isolation.test.ts               ← repository isolation
server/src/middleware/__tests__/auth.test.ts                                        ← middleware pattern
server/src/features/dynamicTables/__tests__/transaction-rollback.test.ts           ← transaction integrity
server/jest.config.js                                                               ← test runner config
```

## Generation contract — KPI Processor test

Localização: `server/src/features/analytics/kpis/<category>/__tests__/<Name>KpiProcessor.test.ts`

> **Contrato real** (verificado contra `RevenueKpiProcessor.test.ts` e `SalesProfitByProductProcessor.test.ts`):
> - Rows têm shape `{ id, data: { ...campos } }` — o processor lê `row.data[field]`
> - O processor recebe um `context` (tipado `AnalyticsProcessorContext`; nos testes é comum usar `: any` no baseContext)
> - Retorna `ChartDataPoint[]` onde cada ponto é `{ name, value, previousValue? }` — identifica-se por `name`, **não** por `id`
> - `referenceDate` vai dentro de `params`

```typescript
import { <name>KpiProcessor } from '../<Name>KpiProcessor';

describe('<Name>KpiProcessor (QA Gold Standard)', () => {
  const referenceDate = new Date('2026-02-01T12:00:00Z'); // fixo para reprodutibilidade

  // Mock rows no shape real: { id, data: {...} }
  const mockRows = [
    { id: '1', data: { amount: 'R$ 1.500,00', date: '2026-01-15T10:00:00Z', status: 'paid' } },
    { id: '2', data: { amount: 500,           date: '2026-01-20T10:00:00Z', status: 'pending' } },
    { id: '3', data: { amount: -100,          date: '2026-01-22T10:00:00Z', status: 'cancelled' } }, // excluído
  ];

  // baseContext — params espelham o template do KPI. `: any` é o padrão nos testes reais.
  const baseContext: any = {
    rows: mockRows,
    params: {
      amountField: 'amount',
      dateField: 'date',
      statusField: 'status',
      excludeStatuses: ['cancelled'],
      referenceDate,
      timeZone: 'America/Sao_Paulo',
      datePreset: 'lastMonth',
    },
    fetchByPresetTableKey: async () => ({ rows: [] }), // cross-table default: vazio
  };

  describe('Math Suite', () => {
    it('acumula valores corretamente excluindo status inválidos', async () => {
      const results = await <name>KpiProcessor(baseContext);
      const kpi = results.find(p => p.name === '<Nome do KPI>');
      expect(kpi?.value).toBeCloseTo(2000, 2); // 1500 + 500, -100 excluído
    });

    it('previousValue é undefined quando não há dados no período anterior', async () => {
      const results = await <name>KpiProcessor(baseContext);
      const kpi = results.find(p => p.name === '<Nome do KPI>');
      expect(kpi?.previousValue === undefined || typeof kpi?.previousValue === 'number').toBe(true);
    });
  });

  describe('Float Safety Suite', () => {
    it('1000 × R$0,10 = R$100,00 exatos (sem drift de ponto flutuante)', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i), data: { amount: 'R$ 0,10', date: '2026-01-10T10:00:00Z', status: 'paid' },
      }));
      const results = await <name>KpiProcessor({ ...baseContext, rows });
      const kpi = results.find(p => p.name === '<Nome do KPI>');
      expect(kpi?.value).toBeCloseTo(100, 2);
    });
  });

  describe('Empty Safety Suite', () => {
    it('retorna valores finitos (não NaN nem Infinity) com rows vazios', async () => {
      const results = await <name>KpiProcessor({ ...baseContext, rows: [] });
      results.forEach(p => {
        expect(Number.isFinite(p.value ?? 0)).toBe(true);
      });
    });
  });

  describe('Timezone Suite', () => {
    it('aloca transação de meia-noite UTC ao dia anterior no fuso do usuário', async () => {
      // 2026-04-01T02:59:00Z = 2026-03-31T23:59:00 em America/Sao_Paulo (UTC-3)
      const midnightRow = { id: '99', data: { amount: 1000, date: '2026-04-01T02:59:00Z', status: 'paid' } };
      const results = await <name>KpiProcessor({
        ...baseContext,
        rows: [midnightRow],
        params: { ...baseContext.params, referenceDate: new Date('2026-04-15T00:00:00Z') },
      });
      const kpi = results.find(p => p.name === '<Nome do KPI>');
      expect(kpi?.value).toBeGreaterThan(0); // contado em março (lastMonth), não abril
    });
  });
});
```

## Generation contract — Service test

Localização: `server/src/features/<resource>/services/__tests__/<Resource>Service.test.ts`

```typescript
import { <Resource>Service } from '../<Resource>Service';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

// Mocks
const mockRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};
const mockPolicy = {
  canView: jest.fn().mockReturnValue(true),
  canCreate: jest.fn().mockReturnValue(true),
  canUpdate: jest.fn().mockReturnValue(true),
  canDelete: jest.fn().mockReturnValue(true),
  canListAll: jest.fn().mockReturnValue(false),
};
const mockUser = { id: 'user-1', role: 'USER' as const };

// Factory builder — padrão consistente em todo o repositório
function buildService(overrides: Partial<typeof mockRepo> = {}) {
  return new <Resource>Service({ ...mockRepo, ...overrides }, mockPolicy);
}

describe('<Resource>Service', () => {
  beforeEach(() => jest.clearAllMocks()); // isolar estado entre testes

  describe('getById', () => {
    it('retorna o recurso quando o usuário tem acesso', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'res-1', userId: 'user-1' });
      const svc = buildService();
      const result = await svc.getById(mockUser, 'res-1');
      expect(result.id).toBe('res-1');
    });

    it('lança NotFoundError quando não existe', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const svc = buildService();
      await expect(svc.getById(mockUser, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('lança ForbiddenError quando policy nega acesso', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'res-1', userId: 'other' });
      const svc = buildService();
      mockPolicy.canView.mockReturnValueOnce(false);
      await expect(svc.getById(mockUser, 'res-1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('softDelete', () => {
    it('marca deletedAt sem remover o registro', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'res-1', userId: 'user-1' });
      const svc = buildService();
      await svc.delete(mockUser, 'res-1');
      expect(mockRepo.softDelete).toHaveBeenCalledWith('res-1');
    });
  });
});
```

## Generation contract — Security / Tenant Isolation test

```typescript
import { <Resource>Service } from '../<Resource>Service';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

jest.mock('@/lib/prisma');  // isolar db

describe('<Resource> tenant isolation', () => {
  const userA = { id: 'user-a', role: 'USER' as const };
  const userB = { id: 'user-b', role: 'USER' as const };

  it('lança NotFoundError (não ForbiddenError) ao acessar recurso de outro usuário', async () => {
    // NotFoundError: não revelar que o recurso existe — previne enumeration attack
    const repo = { findById: jest.fn().mockResolvedValue({ id: 'r1', userId: 'user-a' }) };
    const svc = buildService(repo);
    await expect(svc.getById(userB, 'r1')).rejects.toThrow(NotFoundError);
  });

  it('repositório é chamado com userId correto', async () => {
    const repo = { findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const svc = buildService(repo);
    await svc.getAll(userA, { page: 1, limit: 10 });
    expect(repo.findAll).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }));
  });
});
```

## Files usually created or changed

```
server/src/features/<resource>/services/__tests__/<Resource>Service.test.ts         ← NEW
server/src/features/analytics/kpis/<cat>/__tests__/<Name>KpiProcessor.test.ts      ← NEW
server/src/middleware/__tests__/<middleware>.test.ts                                 ← NEW
server/src/features/<resource>/__tests__/tenant-isolation.test.ts                  ← NEW
```

## Required checks

```bash
cd server && npx jest --testPathPattern="<ResourceName>" --passWithNoTests
cd server && npx tsc --noEmit
```

## Frontend test suite (Vitest + Testing Library)

O `my-app` **tem runner** (Vitest + Testing Library, React 19, jsdom) — config em `my-app/vitest.config.ts` (alias `@`→raiz, `globals`, setup com `@testing-library/jest-dom`), rodar com `npm test` (`vitest run`). Gere testes frontend para hooks, componentes presentational e libs puras.

- **Hooks** (`useX`): `renderHook` + `waitFor` de `@testing-library/react`; mocke o módulo de service que o hook importa. Cubra happy-path + erro/vazio + mudança de input que re-dispara fetch.
- **Componentes presentational**: `render` + `screen.getByText/role`; asserte conteúdo e variações de prop (tone/variante/fallback de status desconhecido).
- **Libs puras** (ex.: paginação `fetchAllRows`): mocke a dependência de service e teste a lógica (acumular páginas, guard de limite, degradação para `[]`).

Gotchas (aprendidos no CRM):
- **`import React from 'react'`** no topo dos testes `.tsx` — o transform de teste usa JSX runtime clássico (sem isso, `React is not defined`).
- **`vi.mock` com FÁBRICA que retorna objeto FRESCO por chamada** (`mockImplementation(() => Promise.resolve(freshObj()))`); `mockResolvedValue(sharedObj)` compartilha a MESMA referência entre chamadas e pode causar bugs (ex.: spread auto-referencial → stack overflow).
- **Caminho do `vi.mock` é resolvido relativo ao arquivo de teste** (mesmo módulo que o SUT importa, recontado a partir de `__tests__/`).
- **`vi.clearAllMocks()` em `beforeEach`**.

Required check (frontend): `cd my-app && npx vitest run`. Arquivos: `my-app/**/__tests__/*.test.ts(x)`.

## Anti-patterns

- **Não use `jest.mock()` em KPI processors** — eles são funções puras que recebem rows; chamar diretamente com dados mock é mais fiel ao runtime
- **Não mocke `DataSanitizer`** — é uma lib utilitária determinística; testá-la indiretamente via KPI processor é o padrão do repositório
- **Não esqueça `jest.clearAllMocks()` em `beforeEach`** — mocks sem clear entre testes causam vazamento de estado
- **Não use `ForbiddenError` em cross-tenant** — use `NotFoundError` para não revelar existência de recursos de outros usuários (enumeration attack)
- **Não hardcode datas relativas** — use `referenceDate: new Date('YYYY-MM-DDT00:00:00Z')` fixo para garantir reprodutibilidade independente de quando o teste roda
- **Não teste apenas happy path** — todo service test deve incluir: NotFoundError, ForbiddenError, e validação de input inválido
- **Não use `toEqual` para floats** — sempre `toBeCloseTo(value, 2)` para valores monetários calculados
