'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { useTranslation } from 'next-i18next';
import type { TFunction } from 'i18next';
import { MdPerson, MdLocationOn, MdWork, MdMoreHoriz } from 'react-icons/md';
import InputField from '../../../components/forms/dynamic-form-fields/InputField';
import CurrencyField from '../../../components/forms/dynamic-form-fields/CurrencyField';
import WorkScheduleField from '../../../components/forms/dynamic-form-fields/WorkScheduleField';
import TextareaField from '../../../components/forms/dynamic-form-fields/TextareaField';
import SelectField from '../../../components/forms/dynamic-form-fields/SelectField';
import CheckboxField from '../../../components/forms/dynamic-form-fields/CheckboxField';
import CepAddressField from '../../../components/forms/dynamic-form-fields/CepAddressField';
import RelationSelector from '../../../components/forms/RelationSelector';

// ─────────────────────────────────────────────────────────────
// Module-level constants — stable references, never recreated on render
// ─────────────────────────────────────────────────────────────

const BASIC_FIELDS = ['name', 'nome', 'email', 'phone', 'telefone', 'taxId', 'cpf', 'cnpj', 'role', 'cargo', 'type', 'tipo'];
const ADDRESS_FIELDS = ['zipCode', 'cep', 'address', 'rua', 'number', 'numero', 'complement', 'complemento', 'neighborhood', 'bairro', 'city', 'cidade', 'state', 'estado', 'country', 'pais'];
const PROF_FIELDS = ['salary', 'salario', 'workSchedule', 'horario', 'hireDate', 'data_contratacao', 'unitId', 'unidade'];

interface PeopleWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    tableId: string;
    schema: ITableSchema | null;
    modalTitle?: string;
}

type WizardField = ISchemaField & {
    format?: string;
    relation?: { targetTable?: string; displayField?: string; allowMultiple?: boolean };
};

interface WizardTab {
    id: string;
    label: string;
    icon: React.ElementType;
    fieldNames: string[];
}

export function PeopleWizardModal({
    isOpen,
    onClose,
    onSuccess,
    onSubmit,
    tableId,
    schema,
    modalTitle
}: PeopleWizardModalProps) {
    const { t } = useTranslation(['common', 'database']);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Categorize fields from schema
    const tabs = useMemo((): WizardTab[] => {
        if (!schema) return [];

        const availableFields = schema.fields.filter(f => !f.hidden && !f.readOnly).map(f => f.name);

        const tabConfigs: WizardTab[] = [
            {
                id: 'basic',
                label: t('wizard.basic_info', 'Informações Básicas'),
                icon: MdPerson,
                fieldNames: availableFields.filter(name => BASIC_FIELDS.includes(name.toLowerCase()) || /name|email|phone|tax|cpf|cnpj|role/i.test(name))
            },
            {
                id: 'address',
                label: t('wizard.address', 'Endereço'),
                icon: MdLocationOn,
                fieldNames: availableFields.filter(name => ADDRESS_FIELDS.includes(name.toLowerCase()) || /zip|cep|address|street|neighborhood|city|state/i.test(name))
            },
            {
                id: 'professional',
                label: t('wizard.professional', 'Profissional'),
                icon: MdWork,
                fieldNames: availableFields.filter(name => PROF_FIELDS.includes(name.toLowerCase()) || /salary|schedule|hire|unit/i.test(name))
            }
        ];

        // Collect all fields already in tabs
        const usedFields = new Set(tabConfigs.flatMap(s => s.fieldNames));

        // Add "Other" tab for remaining fields
        const otherFields = availableFields.filter(name => !usedFields.has(name));
        if (otherFields.length > 0) {
            tabConfigs.push({
                id: 'other',
                label: t('wizard.other', 'Outros'),
                icon: MdMoreHoriz,
                fieldNames: otherFields
            });
        }

        // Filter out tabs with no fields
        return tabConfigs.filter(s => s.fieldNames.length > 0);
    }, [schema, t]);

    const activeTab = tabs[activeTabIndex];

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setActiveTabIndex(0);
            setFormData({});
            setErrors({});
        }
    }, [isOpen]);

    // Close modal on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleFieldChange = (name: string, value: unknown) => {
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
        }
    };

    const validateAll = () => {
        if (!schema) return true;
        const newErrors: Record<string, string> = {};
        let firstErrorTabIndex = -1;

        tabs.forEach((tab, tabIndex) => {
            tab.fieldNames.forEach(fieldName => {
                const field = schema.fields.find(f => f.name === fieldName);
                if (field?.required && (formData[fieldName] === undefined || formData[fieldName] === null || formData[fieldName] === '')) {
                    newErrors[fieldName] = 'required';
                    if (firstErrorTabIndex === -1) {
                        firstErrorTabIndex = tabIndex;
                    }
                }
            });
        });

        setErrors(newErrors);
        if (firstErrorTabIndex !== -1) {
            setActiveTabIndex(firstErrorTabIndex);
            return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (!validateAll()) return;

        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            onSuccess();
        } catch (err: unknown) {
            console.error('Submit error:', err);
            if (err && typeof err === 'object' && 'errors' in err) {
                setErrors((err as { errors: Record<string, string> }).errors);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !schema) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-800/20">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {modalTitle || t('common:new_record', 'Novo Registro')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-full transition-colors text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Tabs Indicator */}
                <div className="px-5 pt-3 bg-gray-50/50 dark:bg-neutral-800/20 flex items-center overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-800">
                    <div className="flex space-x-6">
                        {tabs.map((tab, idx) => {
                            const isActive = idx === activeTabIndex;
                            const hasErrorInTab = tab.fieldNames.some(f => errors[f]);
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTabIndex(idx)}
                                    className={`relative flex flex-col items-center gap-1 pb-3 px-1 border-b-2 text-sm font-medium transition-all ${isActive
                                        ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <span className={`block ${hasErrorInTab && !isActive ? 'text-red-500' : ''}`}>{tab.label}</span>
                                    {hasErrorInTab && <div className="absolute top-1 right-[-4px] w-1.5 h-1.5 rounded-full bg-red-500" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Form Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {activeTab?.fieldNames.map(fieldName => {
                            const field = schema.fields.find(f => f.name === fieldName);
                            if (!field) return null;
                            return renderWizardField(field as WizardField, formData, handleFieldChange, errors, t, setFormData);
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-800/20 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-neutral-800 transition-colors text-sm"
                    >
                        {t('common:cancel', 'Cancelar')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm"
                    >
                        {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            t('common:save_changes', 'Salvar')
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Logic extracted from DynamicForm but adapted for Wizard
function renderWizardField(
    field: WizardField,
    formData: Record<string, unknown>,
    onChange: (name: string, value: unknown) => void,
    errors: Record<string, string>,
    t: TFunction,
    setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
) {
    const isCurrency = field.type === 'number' && (/price|amount|total|subtotal|valor|pre(ç|c)o|salary|salario/i.test(field.name));
    const isWorkSchedule = (field.type === 'json' && /workSchedule|schedule|horario/i.test(field.name));
    const isTextarea = field.type === 'textarea' || (field.type === 'string' && /^(description|descri(ç|c)ao|observa(c|ç)oes|observacoes|notes?|summary|resumo)$/i.test(String(field.name || '')));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let FieldComponent: any = InputField;
    if (isCurrency) FieldComponent = CurrencyField;
    else if (isWorkSchedule) FieldComponent = WorkScheduleField;
    else if (isTextarea) FieldComponent = TextareaField;
    else if (field.type === 'select') FieldComponent = SelectField;
    else if (field.type === 'boolean') FieldComponent = CheckboxField;
    else if (field.type === 'relation') FieldComponent = RelationSelector;
    else if (/zip|cep/i.test(field.name)) FieldComponent = CepAddressField;

    const colSpan = (isWorkSchedule || isTextarea) ? 'sm:col-span-2' : '';
    const error = errors[field.name];

    return (
        <div key={field.name} className={`flex flex-col space-y-2 ${colSpan}`}>
            <label className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                {t(`database:fields.${field.name}`, field.label || field.name)}
                {field.required && <span className="text-red-500">*</span>}
            </label>

            <FieldComponent
                name={field.name}
                value={formData[field.name]}
                onChange={onChange}
                label={field.label || field.name}
                format={field.format}
                required={field.required}
                options={field.options || []}
                applyPatch={(patch: Record<string, unknown>) => setFormData(prev => ({ ...prev, ...patch }))}
                className={`w-full px-5 py-3.5 bg-gray-50 dark:bg-neutral-800/50 border ${error ? 'border-red-500' : 'border-gray-100 dark:border-gray-800'} rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none text-sm`}
                {...(field.type === 'relation' && {
                    targetTable: field.relation?.targetTable,
                    displayField: field.relation?.displayField || 'name',
                    multiple: field.relation?.allowMultiple
                })}
            />

            {error && (
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">
                    {error === 'required' ? t('common:field_required', 'Campo Obrigatório') : error}
                </span>
            )}
        </div>
    );
}
