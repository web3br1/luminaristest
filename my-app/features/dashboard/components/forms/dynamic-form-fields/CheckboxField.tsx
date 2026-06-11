import React from 'react';

interface CheckboxFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className?: string;
}

function CheckboxField({ name, value, onChange }: CheckboxFieldProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(name, event.target.checked);
  }

  return (
    <label className="relative inline-flex items-center cursor-pointer select-none">
      <input
        type="checkbox"
        id={name}
        name={name}
        checked={!!value}
        onChange={handleChange}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-600" />
      <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

export default CheckboxField;
