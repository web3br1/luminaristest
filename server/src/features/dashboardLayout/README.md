# Feature: Dashboard Layout

## Descrição
Gerenciamento de layouts de dashboard, permitindo personalização e persistência de configurações de interface.

## Estrutura
```
dashboardLayout/
├── models/
│   └── DashboardLayout.model.ts  # Interface e tipos do layout
├── repositories/
│   ├── IDashboardLayoutRepository.ts  # Interface do repositório
│   └── DashboardLayoutRepository.ts   # Implementação do repositório
├── services/
│   └── DashboardLayoutService.ts      # Lógica de negócio
├── policies/
│   ├── IDashboardLayoutPolicy.ts      # Interface de políticas
│   └── DashboardLayoutPolicy.ts       # Regras de acesso
├── dtos/
│   └── DashboardLayoutDto.ts          # DTOs e validações
└── __tests__/                        # Testes unitários
```

## Modelos
- `IDashboardLayout`: Interface base do layout
- `IDashboardLayoutSummary`: Resumo do layout (dados mínimos)
- `LayoutConfig`: Configuração específica do layout, com propriedades:
  - `columns`: número de colunas no grid
  - `widgets`: lista de IDs de widgets
  - `positions?`: array de objetos `{ id, i, x, y, w, h, minW?, minH?, type }`
  - `theme?`: tema opcional
  - `customSettings?`: configurações adicionais

## DTOs
- `CreateDashboardLayoutDto`: Validação de criação
- `UpdateDashboardLayoutDto`: Validação de atualização
- `DashboardLayoutDto`: DTO base
- `DashboardLayoutSummaryDto`: DTO de resumo
- **Configuração (`config`) em DTOs inclui:**
  - `columns`: número de colunas
  - `widgets`: IDs de widgets
  - `positions`: detalhes de posicionamento dos widgets
  - `theme?`: tema opcional
  - `customSettings?`: configurações adicionais

## Serviços
### DashboardLayoutService
- `createLayout(data, userContext)`: **comportamento de upsert** — se já existe um layout para o
  usuário, **atualiza** o existente em vez de criar um novo (evita duplicidade de layout por usuário).
- `getAllLayouts(page?, limit?, userContext)`: lista paginada → retorna `DashboardLayoutSummaryDto[]`
  (defaults `page=1`, `limit=10`).
- `getLayoutById(id, userContext)`: busca por ID (com checagem de acesso).
- `getLayoutsByUser(userContext)`: lista os layouts do usuário; **valida e filtra** registros
  malformados (campos obrigatórios e `type` válido) antes de retornar.
- `updateLayout(id, data, userContext)`: atualiza um layout.
- `deleteLayout(id, userContext)`: remove um layout.

> A `config` é persistida como JSON no Prisma; helpers privados `mapToDto` / `mapToSummaryDto`
> convertem a entidade para os DTOs de resposta.

## Políticas
### DashboardLayoutPolicy
- `canCreate`: Permissão para criar
- `canListAll`: Permissão para listar
- `canView`: Permissão para visualizar
- `canUpdate`: Permissão para atualizar
- `canDelete`: Permissão para deletar

## Repositório
### DashboardLayoutRepository
- `createLayout`: Cria layout
- `getAllLayouts`: Lista layouts
- `getLayoutById`: Busca por ID
- `getLayoutsByUser`: Lista por usuário
- `updateLayout`: Atualiza layout
- `deleteLayout`: Remove layout

## Padrões
1. **Factory Pattern**
   - Injeção de dependências via construtor
   - Interfaces para repositório e políticas
   - Instanciação via factory

2. **Validação**
   - Zod para schemas
   - Validação em DTOs
   - Tipos inferidos

3. **Segurança**
   - Controle de acesso por usuário
   - Validação de permissões
   - Proteção de dados

4. **Tratamento de Erros**
   - Classes de erro customizadas
   - Mensagens descritivas
   - Códigos HTTP apropriados

## Fluxo de Dados
```
Request → API Route → DashboardLayoutService → DashboardLayoutRepository → Database
   ↑          ↓                ↓                      ↓                    ↓
   └──────────┴────────────────┴──────────────────────┴────────────────────┘
        Validação         Políticas              Cache              Logging
```

## Boas Práticas
1. **Novo Layout**
   - Validar dados de entrada
   - Verificar permissões
   - Mapear para domínio
   - Persistir configuração

2. **Atualização**
   - Validar campos
   - Verificar propriedade
   - Manter histórico
   - Atualizar configuração

3. **Exclusão**
   - Verificar propriedade
   - Limpar dados
   - Manter consistência

4. **Consultas**
   - Paginação
   - Filtros por usuário
   - Cache de layouts
   - Ordenação por data

## Componentes

### Models
- **DashboardLayout.model.ts**
  - Interface `IDashboardLayout`: Representa a entidade layout no domínio
  - Tipos:
    - `LayoutType`: Define os tipos de layout disponíveis
    - `LayoutConfig`: Configuração específica do layout
  - Desacoplado da infraestrutura (Prisma)

### DTOs
- **DashboardLayoutDto.ts**
  - Schemas Zod para validação:
    - `DashboardLayoutSchema`: Resposta de layout
    - `UpdateDashboardLayoutSchema`: Atualização de layout
    - `CreateDashboardLayoutSchema`: Criação de layout
  - Type guards para validação em runtime
  - Documentação OpenAPI
  - Validações:
    - Nome: 3-50 caracteres
    - Configuração: objeto válido
    - Tipo: enum válido
    - Usuário: ID válido

### Repositories
- **IDashboardLayoutRepository.ts**
  - Interface definindo operações de persistência
  - Métodos:
    - `createLayout`: Criação de layout
    - `getAllLayouts`: Listagem paginada
    - `getLayoutById`: Busca por ID
    - `getLayoutsByUser`: Busca por usuário
    - `updateLayout`: Atualização
    - `deleteLayout`: Remoção

- **DashboardLayoutRepository.ts**
  - Implementação usando Prisma
  - Seleção segura de campos
  - Paginação implementada
  - Relacionamentos gerenciados

### Policies
- **IDashboardLayoutPolicy.ts**
  - Interface definindo regras de autorização
  - Métodos:
    - `canListAll`: Listar todos layouts
    - `canView`: Visualizar layout
    - `canCreate`: Criar layout
    - `canUpdate`: Atualizar layout
    - `canDelete`: Deletar layout

- **DashboardLayoutPolicy.ts**
  - Implementação das regras de autorização
  - Regras:
    - ADMIN: acesso total
    - USER: acesso limitado aos próprios layouts
    - Público: sem acesso

### Services
- **DashboardLayoutService.ts**
  - Lógica de negócio centralizada
  - Validação de DTOs
  - Tratamento de erros
  - Tipos de retorno:
    - `DashboardLayout`: Dados completos
    - `PublicDashboardLayout`: Dados públicos

## Dependências

- `zod`: Validação de dados
- `prisma`: ORM
- `jose`: JWT 