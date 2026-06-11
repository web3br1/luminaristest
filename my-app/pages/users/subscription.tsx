import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/context/AuthContext';
import withAuth from '../../lib/hoc/withAuth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useTranslation } from 'next-i18next';
import {
    IoCheckmarkOutline,
    IoArrowBackOutline,
    IoSparklesOutline,
    IoRocketOutline,
    IoDiamondOutline,
    IoFlashOutline,
    IoInfiniteOutline,
    IoShieldCheckmarkOutline,
    IoStarOutline,
    IoCloseOutline,
    IoCheckmarkCircleOutline,
} from 'react-icons/io5';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
    props: {
        ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
});

interface Plan {
    id: string;
    name: string;
    price: number;
    description: string;
    icon: React.ReactNode;
    features: string[];
    notIncluded?: string[];
    popular?: boolean;
    gradient: string;
    buttonGradient: string;
    badge?: string;
    accentColor: string;
}

const PLANS: Plan[] = [
    {
        id: 'basic',
        name: 'Básico',
        price: 50,
        description: 'Ideal para quem está começando e quer experimentar os recursos da plataforma.',
        icon: <IoRocketOutline size={22} />,
        features: [
            '5 documentos por mês',
            'Chat com IA básico',
            'Busca semântica',
            '1 GB de armazenamento',
            'Suporte por email',
        ],
        notIncluded: [
            'Extração de dados estruturados',
            'Tabelas dinâmicas',
            'Dashboard personalizado',
            'Suporte prioritário',
        ],
        gradient: 'from-blue-500 to-cyan-500',
        buttonGradient: 'from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600',
        accentColor: 'blue',
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 200,
        description: 'Para profissionais que precisam de recursos avançados e processamento ilimitado.',
        icon: <IoSparklesOutline size={22} />,
        popular: true,
        badge: 'Mais Popular',
        features: [
            'Documentos ilimitados',
            'Chat com IA avançado (GPT-4)',
            'Busca semântica avançada',
            '25 GB de armazenamento',
            'Extração de dados estruturados',
            'Tabelas dinâmicas ilimitadas',
            'Dashboard personalizado',
            'Suporte prioritário 24/7',
        ],
        gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
        buttonGradient: 'from-violet-500 via-purple-500 to-fuchsia-500 hover:from-violet-600 hover:via-purple-600 hover:to-fuchsia-600',
        accentColor: 'violet',
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 1000,
        description: 'Solução completa para empresas com necessidades de segurança e escala.',
        icon: <IoDiamondOutline size={22} />,
        features: [
            'Tudo do plano Pro',
            'Armazenamento ilimitado',
            'SSO e SAML',
            'API dedicada',
            'SLA de 99.9%',
            'Gerenciador de equipe',
            'Auditoria e compliance',
            'Suporte dedicado com gerente de conta',
        ],
        gradient: 'from-amber-500 via-orange-500 to-red-500',
        buttonGradient: 'from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600',
        accentColor: 'amber',
    },
];

function SubscriptionPage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
    const { t } = useTranslation('common');
    const { user: actor } = useAuth();

    const [currentPlan] = useState<string>('free');
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const handleSelectPlan = (planId: string) => {
        setSelectedPlan(planId);
        setShowConfirmModal(true);
    };

    const handleConfirm = () => {
        // Purely visual — no backend call
        setShowConfirmModal(false);
        setSelectedPlan(null);
    };

    const selectedPlanData = PLANS.find(p => p.id === selectedPlan);

    return (
        <div className="min-h-[calc(100vh-60px)] bg-gray-50 dark:bg-neutral-950 custom-scrollbar">
            <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
                {/* Header */}
                <div className="mb-10">
                    <Link
                        href="/users/profile"
                        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6"
                    >
                        <IoArrowBackOutline size={16} />
                        Voltar ao Perfil
                    </Link>

                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4 border border-indigo-100 dark:border-indigo-500/20">
                            <IoFlashOutline size={12} />
                            Assinatura
                        </div>
                        <h1 className="text-3xl lg:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            Escolha o plano ideal
                        </h1>
                        <p className="text-base text-gray-500 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
                            Potencialize sua experiência com inteligência artificial. Comece gratuitamente e escale conforme sua necessidade.
                        </p>
                    </div>
                </div>

                {/* Current plan indicator */}
                <div className="flex justify-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-neutral-800 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/50">
                        <IoShieldCheckmarkOutline size={16} className="text-emerald-500" />
                        Seu plano atual: <span className="font-bold text-gray-900 dark:text-white">Gratuito</span>
                    </div>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                    {PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`relative bg-white dark:bg-neutral-900 border rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group
                ${plan.popular
                                    ? 'border-violet-300 dark:border-violet-500/40 shadow-lg shadow-violet-500/10 dark:shadow-violet-500/5 ring-1 ring-violet-300/60 dark:ring-violet-500/20'
                                    : 'border-gray-200/60 dark:border-gray-800/60 shadow-sm dark:shadow-none'
                                }`}
                        >
                            {/* Popular badge */}
                            {plan.popular && (
                                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${plan.gradient}`} />
                            )}
                            {plan.badge && (
                                <div className="absolute -top-0 right-5">
                                    <div className={`bg-gradient-to-r ${plan.gradient} text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-b-lg shadow-lg`}>
                                        {plan.badge}
                                    </div>
                                </div>
                            )}

                            <div className="p-6 lg:p-8">
                                {/* Plan icon & name */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center text-white shadow-lg shadow-${plan.accentColor}-500/20`}>
                                        {plan.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                                    </div>
                                </div>

                                {/* Price */}
                                <div className="mb-4">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-sm font-medium text-gray-400 dark:text-gray-500">R$</span>
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">{plan.price}</span>
                                        <span className="text-sm font-medium text-gray-400 dark:text-gray-500">/mês</span>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                                    {plan.description}
                                </p>

                                {/* CTA Button */}
                                <button
                                    onClick={() => handleSelectPlan(plan.id)}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]
                    ${plan.popular
                                            ? `text-white bg-gradient-to-r ${plan.buttonGradient} shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30`
                                            : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 border border-gray-200/80 dark:border-gray-700/60'
                                        }`}
                                >
                                    <IoStarOutline size={16} />
                                    {currentPlan === plan.id ? 'Plano Atual' : 'Assinar Agora'}
                                </button>

                                {/* Divider */}
                                <div className="flex items-center gap-3 my-6">
                                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Recursos incluídos</span>
                                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                                </div>

                                {/* Features list */}
                                <ul className="space-y-3">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <div className={`mt-0.5 w-5 h-5 rounded-lg bg-gradient-to-br ${plan.gradient} flex items-center justify-center shrink-0`}>
                                                <IoCheckmarkOutline size={12} className="text-white" />
                                            </div>
                                            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{feature}</span>
                                        </li>
                                    ))}
                                    {plan.notIncluded?.map((feature, idx) => (
                                        <li key={`not-${idx}`} className="flex items-start gap-3 opacity-40">
                                            <div className="mt-0.5 w-5 h-5 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                                <IoCloseOutline size={12} className="text-gray-500 dark:text-gray-400" />
                                            </div>
                                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium line-through">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom info */}
                <div className="mt-12 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                        Todos os planos incluem 7 dias de teste grátis. Cancele a qualquer momento.
                    </p>
                    <div className="flex items-center justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                            <IoShieldCheckmarkOutline size={14} className="text-emerald-500" />
                            Pagamento seguro
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                            <IoInfiniteOutline size={14} className="text-indigo-500" />
                            Sem fidelidade
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* Confirmation Modal                                     */}
            {/* ═══════════════════════════════════════════════════════ */}
            {showConfirmModal && selectedPlanData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowConfirmModal(false)}
                    />

                    {/* Modal */}
                    <div className="relative bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-2xl w-full max-w-md overflow-hidden">
                        {/* Gradient top */}
                        <div className={`h-1.5 bg-gradient-to-r ${selectedPlanData.gradient}`} />

                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className={`inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br ${selectedPlanData.gradient} items-center justify-center text-white shadow-lg mb-4`}>
                                    {selectedPlanData.icon}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    Confirmar assinatura
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Você está prestes a assinar o plano <strong className="text-gray-900 dark:text-white">{selectedPlanData.name}</strong>
                                </p>
                            </div>

                            {/* Price summary */}
                            <div className="bg-gray-50 dark:bg-neutral-800 rounded-xl p-4 mb-6 border border-gray-100 dark:border-gray-700/50">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Plano {selectedPlanData.name}</span>
                                    <span className="text-lg font-bold text-gray-900 dark:text-white">R$ {selectedPlanData.price}/mês</span>
                                </div>
                            </div>

                            {/* Info note */}
                            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 mb-6 border border-amber-200/60 dark:border-amber-800/30">
                                <IoSparklesOutline size={16} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-700 dark:text-amber-300/80">
                                    Este é um ambiente de demonstração. Nenhuma cobrança será realizada.
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 h-11 flex items-center justify-center rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 border border-gray-200/60 dark:border-gray-700/60 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${selectedPlanData.buttonGradient} shadow-md transition-all active:scale-[0.98]`}
                                >
                                    <IoCheckmarkCircleOutline size={16} />
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default withAuth(SubscriptionPage, {
    allowedRoles: ['AUTHENTICATED_USER'],
});
