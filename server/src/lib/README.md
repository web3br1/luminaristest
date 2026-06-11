# /lib - Core Application Logic

Esta pasta contém a lógica central e reutilizável da aplicação. Ela abriga os módulos e serviços compartilhados que formam a espinha dorsal do backend, bem como utilitários e hooks para o frontend.

---

## Arquitetura e Componentes Principais

A pasta `lib` é organizada em torno de responsabilidades claras, com os seguintes componentes sendo os mais críticos:

### 1. `factory.ts` - Dependency Injection & Service Locator

Este é o arquivo mais importante da `lib`. Ele implementa o padrão **Service Locator** usando uma classe Singleton (`ApplicationFactory`).

-   **Propósito:** Centraliza a criação e o gerenciamento de todas as instâncias de serviços, repositórios e políticas.
-   **Funcionamento:** Garante que haja apenas uma instância de cada dependência (`lazy loading`), que é então "injetada" nos serviços que a consomem. Isso desacopla o código e facilita a manutenção e os testes.
-   **Uso:** Em qualquer parte da aplicação, a função `getFactory()` é chamada para obter acesso a qualquer serviço (ex: `getFactory().getDocumentService()`).

### 2. `/vector` - Vector Search & Embeddings

Este módulo gerencia todas as operações relacionadas a vetores e a interação com o banco de dados vetorial (ex: Qdrant).

-   **`/extractors`**: Contém a lógica para extrair texto de diferentes tipos de arquivo (PDF, DOCX, Excel). O extrator de Excel (`excel.ts`) é particularmente importante, pois contém a lógica para lidar com planilhas de múltiplas abas, formatando a saída para que a IA possa distinguir cada aba.
-   **`chunking.ts`**: Implementa a lógica para dividir textos longos em pedaços menores (`chunks`), um passo essencial antes de gerar embeddings para não exceder os limites de tokens dos modelos de IA.
-   **`embedding.ts`**: Contém o `EmbeddingOpenAIService`, que interage com a API da OpenAI para converter os `chunks` de texto em vetores numéricos (embeddings).
-   **`manager.ts`**: Orquestra todo o pipeline de processamento vetorial: extração, chunking, embedding e, finalmente, a inserção dos vetores no banco de dados vetorial.

### 3. `/openai` - OpenAI Service Integration

Atua como um wrapper para a API da OpenAI, centralizando a comunicação.

-   **Responsabilidade:** Abstrai as chamadas à API da OpenAI para tarefas como análise de texto, extração de dados estruturados e suporte a conversas de chat.
-   **Gerenciamento:** Cuida do uso de chaves de API, implementa lógicas de `retry` e trata erros específicos da API da OpenAI.

### 4. `errors.ts` - Custom Error Classes

Define um conjunto de classes de erro personalizadas que são usadas em toda a aplicação para um tratamento de erros consistente e previsível na API.
- **`AppError`**: Classe base para todos os erros customizados.
- **`NotFoundError`**: Para recursos não encontrados (HTTP 404).
- **`ForbiddenError`**: Para acesso negado por falta de permissão (HTTP 403).
- **`ValidationError`**: Para falhas de validação de dados de entrada, geralmente do Zod (HTTP 400).

### 5. `prisma.ts` - Prisma Client Singleton

Fornece uma instância única e global do cliente Prisma, seguindo o padrão Singleton. Isso é crucial para evitar a criação de múltiplas conexões com o banco de dados, o que poderia esgotar o pool de conexões e degradar a performance.

### 6. Utilitários e Suporte

-   **`apiUtils.ts`**: Fornece o `createApiHandler`, um wrapper de ordem superior para os handlers da API Next.js. Ele padroniza o tratamento de requisições, incluindo verificação de método HTTP, tratamento de erros global com `try/catch`, e formatação das respostas de sucesso (`{ data: T }`) e erro (`{ error: ... }`).
-   **`authUtils.ts`**: Contém utilitários para autenticação. A função `getAuthenticatedUser` decodifica o token JWT (usando `jose`) a partir dos cookies da requisição para identificar e retornar o usuário logado.
-   **`logger.ts`**: Configura o serviço de logging (Winston) para registrar eventos, avisos e erros da aplicação de forma estruturada, facilitando o debug e monitoramento.
-   **`monitoring.ts`**: Contém configurações e hooks para integração com serviços de monitoramento de performance e erros.

### 7. Módulos Específicos do Frontend

-   **`/context`**: Implementa React Contexts para gerenciamento de estado global, permitindo que diferentes componentes compartilhem estado sem `prop drilling`.
-   **`/hooks`**: Define hooks React reutilizáveis que encapsulam lógica de estado, efeitos colaterais e interações com a API, promovendo a reutilização de código no frontend.
-   **`/hoc`**: Contém Componentes de Ordem Superior (Higher-Order Components) que envolvem outros componentes para adicionar funcionalidades, como verificação de autenticação antes de renderizar uma página.
   - Respostas consistentes
   - Logging estruturado

3. **Autenticação**
   - JWT via `jose`
   - Contexto do usuário
   - Headers padronizados
   - Refresh tokens
   - Rate limiting

4. **Tipagem**
   - TypeScript estrito
   - Interfaces bem definidas
   - Tipos compartilhados
   - Generics quando apropriado

## Padrão CRUD

1. **Estrutura de Feature**
```
feature/
├── models/
│   └── Entity.model.ts      # Interface e tipos
├── repositories/
│   └── EntityRepository.ts  # Acesso ao banco
├── services/
│   └── EntityService.ts     # Lógica de negócio
├── policies/
│   └── EntityPolicy.ts      # Regras de acesso
├── dtos/
│   ├── CreateEntityDto.ts   # Validação de criação
│   └── UpdateEntityDto.ts   # Validação de atualização
└── __tests__/              # Testes unitários
```

2. **Fluxo de Dados**
```
Request → API Route → Service → Repository → Database
   ↑          ↓          ↓          ↓          ↓
   └──────────┴──────────┴──────────┴──────────┘
        Validação    Políticas    Cache    Logging
```

3. **Validação**
- Zod para schemas
- Validação em DTOs
- Tipos inferidos
- Mensagens customizadas

### Vector Processing

#### `vector/`
Utilitários para processamento de vetores e documentos.

**Extratores**
- `pdf.ts`: Extrai texto de arquivos PDF
- `word.ts`: Extrai texto de arquivos Word (.docx)
- `ExcelExtractor.ts`: Extrai texto de planilhas Excel
- `ExcelStructuredExtractor.ts`: Extrai dados estruturados de planilhas Excel

**Chunking**
- `chunking.ts`: Divide textos em pedaços menores
  - Estratégias: por palavras, frases ou parágrafos
  - Suporte a sobreposição entre chunks
  - Interface `ChunkingOptions` para configuração

**Embedding**
- `embedding.ts`: Gera embeddings de texto
  - Suporte a múltiplos provedores
  - Cache de embeddings
  - Tipagem forte para vetores

**Repositório Vetorial**
- `IVectorRepository.ts`: Interface para operações com vetores
  - Busca por similaridade
  - Inserção/Atualização de vetores
  - Validação com Zod

4. **Políticas**
- Verificação de permissões
- Regras de negócio
- Validações complexas
- Cache de decisões

## Fluxo de Dados

1. **Requisição API**
```
Request → apiUtils.ts (createApiHandler)
  → authUtils.ts (verificação)
  → Service (lógica)
  → Repository (dados)
  → Response
```

2. **Autenticação**
```
Request → authUtils.ts (JWT)
  → UserRepository (dados)
  → Context (estado)
  → Headers (propagação)
```

3. **Serviços**
```
Service → Repository
  → Database (via prisma.ts)
  → Cache (opcional)
  → Logging
```

## Boas Práticas

1. **Nova Biblioteca**
   - Criar em pasta específica se necessário
   - Documentar propósito e uso
   - Seguir padrões existentes
   - Adicionar testes
   - Documentar API

2. **Novo Serviço**
   - Usar Factory Pattern
   - Injetar dependências via construtor
   - Seguir padrão Singleton
   - Implementar interface
   - Adicionar logging

3. **Novo Erro**
   - Estender `AppError`
   - Definir em `errors.ts`
   - Documentar uso
   - Adicionar testes
   - Mapear códigos HTTP

4. **Nova Integração**
   - Criar pasta dedicada
   - Implementar interface clara
   - Centralizar configuração
   - Adicionar retry
   - Implementar fallback

5. **Novo CRUD**
   - Seguir estrutura de feature
   - Implementar validação Zod
   - Adicionar políticas
   - Criar testes
   - Documentar API

## Extensibilidade

1. **Novas Features**
   - Seguir estrutura existente
   - Reutilizar padrões
   - Manter consistência
   - Documentar mudanças

2. **Novos Serviços**
   - Usar Factory Pattern
   - Seguir padrões DI
   - Implementar interfaces
   - Adicionar testes

3. **Novas Integrações**
   - Criar pasta dedicada
   - Isolar configuração
   - Implementar fallback
   - Adicionar monitoramento

4. **Novos Middlewares**
   - Seguir padrão existente
   - Documentar propósito
   - Adicionar testes
   - Considerar performance 