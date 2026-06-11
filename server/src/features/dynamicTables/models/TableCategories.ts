/**
 * Configuração central para as categorias de tabelas dinâmicas.
 * Define a chave interna (para o sistema) e o nome de exibição (para a UI).
 * Acrescenta metadados para i18n, ordenação, categorias virtuais e ícones.
 */
export type DynamicTableCategoryConfig = {
  key: string;
  displayName: string; // fallback
  i18nKey?: string; // ex: 'categories.sales'
  icon?: string; // ex: 'mdi:cash-register'
  order?: number;
  isVirtual?: boolean;
  /** categorias reais onde os dados vivem para compor contagens virtuais */
  sourceCategories?: string[];
  /** nomes de tabelas relevantes para contagem virtual */
  virtualNameMatchers?: string[];
};

export const DYNAMIC_TABLE_CATEGORY_CONFIG: readonly DynamicTableCategoryConfig[] = [
  // 🛍️ Comercial: Tudo relacionado a vendas e produtos/serviços oferecidos
  { key: 'commercial',     displayName: 'Comercial', i18nKey: 'categories.commercial', icon: 'store', order: 10 },
  { key: 'products',       displayName: 'Produtos', i18nKey: 'categories.products', order: 15 },
  { key: 'services',       displayName: 'Serviços', i18nKey: 'categories.services', order: 20 },
  // 'sales' removida: Vendas passam a fazer parte de Financeiro

  // 📦 Inventário: Gestão de produtos internos e controle de estoque
  { key: 'inventory',      displayName: 'Estoque', i18nKey: 'categories.inventory', icon: 'inventory', order: 30 },

  // 💰 Financeiro: Controle financeiro e contabilidade
  { key: 'finance',        displayName: 'Financeiro', i18nKey: 'categories.finance', icon: 'account_balance', order: 40 },

  // 👥 Pessoas: Gestão de clientes, funcionários, fornecedores
  { key: 'people',         displayName: 'Pessoas', i18nKey: 'categories.people', icon: 'people', order: 50 },
  // 📈 Leads: Funil comercial e prospecção
  { key: 'leads',          displayName: 'Leads', i18nKey: 'categories.leads', icon: 'people', order: 55 },

  // 📅 Planejamento: Agendamentos, projetos, organização
  { key: 'planning',       displayName: 'Planejamento', i18nKey: 'categories.planning', icon: 'event', order: 60 },
  { key: 'kanban',         displayName: 'Kanban', i18nKey: 'categories.kanban', order: 65 },

  // ⚙️ Operacional: Processos e operações do dia a dia
  { key: 'operations',     displayName: 'Operações', i18nKey: 'categories.operations', icon: 'settings', order: 70 },
  { key: 'marketing',      displayName: 'Marketing', i18nKey: 'categories.marketing', order: 75 },
  { key: 'business',       displayName: 'Negócios', i18nKey: 'categories.business', order: 80 },

  // 📋 Administrativo: Documentação e compliance
  { key: 'administrative', displayName: 'Administrativo', i18nKey: 'categories.administrative', icon: 'description', order: 90 },

  // 📂 Outros: Categorias diversas
  { key: 'other',          displayName: 'Outros', i18nKey: 'categories.other', icon: 'folder', order: 100 },
] as const;

/**
 * Gera um array contendo apenas as chaves das categorias.
 * Ex: ['inventory', 'people', 'finance', ...]
 * Ideal para uso em validações com Zod (z.enum).
 */
export const DYNAMIC_TABLE_CATEGORIES = DYNAMIC_TABLE_CATEGORY_CONFIG.map(c => c.key);

/**
 * Gera um tipo Union a partir das chaves das categorias.
 * Ex: 'inventory' | 'people' | 'finance' | ...
 * Isso permite que o TypeScript valide os valores em tempo de compilação.
 */
export type DynamicTableCategory = (typeof DYNAMIC_TABLE_CATEGORIES)[number];
