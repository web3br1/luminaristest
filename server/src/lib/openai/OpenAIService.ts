import OpenAI from 'openai';
import { logger } from '../logger';

// Global configuration for token limits and models
const CONFIG = {
  // Maximum tokens to process in a single request (system-wide limit)
  MAX_TOKENS_PER_REQUEST: 100000,

  // Maximum characters per chunk to stay within token limits for GPT-3.5
  // Approximately 1 token = 4 characters in English
  MAX_CHARS_PER_CHUNK: 3000,

  // Model selection
  MODELS: {
    // Default model for structured data extraction (cheapest)
    DEFAULT: 'gpt-3.5-turbo-0125',

    // Fallback model for when DEFAULT fails (more reliable but expensive)
    FALLBACK: 'gpt-4o-mini',

    // Model for chat completions (good balance of quality and cost)
    CHAT: 'gpt-3.5-turbo',

    // Model for tool usage (requires tool capabilities)
    TOOLS: 'gpt-4o'
  },

  // Output token limit per API call
  MAX_OUTPUT_TOKENS: 4096,

  // Flag to enable fallback to more powerful model
  ENABLE_FALLBACK: true
};

// Mecanismo para prevenir chamadas simultâneas
class RequestLock {
  private static locks = new Map<string, Promise<any>>();

  static async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Verificar se já existe um lock para esta chave
    if (this.locks.has(key)) {
      console.log(`[RequestLock] Reutilizando lock existente para: ${key}`);
      // Se já existe, espera a resolução do lock atual e retorna o resultado
      return this.locks.get(key) as Promise<T>;
    }

    // Criar novo lock
    console.log(`[RequestLock] Criando novo lock para: ${key}`);
    const promise = fn().finally(() => {
      // Liberar o lock quando a operação for concluída
      console.log(`[RequestLock] Liberando lock para: ${key}`);
      this.locks.delete(key);
    });

    // Armazenar o lock
    this.locks.set(key, promise);
    return promise;
  }
}

export class OpenAIService {
  private openai: OpenAI;
  private static instance: OpenAIService;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is not set. Please set OPENAI_API_KEY environment variable.");
      // This error should ideally be caught and handled by the calling service
      throw new Error("OpenAI API key not configured.");
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Singleton pattern
  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  public async getChatCompletion(
    userMessage: string,
    systemPrompt: string = "You are a helpful assistant."
  ): Promise<string | null> {
    // Criar um identificador único baseado na mensagem e no prompt do sistema
    const requestId = this.createRequestHash(userMessage, systemPrompt);

    // Usar o mecanismo de lock para garantir apenas uma chamada concorrente
    return RequestLock.acquire(requestId, async function () {
      try {
        console.log(`[OpenAIService] Executando chamada para OpenAI com requestId: ${requestId.substring(0, 8)}...`);

        // Aqui usamos uma função declarada em vez de arrow function conforme regra [003]
        const instance = OpenAIService.getInstance();
        const completion = await instance.openai.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          model: CONFIG.MODELS.CHAT,
        });
        return completion.choices[0]?.message?.content;
      } catch (error) {
        console.error("Error getting chat completion from OpenAI:", error);
        throw new Error("Failed to get response from AI service.");
      }
    });
  }

  /**
   * Cria um hash simples para identificar unicamente uma requisição
   */
  private createRequestHash(userMessage: string, systemPrompt: string): string {
    // Simplificado - em produção pode-se usar um algoritmo de hash mais robusto
    const text = `${systemPrompt}:${userMessage}`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converte para 32bit integer
    }
    return `request-${hash}`;
  }

  public async getChatCompletionWithHistory(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    model: string = CONFIG.MODELS.CHAT
  ): Promise<string | null> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: messages,
        model: model,
      });
      return completion.choices[0]?.message?.content;
    } catch (error) {
      console.error("Error getting chat completion from OpenAI with history:", error);
      // Consider more specific error handling or re-throwing a custom error class
      throw new Error("Failed to get response from AI service with history.");
    }
  }

  public async getChatCompletionWithTools(
    userMessage: string,
    systemPrompt: string,
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    model: string = "gpt-4o"
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    return this.getChatCompletionWithToolsAndHistory(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools,
      model
    );
  }

  public async getChatCompletionWithToolsAndHistory(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    model: string = "gpt-4o"
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: messages,
        model: model,
        tools: tools,
        tool_choice: "auto",
      });
      return completion.choices[0]?.message;
    } catch (error) {
      console.error("Error getting chat completion from OpenAI with tools and history:", error);
      throw new Error("Failed to get response from AI service with tools and history.");
    }
  }

  /**
   * Validates if the given text content is structured as a table or spreadsheet.
   * @param textContent The text extracted from a document.
   * @returns A boolean indicating if the content is tabular.
   */
  public async isTextTabular(textContent: string): Promise<boolean> {
    const systemPrompt = `Você é um assistente de validação de dados altamente especializado. Sua única tarefa é determinar se o texto fornecido está estruturado como uma tabela, planilha ou formato tabular semelhante. Responda apenas com 'true' se for tabular e 'false' se não for. Não forneça nenhuma explicação ou texto adicional.`;

    const textSample = textContent.substring(0, 4000);

    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: textSample },
        ],
        model: CONFIG.MODELS.CHAT,
        temperature: 0,
        max_tokens: 5,
      });

      const response = completion.choices[0]?.message?.content?.trim().toLowerCase();

      return response === 'true';

    } catch (error) {
      console.error("Error validating tabular content with OpenAI:", error);
      // To be safe, if the validation fails, we assume the document is not tabular.
      return false;
    }
  }

  /**
   * Extracts tabular data from a text string and returns it in a structured JSON format.
   * @param textContent The text extracted from a document.
   * @returns An object with headers and data, or null if extraction fails.
   */
  /**
   * Estimates token count based on character length
   * @param text Text to estimate tokens for
   * @returns Estimated token count
   */
  private estimateTokenCount(text: string): number {
    // Average of 4 characters per token in English
    return Math.ceil(text.length / 4);
  }

  /**
   * Verifies if the total token count is within global limits
   * @param totalTokens Estimated total tokens
   */
  private verifyTokenLimit(totalTokens: number): void {
    if (totalTokens > CONFIG.MAX_TOKENS_PER_REQUEST) {
      throw new Error(`Document exceeds maximum token limit of ${CONFIG.MAX_TOKENS_PER_REQUEST}. ` +
        `Estimated tokens: ${totalTokens}. Please upload a smaller document.`);
    }
  }

  /**
   * Attempts to fix malformed JSON strings returned by the LLM.
   * Tries common repairs (vírgulas sobrando, aspas faltantes, etc.).
   * Retorna a string corrigida ou null se não for possível reparar.
   */
  private tryFixMalformedJson(jsonString: string): string | null {
    try {
      JSON.parse(jsonString);
      return jsonString; // já é válido
    } catch (_) {
      // continua
    }
    try {
      // remove vírgulas sobrando antes de ] ou }
      let fixed = jsonString.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
      // adiciona aspas faltantes em chaves
      fixed = fixed.replace(/(\{|,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      // substitui aspas "smart" por aspas simples
      fixed = fixed.replace(/[""]/g, '"');
      JSON.parse(fixed);
      return fixed;
    } catch (_) {
      return null;
    }
  }

  /**
   * Extracts structured data from text content
   * @param textContent The extracted text from the file
   * @returns Object with structured data, or null if extraction fails
   */
  public async extractStructuredData(
    textContent: string,
    useFallback = false
  ): Promise<any | null> {
    const estimatedTokens = this.estimateTokenCount(textContent);
    logger.info(`Extracting structured data. Estimated tokens: ${estimatedTokens}`);
    this.verifyTokenLimit(estimatedTokens);

    const model = useFallback ? CONFIG.MODELS.FALLBACK : CONFIG.MODELS.DEFAULT;
    logger.info(`Using model: ${model}`);

    const systemPrompt = `
      You are a highly specialized data extraction engine. Your task is to analyze the provided text, identify the tabular data within it, and convert it into a structured JSON object.

      IMPORTANT: First, check if the input contains markers for multiple Excel sheets like "=== MULTI-SHEET EXCEL FILE ===", "=== SHEET 1: SheetName ===" etc.

      For MULTI-SHEET data, use this structure:
      {
        "headers": [], // Keep this empty array for backwards compatibility
        "data": {
          "sheets": [
            {
              "name": "Sheet1Name",
              "headers": [
                { "key": "column_key_1", "title": "Column Title 1", "type": "DataType1" }
              ],
              "data": [
                ["row1_col1_value", "row1_col2_value"],
                ["row2_col1_value", "row2_col2_value"]
              ]
            }
          ]
        }
      }

      For SINGLE-SHEET data, use the traditional structure:
      {
        "headers": [
          { "key": "column_key_1", "title": "Column Title 1", "type": "DataType1" }
        ],
        "data": [
          ["row1_col1_value", "row1_col2_value"]
        ]
      }

      - "headers": An array of objects, where each object represents a column.
        - "key": A unique, machine-readable key for the column (e.g., 'user_name'). Use snake_case.
        - "title": The human-readable title for the column header (e.g., 'User Name').
        - "type": The inferred data type. MUST be one of: 'TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE'.
      - "data": An array of arrays for single sheets, or an object with a "sheets" array for multi-sheet data.

      Analyze the data carefully. Do not include any explanations or additional text outside of the required JSON object.
    `;

    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: textContent },
        ],
        model: model,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: CONFIG.MAX_OUTPUT_TOKENS,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('OpenAI returned an empty response.');
      }

      try {
        return JSON.parse(responseContent);
      } catch (e) {
        logger.warn('Failed to parse original JSON, attempting to fix.', { error: e, rawJson: responseContent });
        const repaired = this.tryFixMalformedJson(responseContent);
        if (repaired) {
          logger.info('Successfully repaired and parsed malformed JSON.');
          return JSON.parse(repaired);
        }
        throw new Error('Failed to parse and repair JSON response.');
      }
    } catch (error) {
      logger.error(`Error extracting data with model ${model}:`, { error });
      if (!useFallback && CONFIG.ENABLE_FALLBACK) {
        logger.info(`Fallback enabled. Retrying with ${CONFIG.MODELS.FALLBACK}...`);
        return this.extractStructuredData(textContent, true); // Recursive call for fallback
      }
      return null;
    }
  }
}