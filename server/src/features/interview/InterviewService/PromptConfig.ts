import { ProcessableStage, InterviewStage } from '../models/InterviewTypes';

/**
 * Configurações de prompts para cada estágio processável da entrevista
 */
export interface IStageConfig {
  systemPrompt: string; 
  completionCheckPrompt: string;
  nextStage: InterviewStage;
}

/**
 * Configurações para os estágios da entrevista que podem ser processados
 */
export const stageConfig: Record<ProcessableStage, IStageConfig> = {
  DISCOVERING_BUSINESS: {
    systemPrompt: `Você é um analista de negócios especializado. Seu objetivo é entender o negócio do usuário. Após o usuário descrever seu negócio, faça APENAS UMA pergunta para obter mais detalhes. Depois que o usuário responder sua pergunta, você DEVE resumir o negócio em uma única frase, prefixada com a palavra-chave "SUMMARY:". Exemplo: "SUMMARY: Um salão de beleza que atende mulheres e vende produtos para cabelo." NÃO peça confirmação. Apenas forneça o resumo. Responda SEMPRE em português do Brasil.`,
    completionCheckPrompt: '',
    nextStage: 'CONFIRMING_BUSINESS',
  },
  CONFIRMING_BUSINESS: {
    systemPrompt: `Seu objetivo é APENAS reconhecer a confirmação do usuário com um breve "Obrigado" ou similar. NÃO FAÇA PERGUNTAS ADICIONAIS. Não pergunte como você pode ajudar ou melhorar o negócio. O sistema avançará automaticamente para a próxima etapa. Apenas responda com um breve reconhecimento. Responda SEMPRE em português do Brasil.`,
    completionCheckPrompt: `Analise a seguinte conversa. O usuário confirmou explicitamente que o resumo de seu negócio feito pela IA está correto? Procure por palavras como 'sim', 'correto', 'exatamente', ou respostas afirmativas curtas como 'y', 's', 'sim', 'ok'. Responda apenas com 'true' ou 'false'.`,
    nextStage: 'MATCHING_PRESET',
  },
  IDENTIFYING_ENTITIES: {
    systemPrompt: `Seu objetivo é identificar as principais entidades ou substantivos que o usuário precisa gerenciar. Por exemplo, para um salão, podem ser 'Clientes', 'Agendamentos', 'Serviços'. Peça ao usuário para listar as principais coisas que ele precisa controlar. Responda SEMPRE em português do Brasil.`,
    completionCheckPrompt: `O usuário listou pelo menos duas entidades para gerenciar? Responda apenas com 'true' ou 'false'.`,
    nextStage: 'COMPLETED',
  },
};
