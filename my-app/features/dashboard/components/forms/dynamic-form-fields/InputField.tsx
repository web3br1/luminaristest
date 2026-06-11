import React from 'react';

/**
 * `format` is strictly typed to the tax-ID variants this component actually
 * consumes. Other format hints (e.g. 'email'/'phone') are handled upstream
 * via `type`, so they never reach this component. The polymorphic boundary
 * in DynamicForm narrows from `string` to this union via `===` checks
 * before passing `format` through.
 */
interface InputFieldProps {
  type: 'text' | 'number' | 'date' | 'email' | 'tel';
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  required?: boolean;
  label?: string;
  format?: 'cpf' | 'cnpj';
  readOnly?: boolean;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

function InputField({ type, name, value, onChange, className, required, label, format, readOnly, disabled, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedby }: InputFieldProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(name, event.target.value);
  }

  const isReadOnly = readOnly || disabled;
  const mergedClassName = `${className} text-gray-900 dark:text-gray-100 dark:[color-scheme:dark] placeholder:text-gray-400 dark:placeholder:text-gray-400 ${isReadOnly ? 'opacity-60 cursor-not-allowed bg-gray-50/50 dark:bg-neutral-800/30 border-dashed' : ''}`;

  const inputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    type,
    id: name,
    name,
    value: (value as string | number) ?? '',
    onChange: handleChange,
    className: mergedClassName,
    readOnly,
    disabled,
    ...(ariaInvalid !== undefined && { 'aria-invalid': ariaInvalid }),
    ...(ariaDescribedby !== undefined && { 'aria-describedby': ariaDescribedby }),
  };

  if (type === 'email') {
    inputProps.inputMode = 'email';
    inputProps.placeholder = 'email@example.com';
  }

  if (type === 'tel') {
    inputProps.inputMode = 'tel';
    inputProps.placeholder = '(00) 00000-0000';
    inputProps.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);

      let masked = '';
      if (v.length > 0) {
        if (v.length <= 2) {
          masked = `(${v}`;
        } else if (v.length <= 6) {
          masked = `(${v.slice(0, 2)}) ${v.slice(2)}`;
        } else if (v.length <= 10) {
          masked = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
        } else {
          masked = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
        }
      }

      e.target.value = masked;
      onChange(name, masked);
    };
  }

  // CPF/CNPJ mask
  const lowerName = String(name || '').toLowerCase();
  const lowerLabel = String(label || '').toLowerCase();
  const isTaxId = format === 'cpf' || format === 'cnpj' || lowerName === 'taxid' || lowerName === 'cpf' || lowerName === 'cnpj' || lowerLabel.includes('cpf') || lowerLabel.includes('cnpj');

  if (isTaxId && type === 'text') {
    inputProps.inputMode = 'numeric';
    inputProps.placeholder = '000.000.000-00';
    inputProps.onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 14) v = v.slice(0, 14);

      let masked = '';
      if (v.length <= 11) {
        // CPF
        if (v.length <= 3) masked = v;
        else if (v.length <= 6) masked = `${v.slice(0, 3)}.${v.slice(3)}`;
        else if (v.length <= 9) masked = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
        else masked = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
      } else {
        // CNPJ
        if (v.length <= 2) masked = v;
        else if (v.length <= 5) masked = `${v.slice(0, 2)}.${v.slice(2)}`;
        else if (v.length <= 8) masked = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
        else if (v.length <= 12) masked = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
        else masked = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
      }

      e.target.value = masked;
      onChange(name, masked);
    };
  }

  return <input {...inputProps} />;
}

export default InputField;
