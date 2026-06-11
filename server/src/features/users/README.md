# Feature: Users

## Descrição
Gerenciamento de usuários do sistema, incluindo autenticação, autorização e perfis.

## Estrutura
```
users/
├── models/
│   └── User.model.ts         # Interface e tipos do usuário
├── repositories/
│   ├── IUserRepository.ts    # Interface do repositório
│   └── UserRepository.ts     # Implementação do repositório
├── services/
│   └── UserService.ts        # Lógica de negócio
├── policies/
│   ├── IUserPolicy.ts        # Interface de políticas
│   └── UserPolicy.ts         # Regras de acesso
├── dtos/
│   └── UserDto.ts            # DTOs e validações
└── __tests__/               # Testes unitários
```

## Modelos
- `IUser`: Interface base do usuário
- `PublicUserProfile`: Perfil público (dados mínimos)
- `SafeUserProfile`: Perfil seguro (sem dados sensíveis)

## DTOs
- `CreateUserDto`: Validação de criação
- `UpdateUserDto`: Validação de atualização
- `UserDto`: DTO base

## Serviços
### UserService
- `createUser(data, actor?)`: cria usuário (hash de senha via bcrypt; retorna `SafeUserProfile` sem
  senha). **Regra de role:** só um `actor` ADMIN pode definir `role: ADMIN` — caso contrário a role é
  rebaixada para `USER`.
- `getAllUsers(actor, page?, limit?)`: lista paginada (apenas ADMIN; defaults `page=1`, `limit=10`).
- `getUserById(id, actor)`: busca por ID (com checagem de acesso).
- `updateUser(id, data, actor)`: atualiza (usuário comum só pode atualizar a si mesmo).
- `deleteUser(id, actor)`: remove (ADMIN).

## Políticas
### UserPolicy
- `canCreate`: Permissão para criar
- `canListAll`: Permissão para listar
- `canView`: Permissão para visualizar
- `canUpdate`: Permissão para atualizar
- `canDelete`: Permissão para deletar
- `canChangeRole`: Permissão para alterar roles

## Repositório
### UserRepository
- `createUser`: Cria usuário
- `getAllUsers`: Lista usuários
- `getUserById`: Busca por ID
- `getUserByUsername`: Busca por username
- `getUserByEmail`: Busca por email
- `updateUser`: Atualiza usuário
- `deleteUser`: Remove usuário

## Padrões
1. **Injeção de Dependência**
   - Usa Factory Pattern
   - Interfaces para repositório e políticas
   - Dependências injetadas via construtor

2. **Validação**
   - Zod para schemas
   - Validação em DTOs
   - Tipos inferidos

3. **Segurança**
   - Hash de senha com bcrypt
   - Controle de roles
   - Validação de permissões

4. **Tratamento de Erros**
   - Classes de erro customizadas
   - Mensagens descritivas
   - Códigos HTTP apropriados

## Fluxo de Dados
```
Request → API Route → UserService → UserRepository → Database
   ↑          ↓           ↓             ↓             ↓
   └──────────┴───────────┴─────────────┴─────────────┘
        Validação    Políticas    Cache    Logging
```

## Boas Práticas
1. **Novo Usuário**
   - Validar dados de entrada
   - Verificar unicidade
   - Hash de senha
   - Definir role apropriada

2. **Atualização**
   - Validar campos
   - Verificar permissões
   - Manter dados sensíveis

3. **Exclusão**
   - Verificar dependências
   - Manter histórico
   - Limpar dados sensíveis

4. **Consultas**
   - Paginação
   - Filtros
   - Ordenação
   - Cache quando apropriado

## Uso

```typescript
// Exemplo de criação de usuário
const factory = getFactory();
const userService = factory.getUserService();
const newUser = await userService.createUser({
  name: "John Doe",
  username: "johndoe",
  email: "john@example.com",
  password: "SecurePass123"
});

// Exemplo de atualização
const updatedUser = await userService.updateUser(
  userId,
  { name: "John Updated" },
  currentUser
);
```

## Dependências

- `zod`: Validação de dados
- `bcryptjs`: Hash de senhas
- `prisma`: ORM
- `jose`: JWT 