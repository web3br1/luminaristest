import React from 'react';
import { useTranslation } from 'next-i18next';

interface SelectFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  options: Array<string | { label: string; value: string }>;
  required?: boolean;
}

function SelectField({ name, value, onChange, className, options, required }: SelectFieldProps) {
  const { t } = useTranslation(['database', 'common']);

  function renderOption(option: string | { label: string; value: string }) {
    const isObj = typeof option === 'object';
    const val = isObj ? option.value : option;
    const label = isObj ? option.label : t(`options.${option}`, option);

    return (
      <option
        key={val}
        value={val}
        className="bg-white text-gray-900 dark:bg-neutral-900 dark:text-gray-100"
      >
        {label}
      </option>
    );
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    onChange(name, event.target.value);
  }

  return (
    <select
      id={name}
      name={name}
      value={(value as string) ?? ''}
      onChange={handleChange}
      className={`${className} appearance-none bg-white dark:bg-neutral-900/80 text-gray-900 dark:text-gray-100 border border-gray-200/70 dark:border-gray-700 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
      required={required}
    >
      <option value="" className="text-gray-400 bg-white dark:bg-neutral-900">{t('common:select_placeholder', 'Select...')}</option>
      {options.map(renderOption)}
    </select>
  );
}

export default SelectField;
