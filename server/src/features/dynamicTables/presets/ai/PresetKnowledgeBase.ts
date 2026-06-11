/**
 * Base de conhecimento para a IA, associando chaves de presets a descrições detalhadas.
 * Essas descrições são otimizadas para busca semântica, permitindo que a IA encontre o preset
 * mais relevante com base na descrição do negócio do usuário.
 */

export interface IPresetKnowledge {
  key: string;
  name: string;
  aiDescription: string;
}

export const presetKnowledgeBase: IPresetKnowledge[] = [
  {
    key: 'beautySalon',
    name: 'Salão de Beleza',
    aiDescription: 'Um sistema completo de gestão para negócios na área da beleza, como salões, barbearias, clínicas de estética ou spas. Otimizado para gerenciar o relacionamento com clientes e a agenda. Inclui tabelas para: Clientes (com histórico de visitas), Serviços (catálogo de serviços oferecidos com preço e duração), Agendamentos (para marcar horários, vinculando cliente, serviço e funcionário), Produtos (para venda ou uso interno), Vendas (registrando serviços e produtos), e Funcionários (para comissões e agenda).',
  },
];
