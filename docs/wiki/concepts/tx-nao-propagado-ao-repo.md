---
slug: tx-nao-propagado-ao-repo
category: pitfall
source: docs/learnings/accounting-buildout.md
---

# `tx` não propagado ao repo = atomicidade aparente, falha real

Abrir `runTransaction` mas chamar `repo.method(...)` sem `tx` dentro do bloco
faz a escrita ir ao `prisma` global — fora da tx. Atomicidade quebrada silenciosamente.

## Regra

```ts
// ❌ ERRADO — accountRepo.create roda fora da tx
await postingRepo.runTransaction(async (tx) => {
  const account = await accountRepo.create({ ... });   // sem tx!
  await auditService.append(tx, scope, { ... });       // dentro da tx
});
// Se auditService.append falhar → account persiste, sem evento de auditoria.

// ✅ CORRETO — ambas as escritas na mesma tx
await postingRepo.runTransaction(async (tx) => {
  const account = await accountRepo.create({ ... }, tx);  // tx propagado
  await auditService.append(tx, scope, { ... });
});
```

## Onde aplicar

Sempre que um `Service` abrir `runTransaction` e fizer mais de uma chamada de escrita a repos.
Checklist: `grep -n "this\.\w*Repo\." PostingService.ts` dentro do bloco → toda call de escrita
deve incluir `tx`.

## Evidência

`server/src/features/accounting/services/PostingService.ts:445,512` —
INCR-2 G6 defect: `createAccount` e `deleteAccount` chamavam repo sem `tx`.
Reviewer independente detectou antes do commit (306f790); corrigido adicionando `tx` em:
- `IAccountRepository.softDelete(scope, id, tx?)`
- `AccountRepository.softDelete`: `(tx ?? prisma).account.update(...)`
- `PostingService.createAccount`: `accountRepo.create({...}, tx)`
- `PostingService.deleteAccount`: `accountRepo.softDelete(scope, id, tx)`

## Relacionados

[[authoritative-gate-inside-tx]], [[reviewer-independence-separate-agent]]
