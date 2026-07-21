Escrevi o runbook completo em `C:/Users/smurf/Downloads/Luminaris/.claude/worktrees/council-accounting-decisions-42aa3c/docs/crm/VALIDATION-KIT-D6.md`. Segue o markdown integral:

---

# KIT DE VALIDAÇÃO D6 — Runbook executável para o DONO

**Autor: QA/validação + COO · 2026-07-20 · deriva do BOARD v2 (`docs/crm/COUNCIL-BOARD-CRM-2026-07-20-v2-complementary.md`, seção "KIT DE VALIDAÇÃO").**

> **Nenhum agente fecha este gate.** Cada prova diz explicitamente se um passo é **[SCRIPT]** (roda sozinho, comando dado) ou **[APP-VIVO + LOGIN HUMANO]** (exige o servidor de pé e uma sessão autenticada de verdade — o agente não tem cookie nem token válido). O critério de aceite de cada prova é uma **asserção objetiva**: um número, um status HTTP, ou a presença/ausência de um lançamento. Se a asserção falhar, o achado do board está confirmado vivo.

---

## 0. Verdade em duas linhas

1. Este kit falsifica de uma vez os **4 achados de dinheiro do seam** (duplo-cego, re-Won/drift, Won-sem-unitId, idempotência de proposta), o **fetch-all OOM** e os **2 furos de segurança** — mas **só roda depois do backfill de dado**, e o backfill **nunca adivinha unidade** (unidade errada mis-roteia receita para o razão da unidade errada, um erro pior que não bookar).
2. **Grau de evidência:** tudo abaixo é *procedimento verificado contra o código-fonte* (rotas, DTOs, service, schema lidos nesta sessão) — mas o resultado de cada prova só vira fato **quando você rodar contra o app vivo**. O board é leitura de código; este kit é o que transforma leitura em execução.

---

## Pré-voo (uma vez, antes de qualquer prova) — [SCRIPT]

O worktree pode não ter dependências e o client Prisma pode estar defasado em relação ao schema do branch (memória `worktree-deps-stale-prisma-client`). Rode na raiz do `server/`:

```bash
cd C:/Users/smurf/Downloads/Luminaris/.claude/worktrees/council-accounting-decisions-42aa3c/server
npm ci
npx prisma generate      # regenera o client em server/generated/prisma contra o schema do branch
```

**Fatos de ambiente que os scripts assumem (verificados no repo):**

| Fato | Valor |
|---|---|
| DB populado real | `server/prisma/prisma/dev.db` (~950 KB, path aninhado). `server/prisma/dev.db` tem **0 bytes** — é chamariz. |
| `DATABASE_URL` (relativo ao schema) | `file:./prisma/dev.db` → resolve para o aninhado |
| Client Prisma gerado | `server/generated/prisma` (output custom; `@prisma/client` NÃO funciona) |
| Leads | linhas de `DynamicTableData` cujo `dynamicTable.internalName = 'leads'`; o `unitId` mora **dentro do JSON `data`** |
| Units | linhas de `DynamicTableData` cujo `dynamicTable.internalName = 'units'`; a **id da linha** da unit é o que entra em `lead.data.unitId`; nome em `data.name` |
| Mesmo tenant | mesma `DynamicTable.userId` (leads e units do mesmo usuário) |
| Won → razão | debita `1.1.2`, credita `3.1`; dedup por `sourceId = opportunityId` (re-Won não re-booka) |
| Auth | `POST /api/auth/login` → `data.token`; usar header `Authorization: Bearer <token>` |

> **Faça uma cópia de trabalho antes de escrever** (o backfill e o seed MUTAM o dev.db). `*.db` está no `.gitignore` do server, então cópias não sujam commits:
> ```bash
> cp server/prisma/prisma/dev.db server/prisma/prisma/dev.backup-$(date +%Y%m%d).db
> ```

---

## PROVA 0 — Pré-requisito de dado (backfill + seed) — [SCRIPT]

Três sub-passos. **0.A é bloqueante**: as provas 2–4 não significam nada se leads que chegam a Won não têm unidade por acidente em vez de por teste.

### 0.A — Backfill dos ~80 `unitId` nulos SOB REGRA DE TENANCY EXPLÍCITA

**Regra dura (não-negociável):** o script **nunca** infere a unidade. Ele resolve um lead-sem-unidade por exatamente um de dois caminhos:
1. **Mapeamento explícito** `LEAD_UNIT_MAP[leadRowId] = unitRowId` que **você** preenche; ou
2. **Unidade do owner só se inequívoca** — se o tenant tem **exatamente uma** unit E você ligou `ALLOW_SINGLE_UNIT_AUTOFILL`.

Qualquer lead não coberto por (1) ou (2) fica **UNRESOLVED** e o script **não escreve nada** nele — ele imprime os candidatos para você preencher o mapa. Ele também **recusa** escrever um `unitId` que não pertença ao conjunto de units daquele tenant (guarda anti-mis-route cross-tenant).

Salve como `server/scripts/backfill-lead-unit.mjs`:

```javascript
// server/scripts/backfill-lead-unit.mjs
// Backfill de lead.data.unitId SOB REGRA DE TENANCY EXPLÍCITA. Nunca adivinha.
// Uso:
//   1) DRY_RUN=true  -> só relatório (resolvidos + UNRESOLVED com candidatos)
//   2) preencha LEAD_UNIT_MAP com os UNRESOLVED (ou ligue ALLOW_SINGLE_UNIT_AUTOFILL se 1 unit)
//   3) DRY_RUN=false -> aplica
// Rodar: cd server && node scripts/backfill-lead-unit.mjs
import { PrismaClient } from '../generated/prisma/index.js';

// aponta o Prisma ao DB aninhado real (relativo ao schema em server/prisma/)
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const prisma = new PrismaClient();

// ----------------------- CONFIG QUE VOCÊ EDITA -----------------------
const DRY_RUN = true;                       // true = não escreve nada
const TENANT_EMAIL = null;                  // ex.: 'admin@example.com' p/ 1 tenant; null = todos
const ALLOW_SINGLE_UNIT_AUTOFILL = false;   // true SÓ se aceita atribuir a unit única do tenant
const LEAD_UNIT_MAP = {
  // 'clu_leadRowId...': 'clu_unitRowId...',   // mapeamento explícito lead -> unit
};
// ---------------------------------------------------------------------

const emptyUnit = (v) => v == null || (typeof v === 'string' && v.trim() === '');

async function main() {
  const leadTables = await prisma.dynamicTable.findMany({
    where: {
      internalName: 'leads',
      ...(TENANT_EMAIL ? { user: { email: TENANT_EMAIL } } : {}),
    },
    select: { id: true, userId: true },
  });

  let resolved = 0, unresolved = 0, refusedCrossTenant = 0;
  const toWrite = []; // { rowId, newUnitId }

  for (const lt of leadTables) {
    // units DESTE tenant (mesmo userId) — a fonte legítima de unidade
    const unitTable = await prisma.dynamicTable.findFirst({
      where: { userId: lt.userId, internalName: 'units' },
      select: { id: true },
    });
    const unitRows = unitTable
      ? await prisma.dynamicTableData.findMany({
          where: { dynamicTableId: unitTable.id, deletedAt: null },
          select: { id: true, data: true },
        })
      : [];
    const unitIds = new Set(unitRows.map((u) => u.id));

    const leads = await prisma.dynamicTableData.findMany({
      where: { dynamicTableId: lt.id, deletedAt: null },
      select: { id: true, data: true },
    });

    for (const lead of leads) {
      const d = lead.data ?? {};
      if (!emptyUnit(d.unitId)) continue; // já tem unidade

      let target = LEAD_UNIT_MAP[lead.id];
      let via = 'MAP';
      if (!target && ALLOW_SINGLE_UNIT_AUTOFILL && unitRows.length === 1) {
        target = unitRows[0].id;
        via = 'SINGLE-UNIT-OWNER';
      }

      if (!target) {
        unresolved++;
        console.log(
          `UNRESOLVED lead=${lead.id} tenant=${lt.userId} — candidatos: ` +
            (unitRows.length
              ? unitRows.map((u) => `${u.id}("${u.data?.name ?? '?'}")`).join(', ')
              : '(tenant SEM units — crie uma unit antes)'),
        );
        continue;
      }

      // GUARDA anti-mis-route: a unit alvo TEM de ser deste tenant
      if (!unitIds.has(target)) {
        refusedCrossTenant++;
        console.log(`RECUSADO lead=${lead.id}: unit ${target} não pertence ao tenant ${lt.userId}`);
        continue;
      }

      resolved++;
      console.log(`RESOLVE lead=${lead.id} -> unit=${target} (via ${via})`);
      toWrite.push({ rowId: lead.id, newUnitId: target, prev: lead.data ?? {} });
    }
  }

  console.log(`\n== Resumo == resolved=${resolved} unresolved=${unresolved} refusedCrossTenant=${refusedCrossTenant} dryRun=${DRY_RUN}`);

  if (!DRY_RUN && toWrite.length) {
    for (const w of toWrite) {
      await prisma.dynamicTableData.update({
        where: { id: w.rowId },
        data: { data: { ...w.prev, unitId: w.newUnitId } },
      });
    }
    console.log(`Escritos ${toWrite.length} leads.`);
  }
  if (unresolved > 0) {
    console.log('\n>>> Há leads UNRESOLVED. Preencha LEAD_UNIT_MAP (ou ALLOW_SINGLE_UNIT_AUTOFILL) e rode de novo. NÃO prossiga com backfill parcial se as provas dependem desses leads.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

**Passos numerados:**
1. `cd server && node scripts/backfill-lead-unit.mjs` com `DRY_RUN=true` — lê o relatório.
2. Para cada linha `UNRESOLVED`, decida a unidade correta (pergunte ao dono do negócio qual unidade aquele lead pertence) e preencha `LEAD_UNIT_MAP`. Se o tenant só tem UMA unidade e você aceita, ligue `ALLOW_SINGLE_UNIT_AUTOFILL`.
3. Rode de novo com `DRY_RUN=true` até `unresolved=0`.
4. Troque para `DRY_RUN=false` e rode para aplicar.

**CRITÉRIO DE ACEITE (asserção) — [SCRIPT]:** rode a verificação SQL abaixo; o resultado deve ser **0**.

```bash
# conte leads com unitId nulo/vazio nas tabelas 'leads'
sqlite3 server/prisma/prisma/dev.db "
SELECT count(*) AS leads_sem_unit
FROM dynamic_table_data d
JOIN dynamic_tables t ON t.id = d.dynamicTableId
WHERE t.internalName='leads' AND d.deletedAt IS NULL
  AND (json_extract(d.data,'\$.unitId') IS NULL OR json_extract(d.data,'\$.unitId')='');
"
```
Aceite: `leads_sem_unit = 0`. (Se você propositalmente deixou 1 lead sem unit para a PROVA 4, deixe-o de fora e documente qual é — mas o backfill dos ~80 legítimos tem de zerar.)

### 0.B — Seed >200 linhas em UMA tabela + >1 pipeline com etapas

Salve como `server/scripts/seed-validation.mjs`. Semeia direto via Prisma (bypassa a engine — aceitável para popular volume de leitura). `ROW_COUNT=2500` já satisfaz **também a PROVA 6** (>2000 linhas).

```javascript
// server/scripts/seed-validation.mjs
// Semeia N leads numa tabela 'leads' + 2 pipelines com etapas (inclui closed_won).
// Rodar: cd server && node scripts/seed-validation.mjs
import { PrismaClient } from '../generated/prisma/index.js';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const prisma = new PrismaClient();

const ROW_COUNT = Number(process.env.ROW_COUNT ?? 2500); // >2000 p/ prova 6
const TENANT_EMAIL = process.env.TENANT_EMAIL ?? null;   // null = 1º tenant com leads

async function main() {
  const leadTable = await prisma.dynamicTable.findFirst({
    where: { internalName: 'leads', ...(TENANT_EMAIL ? { user: { email: TENANT_EMAIL } } : {}) },
    select: { id: true, userId: true },
  });
  if (!leadTable) throw new Error('Nenhuma tabela leads encontrada. Instale o preset CRM primeiro.');

  const unitTable = await prisma.dynamicTable.findFirst({
    where: { userId: leadTable.userId, internalName: 'units' }, select: { id: true },
  });
  const unit = unitTable && await prisma.dynamicTableData.findFirst({
    where: { dynamicTableId: unitTable.id, deletedAt: null }, select: { id: true },
  });
  if (!unit) throw new Error('Tenant sem unit — crie ao menos uma unit antes (unitId é obrigatório).');

  // >1 pipeline
  const pipeTable = await prisma.dynamicTable.findFirst({
    where: { userId: leadTable.userId, internalName: 'leadPipelines' }, select: { id: true },
  });
  const stageTable = await prisma.dynamicTable.findFirst({
    where: { userId: leadTable.userId, internalName: 'leadStages' }, select: { id: true },
  });
  if (!pipeTable || !stageTable) throw new Error('Preset CRM incompleto (faltam leadPipelines/leadStages).');

  for (const pname of ['VAL Pipeline A', 'VAL Pipeline B']) {
    const pipe = await prisma.dynamicTableData.create({
      data: { dynamicTableId: pipeTable.id, data: { unitId: unit.id, name: pname, isDefault: false } },
    });
    const stages = [
      { name: 'Novo', type: 'init', order: 0 },
      { name: 'Reunião', type: 'meeting', order: 1 },
      { name: 'Proposta', type: 'proposal', order: 2 },
      { name: 'Ganho', type: 'closed_won', order: 3 },
      { name: 'Perdido', type: 'closed_lost', order: 4 },
    ];
    for (const s of stages) {
      await prisma.dynamicTableData.create({
        data: { dynamicTableId: stageTable.id, data: { pipelineId: pipe.id, ...s } },
      });
    }
    console.log(`pipeline "${pname}" + ${stages.length} etapas`);
  }

  // >200 (default 2500) leads
  const batch = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    batch.push({
      dynamicTableId: leadTable.id,
      data: { leadName: `VAL Lead ${i}`, status: 'Open', unitId: unit.id, score: i % 100 },
    });
  }
  // createMany não aceita Json aninhado em todos os providers do SQLite antigo -> loop em chunks
  for (let i = 0; i < batch.length; i += 500) {
    await prisma.$transaction(batch.slice(i, i + 500).map((d) => prisma.dynamicTableData.create({ data: d })));
    console.log(`leads ${Math.min(i + 500, batch.length)}/${batch.length}`);
  }
  console.log('seed OK');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Rode: `cd server && node scripts/seed-validation.mjs`

**CRITÉRIO DE ACEITE (asserção) — [SCRIPT]:**
```bash
sqlite3 server/prisma/prisma/dev.db "
SELECT
 (SELECT count(*) FROM dynamic_table_data d JOIN dynamic_tables t ON t.id=d.dynamicTableId WHERE t.internalName='leads' AND d.deletedAt IS NULL) AS leads,
 (SELECT count(*) FROM dynamic_table_data d JOIN dynamic_tables t ON t.id=d.dynamicTableId WHERE t.internalName='leadPipelines' AND d.deletedAt IS NULL) AS pipelines;
"
```
Aceite: `leads > 200` (idealmente ≥ 2500) **e** `pipelines >= 2`.

### 0.C — Levantar o app vivo — [APP-VIVO + LOGIN HUMANO]

O backend serve o razão e as rotas CRM; o front serve a aba da tabela (prova 6). **Reinicie limpo do commit exato** — um dev server velho serve código velho (memória `stale-dev-server-serves-old-code`).

```bash
# backend
cd server && npm run build && npm start        # ou o script de produção do projeto
# frontend (prova 6 EXIGE build de produção, regra my-app: withAuth não confia em next dev)
cd my-app && npm run build && npm start
```

**Login (uma vez, guarde o token) — humano fornece a senha:**
```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@example.com","password":"<SUA_SENHA>"}' | jq -r .data.token
# export TOKEN=<o token retornado>
```
> Ajuste a porta do backend (`4000` é ilustrativo — confira o `.env`/`PORT` do server). O agente **não** pode executar este login (não tem a senha); é passo humano.

---

## PROVA 1 — Seam duplo-cego (Lead-Won NÃO booka × Opp-Won booka) — [APP-VIVO + LOGIN HUMANO]

Prova que só a **Opportunity** carrega valor contábil; o **Lead** não (board CA-SEAM). Escolha um `<UNIT>` (id de unit) e um `<LEAD_ID>`/`<STAGE_WON>` da tabela semeada.

**Passos:**
1. **(a) Lead até Won.** Avance um lead para a etapa `closed_won`:
   ```bash
   curl -s -X POST http://localhost:4000/api/crm/pipeline/advance \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"leadId":"<LEAD_ID>","stageId":"<STAGE_WON_ID>","stageType":"closed_won"}'
   ```
2. Leia o razão da unidade (receita 3.1) e as entradas:
   ```bash
   curl -s "http://localhost:4000/api/accounting/ledger?unitId=<UNIT>&accountCode=3.1" -H "Authorization: Bearer $TOKEN" | jq
   curl -s "http://localhost:4000/api/accounting/entries?unitId=<UNIT>" -H "Authorization: Bearer $TOKEN" | jq '.data | length'
   ```
   **ASSERTAR (a):** nenhum lançamento novo apareceu por causa do lead. (O advance de lead não tem ponte contábil.)
3. **(b) Opportunity até Won.** Crie uma opp a partir de um lead e avance-a para Won:
   ```bash
   curl -s -X POST http://localhost:4000/api/crm/pipeline/convert-lead-to-opportunity \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"leadId":"<LEAD_ID>","pipelineId":"<PIPELINE_ID>","name":"VAL Opp 1","currency":"BRL","amount":1000}'
   # -> guarde data.id como <OPP_ID>
   curl -s -X POST http://localhost:4000/api/crm/pipeline/advance-opportunity \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"opportunityId":"<OPP_ID>","stageId":"<STAGE_WON_ID>","stageType":"closed_won"}'
   ```
4. Releia o razão 3.1 e o razão 1.1.2:
   ```bash
   curl -s "http://localhost:4000/api/accounting/ledger?unitId=<UNIT>&accountCode=3.1"   -H "Authorization: Bearer $TOKEN" | jq
   curl -s "http://localhost:4000/api/accounting/ledger?unitId=<UNIT>&accountCode=1.1.2" -H "Authorization: Bearer $TOKEN" | jq
   ```

**CRITÉRIO DE ACEITE:** exatamente **UM** lançamento novo, creditando `3.1` e debitando `1.1.2` em **1000**. Lead-Won sem lançamento **+** Opp-Won com um lançamento = **duplo-cego provado** (o valor só existe na Opportunity). Se o Lead-Won bookar, ou o Opp-Won não bookar, o seam está quebrado.

---

## PROVA 2 — Seam mutável / re-Won (drift de valor) — [APP-VIVO + LOGIN HUMANO]

Prova que reganhar a mesma opp com outro valor não altera (nem duplica) o lançamento — dedup por `sourceId` congela o 1º (board CB-MONEY-SEAM; `advanceOpportunity` não tem guarda de estado terminal, `:291-297`).

**Passos:**
1. Use a `<OPP_ID>` da PROVA 1 (já Won a 1000). Reavance-a para `closed_won` com `amount=9999`:
   ```bash
   curl -s -X POST http://localhost:4000/api/crm/pipeline/advance-opportunity \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"opportunityId":"<OPP_ID>","stageId":"<STAGE_WON_ID>","stageType":"closed_won","amount":9999}'
   ```
2. Aguarde ≥1 ciclo do reconcile (**300s**, `AccountingSyncScheduler.ts:21`) ou dispare o fluxo de novo, e releia o razão:
   ```bash
   curl -s "http://localhost:4000/api/accounting/ledger?unitId=<UNIT>&accountCode=3.1" -H "Authorization: Bearer $TOKEN" | jq
   ```

**CRITÉRIO DE ACEITE:** o razão 3.1 mostra **exatamente um** lançamento de **1000** (o 1º), **não** 9999 e **não** dois lançamentos. Qualquer resultado ≠ "1 lançamento a 1000" confirma **drift** (o novo valor econômico da opp não bate com o razão — a receita reconhecida ficou presa no 1º amount). Registre o número observado.

---

## PROVA 3 — 4º furo: Won SEM unitId vira loop silencioso — [APP-VIVO + LOGIN HUMANO]

Prova que uma opp que chega a Won sem unidade responde **HTTP success** mas **nunca booka**, e o reconcile a re-tenta para sempre incrementando `summary.failed` (board SRE-2/QA-3; `crmController.ts:116-121`). Este é o cenário que os leads-sem-unit geram — por isso o backfill 0.A é pré-requisito, e por isso mantemos **um** caso deliberado sem unit aqui.

**Passos:**
1. Crie uma opportunity **sem unitId**. O caminho normal (`convert-lead-to-opportunity`) exige unit; para forçar o furo, semeie uma opp diretamente sem `unitId` — **[SCRIPT]**:
   ```bash
   cd server && node -e '
   process.env.DATABASE_URL="file:./prisma/dev.db";
   const {PrismaClient}=await import("./generated/prisma/index.js");
   const p=new PrismaClient();
   const t=await p.dynamicTable.findFirst({where:{internalName:"crmOpportunities"},select:{id:true}});
   const o=await p.dynamicTableData.create({data:{dynamicTableId:t.id,data:{name:"VAL NoUnit",currency:"BRL",amount:500,status:"Open",stageId:"<STAGE_WON_ID>",pipelineId:"<PIPELINE_ID>"}}});
   console.log("OPP_NO_UNIT="+o.id); await p.$disconnect();
   ' --input-type=module
   ```
2. Avance-a para Won pela API — **[APP-VIVO]**:
   ```bash
   curl -s -X POST http://localhost:4000/api/crm/pipeline/advance-opportunity \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"opportunityId":"<OPP_NO_UNIT>","stageId":"<STAGE_WON_ID>","stageType":"closed_won"}' -w '\nHTTP %{http_code}\n'
   ```
3. Observe os logs do backend por ≥2 ciclos de reconcile (≥600s) — **[APP-VIVO]**:
   ```bash
   # no console do server, ou no arquivo de log
   grep -i "Opportunity Won without unitId" <log>     # skip do post-commit (crmController.ts:117)
   grep -i "summary" <log>                              # summary.failed do scheduler (AccountingSyncScheduler.ts:111)
   ```

**CRITÉRIO DE ACEITE:** o passo 2 responde **HTTP 200 success** (a transição CRM não falha); **nenhum** lançamento aparece no razão para essa opp; e `summary.failed` **incrementa a cada ciclo** (o reconcile re-tenta em loop, sem dead-letter/quarentena). Isto confirma **receita silenciosamente não-reconhecida**. Limpe a opp de teste depois (`deletedAt`).

---

## PROVA 4 — Idempotência de proposta (double-click) — [APP-VIVO + LOGIN HUMANO]

Prova se avançar para uma etapa de proposta duas vezes (duplo-clique) cria duas linhas de proposta (board CA-IDEMP; `advanceStage` cria `leadProposals` sem guarda de idempotência).

**Passos:**
1. Escolha `<LEAD_ID>` e a etapa cujo `stageType='proposal'`. Dispare **duas** vezes seguidas:
   ```bash
   for i in 1 2; do curl -s -X POST http://localhost:4000/api/crm/pipeline/advance \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"leadId":"<LEAD_ID>","stageId":"<STAGE_PROPOSAL_ID>","stageType":"proposal","amount":750,"currency":"BRL"}'; echo; done
   ```
2. Conte as propostas daquele lead — **[SCRIPT]**:
   ```bash
   sqlite3 server/prisma/prisma/dev.db "
   SELECT count(*) FROM dynamic_table_data d JOIN dynamic_tables t ON t.id=d.dynamicTableId
   WHERE t.internalName='leadProposals' AND d.deletedAt IS NULL
     AND json_extract(d.data,'\$.leadId')='<LEAD_ID>';
   "
   ```

**CRITÉRIO DE ACEITE:** se a contagem for **2** (duas propostas para o mesmo `leadId`/etapa a partir de um double-click), a **duplicata está confirmada**. Se for 1 com guarda idempotente, passa. Registre o número.

---

## PROVA 5 — Fetch-all OOM em BUILD DE PRODUÇÃO — [APP-VIVO + LOGIN HUMANO]

Prova que o loader canônico da aba de tabela puxa TODAS as páginas em round-trips sequenciais antes do 1º paint e acumula tudo num array (board CA4/QA-4; `dynamic-tables.client.ts:55-64`, `PAGE_SIZE=200`). **Regra my-app: verifique contra build de produção, não `next dev`** — telas atrás de `withAuth`.

**Passos:**
1. Garanta a tabela com ≥2000 linhas (PROVA 0.B semeou 2500).
2. Suba o front em produção (já feito em 0.C): `cd my-app && npm run build && npm start`.
3. Faça login no navegador, abra DevTools (aba **Network** + **Performance/Memory**), e navegue até a aba do dashboard que renderiza a tabela semeada.
4. Observe: número de requisições a `getTableData?page=N&limit=200` e se são **sequenciais**; tempo até o 1º paint da tabela; heap do array `all`.

**CRITÉRIO DE ACEITE (asserção objetiva):**
- Nº de round-trips = `ceil(linhas / 200)` (2500 → **13** chamadas sequenciais). Se você vê ~13 requisições em cascata (uma após a outra), o fetch-all está confirmado.
- **Falha** = 1º paint **> 2s** OU crescimento de heap **linear** com o nº de linhas → dispara **ADR + guard server-side** (paginação/virtualização). Registre o tempo até o paint e o pico de heap.

---

## PROVA 6 — Matriz adversarial de 2 tenants (red-team) — [APP-VIVO + LOGIN HUMANO]

Exige **dois** tenants autenticados (Tenant A e Tenant B, cada um com seu `TOKEN`). Pega o oráculo de enumeração (item 1 do board), o no-op de magic-bytes (item 2), o gate de admin e o REDTEAM-3.

Pré: obtenha um `<LEAD_B_ID>` (id de lead do Tenant B) — **[SCRIPT]**, você tem acesso ao DB:
```bash
sqlite3 server/prisma/prisma/dev.db "
SELECT d.id FROM dynamic_table_data d JOIN dynamic_tables t ON t.id=d.dynamicTableId
JOIN users u ON u.id=t.userId WHERE t.internalName='leads' AND u.email='<TENANT_B_EMAIL>' LIMIT 1;
"
```

**(a) Oráculo de enumeração — endpoints de escrita CRM com id do Tenant B, autenticado como Tenant A:**
```bash
for ep in advance proposal no-show convert-lead advance-opportunity convert-lead-to-opportunity; do
  echo "== $ep =="
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4000/api/crm/pipeline/$ep \
    -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
    -d '{"leadId":"<LEAD_B_ID>","opportunityId":"<LEAD_B_ID>","stageId":"x","pipelineId":"x","name":"x","currency":"BRL"}'
done
```
**ASSERTAR:** todo endpoint deve responder **404** (não-existente, contrato §2). Os métodos blindados (`convert-lead`, `advance-opportunity`, `convert-lead-to-opportunity`) já retornam 404 (guard FIX-1). Os **não-blindados** (`advance`/`advanceStage`, `proposal`/`createProposal`, `no-show`/`recordNoShow`) hoje passam `leadId` direto a `updateTableData` sem o guard → esperam **403/500**, não 404 → **oráculo confirmado** (403≠404 vaza existência-de-id). Registre o status de cada um.

**(b) Magic-bytes no-op — polyglot HTML declarado `image/png`:**
```bash
printf '<html><script>alert(1)</script></html>' > /tmp/polyglot.png
curl -s -X POST http://localhost:4000/api/crm/attachments \
  -H "Authorization: Bearer $TOKEN_A" \
  -F 'file=@/tmp/polyglot.png;type=image/png' -F 'recordId=<UMA_LINHA_DE_A>' -i | grep -i 'HTTP\|content-disposition'
# depois baixe:
curl -s -D - "http://localhost:4000/api/crm/attachments/<ATT_ID>/download" -H "Authorization: Bearer $TOKEN_A" -o /dev/null | grep -i content-disposition
```
**ASSERTAR:** o upload é **aceito** (magic-bytes retorna `true` incondicional p/ image/png — `uploadSecurity.ts:42-44`, 2ª camada é no-op) **E** o download traz `Content-Disposition: attachment` (força download, não render inline → stored-XSS mitigado). Aceite documenta: a 2ª camada NÃO existe para image/png|jpeg|csv|plain; o residual (armazenar payload arbitrário sob rótulo de imagem) fica contido SÓ pelo header de download — qualquer futuro consumidor que renderize inline reabre o risco.

**(c) Gate de admin — não-admin em install-table/sync-preset:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4000/api/dynamic-tables/install-preset \
  -H "Authorization: Bearer $TOKEN_NAO_ADMIN" -H 'Content-Type: application/json' -d '{}'
```
**ASSERTAR:** **403** (ação privilegiada bloqueada para não-admin).

**(d) REDTEAM-3 — update de linha não-venda com `tableId=sales` na URL:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PUT "http://localhost:4000/api/dynamic-tables/<SALES_TABLE_ID>/data/<LINHA_NAO_VENDA_ID>" \
  -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' -d '{"data":{}}'
```
**ASSERTAR:** o `tableId` da URL NÃO deve ser tratado como autoritativo pelas pontes contábeis (`SalonSalesAccountingBridge.ts:50-53` deriva o gate de `salesTable.id !== tableId`). Board marca este como **PLAUSIBLE / não re-verificado** — aqui você o exercita: se a atualização de uma linha que não é venda, roteada por uma URL com `tableId=sales`, disparar a ponte, o smell de correção está confirmado. Correção proposta: derivar `tableId` da linha persistida, não da URL.

---

## Patches de baixo risco que NÃO dependem do kit (T6, sem ADR)

Independentes das provas — simetria com código que já existe no mesmo repositório (aplicáveis por um agente, mas fora do gate humano):
1. Aplicar o guard FIX-1 (`leadRow.dynamicTableId !== leadsTableId → NotFoundError`) em `advanceStage`, `createProposal`, `recordNoShow` — fecha o oráculo da PROVA 6(a).
2. Colapsar `dynamic-tables.client.ts` para chamar `fetchAllRows` de `crmFetch.ts` em vez de re-inlinar o loop — fecha a duplicação da PROVA 5.

---

## Vieses deste kit (T8)

- **Todo comando de rede pressupõe o app vivo que o agente não pode levantar autenticado.** Os `[SCRIPT]` (SQL, backfill, seed) rodam sem login; os `[APP-VIVO + LOGIN HUMANO]` **exigem você** — o agente não tem token válido nem senha. Não trate um kit "montado" como um kit "verde".
- **Portas/senhas são placeholders.** `4000`, `admin@example.com`, ids `<...>` são ilustrativos — confira `.env` (PORT), o email/senha reais do tenant, e colha os ids do próprio DB antes de rodar.
- **O backfill é a única barreira contra mis-route de receita, e ele depende de você preencher o mapa.** Se você ligar `ALLOW_SINGLE_UNIT_AUTOFILL` num tenant que na verdade tem mais de uma unidade operando sob um preset incompleto, a "unit única" pode ser a errada. Prefira o mapeamento explícito quando houver qualquer dúvida.
- **Semear via Prisma bypassa a engine de validação.** As linhas semeadas satisfazem a leitura mas não passaram por rules/policy; servem para volume de leitura (provas 5/6) e não substituem um teste E2E que escreve pela engine real.