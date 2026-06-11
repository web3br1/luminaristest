import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import InputField from './InputField';
import SelectField from './SelectField';

interface SelectOrInputFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  required?: boolean;
  options: Array<string | { label: string; value: string }>;
}

function normalizeOptions(options: SelectOrInputFieldProps['options']): { label: string; value: string }[] {
  return (options || []).map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : { label: String(opt.label ?? opt.value), value: String(opt.value ?? opt.label) }
  );
}

export default function SelectOrInputField({ name, value, onChange, className, required, options }: SelectOrInputFieldProps) {
  const { t } = useTranslation(['common']);
  const normalized = normalizeOptions(options);
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    // If current value is not one of the options, start in simple mode
    const has = normalized.some(o => o.value === value);
    return Boolean(value) && !has;
  });

  useEffect(() => {
    // Sync mode if external value changes to a non-option
    const has = normalized.some(o => o.value === value);
    if (value && !has) setSimpleMode(true);
  }, [value, options]);

  return (
    <div>
      <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-2">
        <button
          type="button"
          onClick={() => setSimpleMode(true)}
          className={`px-3 py-1.5 text-xs ${simpleMode ? 'bg-blue-600 text-white' : 'bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300'}`}
        >{t('simple', 'Simple')}</button>
        <button
          type="button"
          onClick={() => setSimpleMode(false)}
          className={`px-3 py-1.5 text-xs ${!simpleMode ? 'bg-blue-600 text-white' : 'bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300'}`}
        >{t('select_from_list', 'Select from list')}</button>
      </div>
      {simpleMode ? (
        <InputField name={name} value={value} onChange={onChange} className={className} required={required} type="text" />
      ) : (
        <SelectField name={name} value={value} onChange={onChange} className={className} required={required} options={normalized} />
      )}
    </div>
  );
}


