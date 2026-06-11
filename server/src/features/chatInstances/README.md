# Feature: Chat Instances

## Visão Geral

A feature `chatInstances` é uma **feature de entidade** fundamental para a aplicação. Sua responsabilidade é gerenciar o ciclo de vida de uma conversa individual (instância de chat). Cada instância representa uma sessão de chat única, com seu próprio histórico de mensagens e metadados.

## Estrutura de Arquivos

```
chatInstances/
├── dtos/
│   └── ChatInstanceDto.ts
├── models/
│   └── ChatInstance.model.ts
├── policies/
│   └── ChatInstancePolicy.ts
├── repositories/
│   └── ChatInstanceRepository.ts
├── services/
│   └── ChatInstanceService.ts
└── README.md
```

## Arquitetura e Componentes

A feature segue uma arquitetura de camadas padrão para garantir separação de responsabilidades, segurança e testabilidade.

- **DTOs (`ChatInstanceDto.ts`)**: Utiliza Zod para definir schemas de validação robustos para todas as operações de entrada (criação, atualização) e para tipar os dados de saída.

- **Service (`ChatInstanceService.ts`)**: Orquestra a lógica de negócio. Ele consome o repositório e as políticas para executar as operações de CRUD (Create, Read, Update, Delete), garantindo que todas as regras de negócio e de autorização sejam aplicadas antes de interagir com o banco de dados.

- **Policy (`ChatInstancePolicy.ts`)**: Centraliza as regras de autorização. Define quem pode criar, ver, editar ou deletar uma instância de chat, garantindo que um usuário não possa acessar ou modificar as conversas de outro.

- **Repository (`ChatInstanceRepository.ts`)**: Implementa a camada de acesso a dados, abstraindo as consultas ao banco de dados (Prisma). É a única camada que interage diretamente com o banco.

## API do serviço (`ChatInstanceService`)

| Método | Responsabilidade |
|---|---|
| `createInstance(data, userContext)` | Cria uma instância (trata violação de constraint única). |
| `getAllInstances(userContext, page?, limit?)` | Lista paginada → `{ instances, totalCount }`. |
| `getInstanceById(id, userContext)` | Busca por ID (com checagem de acesso). |
| `getInstancesByUser(userContext, type?)` | Lista as instâncias do usuário, opcionalmente por `type`. |
| `getOrCreateInstance(widgetInstanceId, type, userContext)` | **Idempotente:** retorna a instância existente para o `widgetInstanceId` ou cria uma nova, tratando race condition via a constraint única. |
| `updateInstance(id, data, userContext)` | Atualiza. |
| `deleteInstance(id, userContext)` | Remove. |

### Conceitos-chave
- **`widgetInstanceId`**: identifica de forma estável a instância vinculada a um widget do frontend;
  é a chave usada para **deduplicação** em `getOrCreateInstance`.
- **`type`** (enum): `'DOCUMENT'` | `'GENERIC'` — distingue conversas atreladas a um documento das
  conversas genéricas.

## Interação com Outras Features

- **`chatMessages` (Pai)**: A `ChatInstance` é a entidade pai das mensagens. Cada `ChatMessage` pertence a uma única `ChatInstance`, criando uma relação de um-para-muitos que estrutura o histórico da conversa.

- **`users` (Proprietário)**: Cada `ChatInstance` pertence a um `User`. O `userContext` é usado em todas as operações para garantir que as políticas de acesso sejam aplicadas corretamente, isolando as conversas por usuário.