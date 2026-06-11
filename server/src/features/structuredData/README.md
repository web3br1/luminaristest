# Feature: Structured Data

> **DEPRECATED (R26 — Onda 3)**
> The structuredData sub-feature (Excel → structured JSON display) has been retired on the frontend.
> The backend implementation (service, repository, controller, route) is preserved here but the
> frontend was never connected — zero UI components, zero imports were ever built.
> The display library intended for this feature (Handsontable, commercial license) and the
> frontend parsing dependency (exceljs) have been removed from `my-app/package.json`.
>
> **Future decision required:** either build the frontend UI (SpreadsheetWidget) and reconnect,
> or remove the backend pipeline entirely. Do not add new consumers until that decision is made.

## Visão Geral

- **Categoria:** Feature de Entidade
- **Propósito:** Gerencia os dados estruturados (tabulares) extraídos dos documentos dos usuários. Esta feature é responsável por armazenar, recuperar e atualizar os dados que são exibidos e editados no `SpreadsheetWidget`.

---

## Arquitetura e Fluxo de Operação

O fluxo principal desta feature é servir como um repositório para os dados tabulares. A lógica de negócio é relativamente simples:

1.  **Criação:** Durante o pipeline de processamento de documentos, após a IA identificar um arquivo como tabular, ela extrai os cabeçalhos e os dados. O `StructuredDataService` é então chamado para persistir essas informações no banco de dados, vinculadas ao documento original.
2.  **Recuperação:** Quando o frontend (ex: `SpreadsheetWidget`) precisa exibir uma tabela, ele solicita os dados pelo `documentId`. O `StructuredDataService` busca os dados e executa uma lógica de normalização para lidar com planilhas de múltiplas abas (`multi-sheet`). Ele detecta se o campo `data` é um JSON representando várias abas, e se for, retorna a estrutura completa de abas e normaliza os dados da primeira aba para exibição principal.
3.  **Atualização:** Quando um usuário edita os dados na planilha, o frontend envia os dados atualizados para a API, e o `StructuredDataService` os atualiza no banco de dados.

---

## Componentes

### Modelos (`types`)
- **`StructuredData`**: Interface principal que define a estrutura dos dados, incluindo um array de `headers` e um array de `data` (linhas).
- **`Header`**: Define o formato de um cabeçalho de coluna, com `name` e `type` (ex: 'TEXT', 'NUMBER').

### DTOs (Contratos de Dados)
- **`createStructuredDataSchema`**: Esquema Zod para validar a criação de um novo registro. Utiliza `z.union` para aceitar tanto dados tabulares simples quanto estruturas complexas de múltiplas abas (`multi-sheet`).
- **`updateStructuredDataSchema`**: Esquema Zod para validar a atualização dos dados. Também utiliza `z.union` para permitir a atualização com diferentes formatos de dados.

### Serviços
- **`StructuredDataService`**: Orquestra a lógica de negócio (todos os métodos recebem `user` e
  aplicam a policy de acesso). Métodos públicos:
    - `getByDocumentId(user, documentId)`: recupera e **normaliza** os dados — detecta se `data` é um
      JSON multi-aba (string ou array) e, com aba única, simplifica a estrutura para exibição. Converte
      `ApiHeader` (`key`/`title`/`type`) para o `Header` interno.
    - `createFromStructured(user, documentId, { sheets })`: cria a partir de planilhas já extraídas
      (processadores de Excel); **pode retornar `null`** quando não há dados.
    - `createFromText(user, documentId, rawText)`: usa o `OpenAIService` para extrair tabular de texto
      bruto e persiste (texto/PDF).
    - `update(user, documentId, data)`: atualiza um registro existente.

> Exposto via `controllers/structuredDataController.ts` (ex: buscar dados estruturados por documento).

### Políticas
- **`StructuredDataPolicy`**: Implementa a lógica de autorização. O método `canAccess` verifica se o usuário que faz a requisição é o dono do documento ao qual os dados estruturados estão associados.

### Repositórios
- **`StructuredDataRepository`**: Abstrai o acesso ao banco de dados (Prisma). Expõe métodos como `findByDocumentId`, `create` e `update`.

## Estrutura de Arquivos

```
/features/structuredData
|-- /dtos
|   |-- StructuredDataDto.ts  # Esquemas Zod para validação
|-- /policies
|   |-- StructuredDataPolicy.ts # Regras de permissão (quem pode acessar)
|-- /repositories
|   |-- StructuredDataRepository.ts # Interação com o Prisma (banco de dados)
|-- /services
|   |-- StructuredDataService.ts  # Orquestração da lógica de negócio
|-- /types
|   |-- StructuredData.types.ts  # Tipos de dados estruturados
|   |-- Sheet.types.ts           # Tipos de planilha (abas/headers)
|-- README.md                   # Esta documentação
```

---

## Interação com Outras Features

- **Consome:**
    - `features/documents`: Utiliza o `DocumentRepository` (através da `StructuredDataPolicy`) para verificar a propriedade do documento antes de permitir o acesso aos dados estruturados.

- **Consumida por:**
    - `features/documents` (especificamente o `DocumentProcessingPipeline`): O pipeline de processamento de documentos chamará o `StructuredDataService` para criar os registros após a extração dos dados pela IA.
