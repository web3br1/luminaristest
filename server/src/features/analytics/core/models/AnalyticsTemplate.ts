/**
 * Analytics Template System
 *
 * Templates define análises genéricas e reutilizáveis que podem ser "encaixadas"
 * em presets de sistema através de configurações que mapeiam campos específicos.
 */

export type FieldType = 'string' | 'number' | 'select' | 'date' | 'boolean';

/**
 * Defines a field requirement for an analytics template.
 * Specifies what type of field is needed and provides metadata for validation.
 */
export interface FieldRequirement {
  /**
   * Internal key used to reference this field in the processor.
   * Example: 'statusField', 'amountField', 'dateField'
   */
  key: string;

  /**
   * Human-readable label for this field requirement.
   */
  label: string;

  /**
   * Allowed field types for this requirement.
   * The field in the table schema must match one of these types.
   */
  types: FieldType[];

  /**
   * Optional description explaining what this field is used for.
   */
  description?: string;

  /**
   * Whether this field is required or optional.
   * Default: true
   */
  required?: boolean;
}

/**
 * Defines a generic, reusable analytics template.
 * Templates specify what processor to use and what fields are required,
 * but don't specify which actual table fields to use (that's done in the configuration).
 */
export interface AnalyticsTemplate {
  /**
   * Unique key for the template (e.g., 'statusDistribution', 'paymentStatus').
   * Used to reference this template in analytics configurations.
   */
  key: string;

  /**
   * Display name for the template.
   */
  name: string;

  /**
   * Description of what this analysis does.
   */
  description: string;

  /**
   * Key of the processor function to use (must be registered in processors).
   */
  processor: string;

  /**
   * Required fields that must be mapped when using this template.
   */
  requiredFields: FieldRequirement[];

  /**
   * Optional fields that can be mapped for additional functionality.
   */
  optionalFields?: FieldRequirement[];

  /**
   * Default chart options (type, colors, etc.) that can be overridden in configuration.
   */
  defaultOptions?: Record<string, unknown>;

  /**
   * Default parameters that can be overridden in configuration.
   */
  defaultParams?: Record<string, unknown>;

  /**
   * Default display options for the template.
   */
  defaultDisplayOptions?: Record<string, unknown>;

  /**
   * Example configurations for documentation.
   */
  examples?: Array<{
    title: string;
    params: Record<string, unknown>;
  }>;
}

