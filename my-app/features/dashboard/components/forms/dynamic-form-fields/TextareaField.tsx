import React from 'react';

interface TextareaFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  required?: boolean;
}

function TextareaField({ name, value, onChange, className, required }: TextareaFieldProps) {
  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(name, event.target.value);
  }

  return (
    <textarea
      id={name}
      name={name}
      value={value != null ? String(value) : ''}
      onChange={handleChange}
      className={className}
      required={required}
      rows={6}
    />
  );
}

export default TextareaField;
