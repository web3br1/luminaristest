import React, { useState, useCallback, ComponentType } from 'react';
import type { ISchemaField, ITableSchema } from '../shared/dynamic-tables.client';
import RelationSelector from './RelationSelector';
import InputField from './dynamic-form-fields/InputField';
import CurrencyField from './dynamic-form-fields/CurrencyField';
import PercentageField from './dynamic-form-fields/PercentageField';
import WorkScheduleField from './dynamic-form-fields/WorkScheduleField';
import TextareaField from './dynamic-form-fields/TextareaField';
import SelectField from './dynamic-form-fields/SelectField';
import SelectOrInputField from './dynamic-form-fields/SelectOrInputField';
import CheckboxField from './dynamic-form-fields/CheckboxField';
import SliderDiscrete from './dynamic-form-fields/SliderDiscrete';
import CepAddressField from './dynamic-form-fields/CepAddressField';
import { useTranslation } from 'next-i18next';
import { notify } from '@/lib/notifications/notify';

// Technical fields that should be ignored in the UI
const TECHNICAL_FIELDS = ['id', 'order', 'createdAt', 'updatedAt', 'internalName', 'userId', 'dynamicTableId'];

interface DynamicFormProps {
  schema: ITableSchema;
  onSubmit: (data: Record<string, unknown>) => void;
  onClose: () => void;
  initialData?: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  formError?: string | null; // Erro global do formulário
  onChange?: () => void;
  isSubmitting?: boolean;
}

/**
 * Shared shape of every field component's props. Field-specific extensions
 * (e.g. `format` on InputField, `options` on SelectField) flow through as
 * extra props — fields ignore what they don't need.
 *
 * `value: unknown` here matches the polymorphic nature of dynamic forms;
 * each field is responsible for its own value coercion.
 */
interface FieldComponentProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className?: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  format?: string;
  options?: Array<string | { label: string; value: string }>;
  applyPatch?: (patch: Record<string, unknown>) => void;
  targetTable?: string;
  displayField?: string;
  multiple?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Field dispatch
// ─────────────────────────────────────────────────────────────
//
// Each entry receives the shared `FieldComponentProps` and threads only the
// props the target component actually needs. Field components widened their
// `value`/`format` to `unknown`/`string` so this dispatcher no longer needs
// any `as any` escapes — the polymorphism is honest at the type level.

function asInputClass(className: string | undefined): string {
  // InputField requires `className: string`. Defaults to '' when the parent
  // didn't compute one (e.g. boolean branch in renderField).
  return className ?? '';
}

const fieldComponentMap: Record<string, ComponentType<FieldComponentProps>> = {
  string: (props) => {
    const n = String(props.name || '').toLowerCase();
    const format = props.format;
    const className = asInputClass(props.className);

    // ZIP/CEP fields
    if (n === 'zip' || n === 'zipcode' || n === 'cep' || n === 'zip_code') {
      return (
        <CepAddressField
          name={props.name}
          value={props.value}
          onChange={props.onChange}
          applyPatch={props.applyPatch}
          className={className}
          disabled={props.disabled}
        />
      );
    }

    // Format property takes priority, fallback to name heuristics
    const inputBase = {
      name: props.name,
      value: props.value,
      onChange: props.onChange,
      className,
      required: props.required,
      readOnly: props.readOnly,
      disabled: props.disabled,
      label: props.label,
    };

    if (format === 'email' || n.includes('email')) return <InputField {...inputBase} type="email" />;
    if (format === 'phone' || n.includes('phone') || n.includes('telefone') || n.includes('tel')) return <InputField {...inputBase} type="tel" />;
    if (format === 'cpf' || format === 'cnpj') return <InputField {...inputBase} type="text" format={format} />;

    return <InputField {...inputBase} type="text" />;
  },
  number: (props) => (
    <InputField
      name={props.name}
      value={props.value}
      onChange={props.onChange}
      className={asInputClass(props.className)}
      required={props.required}
      readOnly={props.readOnly}
      disabled={props.disabled}
      label={props.label}
      type="number"
    />
  ),
  date: (props) => (
    <InputField
      name={props.name}
      value={props.value}
      onChange={props.onChange}
      className={asInputClass(props.className)}
      required={props.required}
      readOnly={props.readOnly}
      disabled={props.disabled}
      label={props.label}
      type="date"
    />
  ),
  datetime: (props) => (
    <InputField
      name={props.name}
      value={props.value}
      onChange={props.onChange}
      className={asInputClass(props.className)}
      required={props.required}
      readOnly={props.readOnly}
      disabled={props.disabled}
      label={props.label}
      type="date"
    />
  ), // Fallback to date for now
  textarea: TextareaField as ComponentType<FieldComponentProps>,
  select: SelectField as ComponentType<FieldComponentProps>,
  boolean: CheckboxField as ComponentType<FieldComponentProps>,
  checkbox: CheckboxField as ComponentType<FieldComponentProps>,
  relation: RelationSelector as ComponentType<FieldComponentProps>,
};

// Heurística: se o campo parece ser monetário, usar CurrencyField para visual elegante BRL
const currencyFieldNames = new Set(['price', 'salePrice', 'unitPrice', 'cost', 'amount', 'discount', 'subtotal', 'total', 'sellingPrice']);

function DynamicForm({ schema, onSubmit, onClose, initialData = {}, fieldErrors = {}, formError, onChange, isSubmitting }: DynamicFormProps) {
  const { t } = useTranslation(['database', 'common']);
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const handleFieldChange = useCallback((name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (onChange) onChange();
    // Clear error when user types
    if (localErrors[name]) {
      setLocalErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, [onChange, localErrors]);

  const handleSubmit = useCallback((e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const payload: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (const field of schema.fields) {
      if (TECHNICAL_FIELDS.includes(field.name)) continue;

      const key = field.name;
      const value = formData[key];

      // Validation logic
      if (field.required && (value === null || value === undefined || value === '')) {
        errors[key] = t('common:field_required', 'This field is required');
      }

      if (field.type === 'boolean') {
        payload[key] = Boolean(value);
        continue;
      }

      if (value === null || value === undefined || value === '') {
        continue;
      }

      switch (field.type) {
        case 'number': {
          const num = parseFloat(String(value));
          if (isNaN(num)) errors[key] = t('common:invalid_number', 'Invalid numeric value');
          else payload[key] = num;
          break;
        }
        default:
          payload[key] = value;
          break;
      }
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      notify(t('common:validation_error_message', 'Please fill in all required fields correctly.'), 'warning', t('common:warningLabel', 'Warning'));
      return;
    }

    setLocalErrors({});
    onSubmit(payload);
  }, [schema, formData, onSubmit, t]);


  // Address grouping helpers
  const addressFieldNames = new Set(['street', 'addressNumber', 'addressComplement', 'neighborhood', 'city', 'state', 'zip', 'zipCode', 'cep', 'country', 'zip_code']);
  const allFields: ISchemaField[] = schema.fields.filter((field) => !field.hidden);
  const addressFields = allFields.filter((f) => addressFieldNames.has(String(f.name)));
  const nonAddressFields = allFields.filter((f) => !addressFieldNames.has(String(f.name)));
  const addressOrder = ['zipCode', 'cep', 'street', 'addressNumber', 'addressComplement', 'neighborhood', 'city', 'state', 'country'];
  const sortAddress = (a: ISchemaField, b: ISchemaField) => {
    const ai = addressOrder.indexOf(String(a.name));
    const bi = addressOrder.indexOf(String(b.name));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  };

  function renderField(field: ISchemaField) {
    const isCurrency = field.type === 'number' && (currencyFieldNames.has(field.name) || /price|amount|total|subtotal|valor|pre(ç|c)o/i.test(field.name));
    const isWorkSchedule = (field.type === 'json' && /workSchedule|schedule|horario/i.test(field.name));
    const isPercentage = field.type === 'number' && (/percent|commission/i.test(field.name));
    const isBantSelect = field.type === 'select' && ['bantbudget', 'bantauthority', 'bantneed', 'banttiming'].includes(String(field.name || '').toLowerCase());
    const isTextarea = field.type === 'textarea' || (field.type === 'string' && /^(description|descri(ç|c)ao|observa(c|ç)oes|observacoes|notes?|summary|resumo)$/i.test(String(field.name || '')));
    const isReportTypeSelect = field.type === 'select' && ((String(field.name || '').toLowerCase() === 'type' && /relat(ó|o)rio|report/i.test(String(field.label || ''))) || /reporttype/i.test(String(field.name || '')));
    const FieldComponent: ComponentType<FieldComponentProps> = isWorkSchedule
      ? (WorkScheduleField as ComponentType<FieldComponentProps>)
      : (isCurrency
        ? (CurrencyField as ComponentType<FieldComponentProps>)
        : (isPercentage
          ? (PercentageField as ComponentType<FieldComponentProps>)
          : (isBantSelect
            ? (SliderDiscrete as ComponentType<FieldComponentProps>)
            : (isTextarea
              ? (TextareaField as ComponentType<FieldComponentProps>)
              : (isReportTypeSelect
                ? (SelectOrInputField as ComponentType<FieldComponentProps>)
                : (fieldComponentMap[field.type] || fieldComponentMap[String(field.type).toLowerCase()] || fieldComponentMap.string))))));
    const errorClass = 'border-red-500 focus:border-red-500 focus:ring-red-500';
    const baseClass = 'mt-1.5 block w-full px-4 py-3 bg-white dark:bg-neutral-900/40 border border-gray-200/60 dark:border-gray-800 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200';
    const finalClassName = `${baseClass} ${isTextarea ? 'min-h-[140px] resize-y leading-relaxed' : ''} ${fieldErrors[field.name] ? errorClass : ''}`;
    const colSpanClass = (isWorkSchedule || isTextarea) ? 'sm:col-span-2' : '';

    const fieldFormat = (field as ISchemaField & { format?: string }).format;
    const componentProps: FieldComponentProps = {
      name: field.name,
      value: formData[field.name],
      onChange: handleFieldChange,
      label: field.label || field.name,
      format: fieldFormat,
      applyPatch: (patch: Record<string, unknown>) => setFormData(prev => ({ ...prev, ...patch })),
      required: field.required,
      readOnly: field.readOnly,
      disabled: field.readOnly,
      ...(field.type === 'select' && { options: field.options || [] }),
      ...(field.type === 'relation' && {
        targetTable: field.relation?.targetTable || '',
        displayField: (field.relation as { displayField?: string } | undefined)?.displayField || 'name',
        multiple: Boolean(field.relation?.allowMultiple),
      }),
    };
    const combinedErrors = { ...localErrors, ...fieldErrors };
    if (field.type !== 'boolean' && !isBantSelect) {
      componentProps.className = `${finalClassName} ${combinedErrors[field.name] ? 'border-red-500' : ''}`;
    }
    return (
      <div key={field.name} className={`flex flex-col space-y-1.5 ${colSpanClass}`}>
        <label htmlFor={field.name} className={`block text-[11px] tracking-widest uppercase font-black ${field.readOnly ? 'text-gray-400' : 'text-gray-500 dark:text-neutral-500'} flex items-center justify-between gap-1`}>
          <div className="flex items-center gap-1">
            {t(`database:fields.${field.name}`, (t(`common:${field.name}`, field.label || field.name) as string)) as string}
            {field.required && <span className="text-red-500 font-bold">*</span>}
            {field.readOnly && <span className="ml-1 normal-case font-medium opacity-60">({t('common:only_reading', 'Read only')})</span>}
          </div>
          {field.type === 'date' && !field.readOnly && (
            <button
              type="button"
              onClick={() => handleFieldChange(field.name, new Date().toISOString().split('T')[0])}
              className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-[10px] font-bold"
            >
              {t('common:today', 'Today')}
            </button>
          )}
        </label>
        <FieldComponent {...componentProps} />
        {combinedErrors[field.name] && (
          <p className="mt-1 text-[11px] text-red-600 font-bold uppercase tracking-tight">
            {t(`common:errors.${combinedErrors[field.name]}`, combinedErrors[field.name])}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="px-1 pb-2">
      {formError && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
          {formError}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pb-6">
        {nonAddressFields.map(renderField)}
        {addressFields.length > 0 && (
          <div className="sm:col-span-2">
            <div className="mt-2 pt-4 border-t border-gray-200/70 dark:border-gray-800/70">
              <div className="text-[11px] tracking-wide uppercase font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('common:dashboard.form.address', 'Address')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {addressFields.sort(sortAddress).map(renderField)}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end mt-6 pt-4 border-t border-gray-200/70 dark:border-gray-800/70">
        <button type="button" onClick={onClose} className="mr-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm">
          {t('common:cancel', 'Cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {isSubmitting ? t('common:savingChangesButton', 'Saving...') : t('common:save_changes', 'Save Changes')}
        </button>
      </div>
    </form>
  );
}

export default DynamicForm;
