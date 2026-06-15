export const CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export const DEFAULT_CURRENCY = 'BRL';
export const PROPOSAL_STATUS_ORDER = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'] as const;
export const LEAD_STATUS_ORDER = ['Open', 'Won', 'Lost', 'Disqualified'] as const;
export const UNORDERED_STAGE_SENTINEL = 999; // sentinela p/ etapas sem 'order'
