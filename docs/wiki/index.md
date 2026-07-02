# Wiki — Conceitos do Projeto

Índice de conceitos duráveis derivados dos learnings do buildout. Uma linha por conceito.
Cada entrada aponta para `concepts/<slug>.md`. Entradas mais novas no topo.

| Slug | Categoria | Resumo |
|------|-----------|--------|
| [tx-nao-propagado-ao-repo](concepts/tx-nao-propagado-ao-repo.md) | pitfall | Abrir `runTransaction` sem passar `tx` ao repo = atomicidade aparente, falha real |
