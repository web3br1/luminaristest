/**
 * Wizard Modal Components
 * 
 * A reusable wizard/multi-step modal system for complex forms.
 * 
 * @example
 * ```tsx
 * import { WizardModal, WizardTab } from '@/components/ui/wizard';
 * 
 * const tabs: WizardTab[] = [
 *   { id: 'step1', label: 'Informações' },
 *   { id: 'step2', label: 'Itens', badge: 3 },
 *   { id: 'step3', label: 'Pagamento' },
 * ];
 * 
 * <WizardModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Nova Venda"
 *   tabs={tabs}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * >
 *   {activeTab === 'step1' && <Step1 />}
 *   {activeTab === 'step2' && <Step2 />}
 * </WizardModal>
 * ```
 */

export { WizardModal } from './WizardModal';
export { WizardTabBar } from './WizardTabBar';
export type { WizardTab } from './WizardTabBar';
