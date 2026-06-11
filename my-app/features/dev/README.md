# features/dev — Ferramentas de desenvolvimento

Utilitários **apenas para desenvolvimento** — não fazem parte do fluxo de produto. Hoje contém o
**seed** de dados de demonstração.

## `seed/` — popular um workspace com dados realistas

`SeedService` (`seed/SeedService.ts`) cria dados de exemplo nas tabelas dinâmicas do usuário, por
domínio, via API (`seed/utils/ApiClient.ts`) e um gerador de dados (`seed/utils/DataGenerator.ts`).

Módulos de seed (`seed/modules/`), na ordem de dependência:

| Módulo | Popula |
|---|---|
| `SeedCore` | unidades, funcionários e base do core |
| `SeedPeople` | clientes/fornecedores |
| `SeedCatalog` | produtos/serviços |
| `SeedInventory` | estoque/movimentos |
| `SeedSales` · `SeedFinancials` | vendas, despesas, comissões |
| `SeedAppointments` | agendamentos |
| `SeedStrategy` | metas/campanhas |

O `SeedService` recebe um callback de mensagem (`setMsg`) para reportar progresso na UI de dev.

> Uso típico: dentro de uma tela/ação de desenvolvimento, instanciar `SeedService` com as tabelas do
> usuário e disparar o seed. **Não** deve ser exposto em produção.
