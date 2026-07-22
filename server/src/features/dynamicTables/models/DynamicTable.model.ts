import type { DynamicTable, DynamicTableData } from 'generated/prisma';

// Base interface for the DynamicTable model, extending the Prisma generated type
export interface IDynamicTable extends Omit<DynamicTable, 'schema' | 'internalName'> {
  schema: ITableSchema;
  internalName?: string | null;
  presetKey?: string;
}

// Base interface for the DynamicTableData model, extending the Prisma generated type
export interface IDynamicTableData extends DynamicTableData { }

export interface IFieldRelation {
  targetTable: string;
  allowMultiple?: boolean;
  broken?: boolean;
}

/**
 * Defines the overall schema for a dynamic table, containing an array of fields.
 */
export interface ISchemaField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'relation' | 'select' | 'textarea' | 'json';
  format?: 'email' | 'phone' | 'cpf' | 'cnpj' | 'url' | 'custom';
  numberFormat?: 'currency' | 'percentage' | 'integer' | 'decimal';
  description?: string;
  options?: string[];
  regex?: string;
  required: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  hidden?: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    minValue?: number;
    maxValue?: number;
  };
  relation?: IFieldRelation;
  /**
   * If true, this field cannot be modified via `updateTableData`.
   * The backend will reject any payload that attempts to change it.
   * The frontend should hide or disable the field in edit forms.
   */
  readOnly?: boolean;
  /**
   * If false, this field is excluded from full-text search filtering.
   * Default: true (all fields are searchable unless explicitly opted out).
   * Set to false for numeric, date, relation and boolean fields to reduce search noise.
   */
  searchable?: boolean;
  /**
   * Makes the field conditionally required based on another field's value.
   * The field becomes required only when the condition is satisfied.
   * Evaluated over the complete merged record (create or update).
   */
  requiredIf?: {
    /** The name of the field whose value is evaluated. */
    field: string;
    /** Comparison operator. */
    op: 'eq' | 'neq' | 'in';
    /** Value to compare against. For 'in', provide an array. */
    value: string | number | boolean | Array<string | number | boolean>;
  };
}

export interface IDeleteConstraint {
  type: 'RESTRICT' | 'CASCADE' | 'RESTRICT_IF_AGGREGATE' | 'IGNORE';
  targetTable: string;
  aggregate?: {
    field: string;
    operator: 'gt' | 'lt' | 'eq' | 'neq';
    value: number;
  };
  cascadeCondition?: 'ALWAYS' | 'IF_AGGREGATE_MATCH';
  errorMessage?: string;
}

/**
 * Declares a multi-field uniqueness constraint enforced by the service layer.
 * Equivalent to a composite UNIQUE index, but stored as schema metadata.
 */
export interface ICompositeUniqueRule {
  /** List of field names that must be unique in combination. */
  fields: string[];
  errorMessage?: string;
}

/**
 * Declares that certain fields (or the entire record) become immutable
 * once a specified condition is met (e.g. status = 'Paid').
 */
export interface IImmutableAfterRule {
  /** The condition that triggers immutability. */
  condition: {
    field: string;
    op: 'eq' | 'in';
    value: string | string[];
  };
  /**
   * 'all' = block any change to the record.
   * string[] = list of field.name values that become read-only.
   */
  scope: 'all' | string[];
  errorMessage?: string;
}

/**
 * Declares a cross-field comparison rule enforced at create and update.
 * Both referenced fields must be present for the comparison to run;
 * if either is absent the rule is skipped (presence is enforced by `required`/`requiredIf`).
 */
export interface ICompareRule {
  /** Name of the left-hand field. */
  left: string;
  /** Comparison operator applied as: left op right */
  op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  /** Name of the right-hand field. */
  right: string;
  /** Human-readable error shown when the rule is violated. */
  errorMessage?: string;
}

/**
 * Declares a finite-state machine over a status field.
 * Validated on update: a record may only move between explicitly allowed states.
 * Same-state writes (no change) and the initial state on create are always allowed.
 * States absent from `transitions` keys are terminal (no outgoing transition).
 */
export interface ILifecycleRule {
  /** The field that holds the state (e.g. 'status'). */
  field: string;
  /** Allowed transitions as { fromState: [allowedToStates...] }. */
  transitions: Record<string, string[]>;
  /** Optional error message override. */
  errorMessage?: string;
}

/**
 * Declares an anti-overlap constraint over a time interval [startField, endField].
 * On create/update, rejects records whose interval overlaps an existing record
 * sharing the same values for every scopeField present on the record.
 * Half-open overlap test: existing.start < new.end AND existing.end > new.start.
 * Skipped when either bound is missing/invalid (presence is enforced by required/compare).
 */
export interface INoOverlapRule {
  /** Field holding the interval start (date/datetime). */
  startField: string;
  /** Field holding the interval end (date/datetime). */
  endField: string;
  /**
   * Fields that scope the conflict (e.g. ['unitId', 'responsibleEmployeeId']).
   * A scope field absent/empty on the record is ignored.
   */
  scopeFields?: string[];
  /** Optional error message override. */
  errorMessage?: string;
}

export interface ITableSchema {
  defaultDisplayField?: string;
  fields: ISchemaField[];
  deleteConstraints?: IDeleteConstraint[];
  /**
   * Composite uniqueness constraints — fields that must be unique in combination.
   * Checked during createTableData and updateTableData.
   */
  compositeUnique?: ICompositeUniqueRule[];
  /**
   * Immutability rules — fields or entire records that cannot be changed
   * once a certain condition is met (e.g. paymentStatus = 'Paid').
   * Checked during updateTableData.
   */
  immutableAfter?: IImmutableAfterRule[];
  /**
   * Cross-field comparison rules, e.g. endDate > startDate.
   * Evaluated against the complete merged record on create and update.
   * Skipped when either referenced field is absent.
   */
  compare?: ICompareRule[];
  /**
   * Finite-state machine rules over status-like fields.
   * Enforced on update: only explicitly allowed transitions are permitted.
   * Terminal states (absent from a rule's `transitions` keys) cannot change.
   */
  lifecycle?: ILifecycleRule[];
  /**
   * Anti-overlap constraints over time intervals (e.g. appointment scheduling).
   * Enforced on create and update; bypassed for system-originated writes.
   */
  noOverlap?: INoOverlapRule[];
  /**
   * UI presentation hint.
   * - 'standalone' (default): navigable table; appears in category views.
   * - 'embedded': child/detail of another table (e.g. saleItems); not shown standalone.
   * - 'system': internal infrastructure; never editable by end-users.
   */
  ui?: {
    presentation?: 'standalone' | 'embedded' | 'system';
    [key: string]: unknown;
  };
}