import { ISchemaField } from '../../models/DynamicTable.model';

// Importações de todos os presets de campos
import * as TextPresets from './text/TextPresets';
import * as NumberPresets from './number/NumberPresets';
import * as BooleanPresets from './boolean/BooleanPresets';
import * as DatePresets from './date/DatePresets';
import * as SelectPresets from './select/SelectPresets';
import * as RelationPresets from './relation/RelationPresets';

/**
 * Interface para representar um preset de campo com metadados para busca semântica
 */
export interface IFieldPresetKnowledge {
  key: string;         // Nome único do campo (ex: "email", "isActive")
  type: string;        // Tipo do campo (ex: "string", "boolean", "number")
  aiDescription: string; // Descrição rica para busca semântica
  synonyms: string[];    // Lista de sinônimos para melhorar a busca
  preset: ISchemaField; // O preset completo do campo
}

/**
 * Base de conhecimento para campos, associando presets a descrições detalhadas.
 * Essas descrições são otimizadas para busca semântica, permitindo que a IA
 * encontre o campo mais relevante com base na solicitação do usuário.
 */
export const fieldPresetKnowledgeBase: IFieldPresetKnowledge[] = [
  // --- Campos de Texto ---
  {
    key: 'name',
    type: 'string',
    aiDescription: 'Campo para armazenar o nome de um item, pessoa, produto ou entidade. É geralmente um campo obrigatório.',
    synonyms: ['nome', 'título', 'identificação', 'denominação'],
    preset: TextPresets.name
  },
  {
    key: 'description',
    type: 'textarea',
    aiDescription: 'Campo de texto longo para armazenar descrições detalhadas de itens, produtos, ou qualquer entidade que necessite de uma explicação mais elaborada.',
    synonyms: ['descrição', 'detalhes', 'sobre', 'informações adicionais', 'texto explicativo'],
    preset: TextPresets.description
  },
  {
    key: 'email',
    type: 'string',
    aiDescription: 'Campo para armazenar endereços de email. Inclui validação de formato de email e geralmente é marcado como único.',
    synonyms: ['e-mail', 'correio eletrônico', 'endereço de email', 'contato eletrônico'],
    preset: TextPresets.email
  },
  {
    key: 'phone',
    type: 'string',
    aiDescription: 'Campo para armazenar números de telefone. Inclui formatação específica para números telefônicos.',
    synonyms: ['telefone', 'celular', 'contato', 'número de telefone', 'fone'],
    preset: TextPresets.phone
  },
  {
    key: 'period',
    type: 'string',
    aiDescription: 'Campo para armazenar períodos de tempo em formato texto, como trimestres, semestres ou anos fiscais.',
    synonyms: ['período', 'intervalo', 'trimestre', 'semestre', 'época'],
    preset: TextPresets.period
  },
  {
    key: 'result',
    type: 'string',
    aiDescription: 'Campo para armazenar resultados ou desfechos de processos, análises ou operações.',
    synonyms: ['resultado', 'desfecho', 'conclusão', 'saída'],
    preset: TextPresets.result
  },
  {
    key: 'brand',
    type: 'string',
    aiDescription: 'Campo para armazenar nomes de marcas, fabricantes ou empresas associadas a um produto ou serviço.',
    synonyms: ['marca', 'fabricante', 'fornecedor', 'empresa'],
    preset: TextPresets.brand
  },
  {
    key: 'sku',
    type: 'string',
    aiDescription: 'Campo para armazenar códigos SKU (Stock Keeping Unit) de produtos. Geralmente é único e usado para identificação em estoque.',
    synonyms: ['código', 'código do produto', 'identificador único', 'referência'],
    preset: TextPresets.sku
  },
  {
    key: 'targetAudience',
    type: 'string',
    aiDescription: 'Campo para armazenar informações sobre o público-alvo de um produto, serviço ou campanha.',
    synonyms: ['público-alvo', 'audiência', 'nicho', 'segmento', 'demografía'],
    preset: TextPresets.targetAudience
  },
  
  // --- Campos Booleanos ---
  {
    key: 'isActive',
    type: 'boolean',
    aiDescription: 'Campo booleano para indicar se um item está ativo ou inativo no sistema.',
    synonyms: ['ativo', 'status', 'habilitado', 'disponível', 'visível'],
    preset: BooleanPresets.isActive
  },
  
  // --- Campos Numéricos ---
  {
    key: 'price',
    type: 'number',
    aiDescription: 'Campo numérico para armazenar preços de produtos ou serviços, geralmente em formato decimal.',
    synonyms: ['preço', 'valor', 'custo', 'tarifa'],
    preset: NumberPresets.price
  },
  
  // --- Campos de Data ---
  {
    key: 'date',
    type: 'date',
    aiDescription: 'Campo de data genérico para registrar datas importantes.',
    synonyms: ['data', 'dia', 'momento'],
    preset: DatePresets.date
  },
  {
    key: 'birthDate',
    type: 'date',
    aiDescription: 'Campo de data para registrar datas de nascimento de pessoas.',
    synonyms: ['data de nascimento', 'nascimento', 'aniversário', 'natalício'],
    preset: DatePresets.birthDate
  }
  
  // Mais campos podem ser adicionados seguindo o mesmo padrão...
];

/**
 * Obtém todos os presets de campos disponíveis.
 * @returns Array com todos os presets de campos cadastrados no sistema
 */
export function getAllFieldPresets(): IFieldPresetKnowledge[] {
  return fieldPresetKnowledgeBase;
}

/**
 * Busca um preset de campo pelo nome exato.
 * @param key Nome do campo (ex: "email", "price")
 * @returns O preset de campo correspondente, ou undefined se não encontrado
 */
export function getFieldPresetByKey(key: string): IFieldPresetKnowledge | undefined {
  return fieldPresetKnowledgeBase.find(preset => preset.key === key);
}

/**
 * Obtém todos os presets de um determinado tipo.
 * @param type Tipo do campo (ex: "string", "number", "boolean")
 * @returns Array com todos os presets do tipo especificado
 */
export function getFieldPresetsByType(type: string): IFieldPresetKnowledge[] {
  return fieldPresetKnowledgeBase.filter(preset => preset.type === type);
}
