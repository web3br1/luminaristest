import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to persist the Filter Bar's expanded/collapsed state.
 * Uses localStorage to remember the user's preference.
 * 
 * @param storageKey - Unique string to identify this preference (e.g., 'products-filter-open')
 * @param defaultState - Initial state if no preference is saved (default: false)
 * @returns [isOpen, toggle, setIsOpen]
 */
export function useFilterPersistence(storageKey: string, defaultState: boolean = false) {
    // We use a prefix to keep our keys organized
    const fullKey = `filter-bar-${storageKey}`;

    const [isOpen, setIsOpen] = useState<boolean>(() => {
        // Handle SSR - return default if not in browser
        if (typeof window === 'undefined') return defaultState;

        try {
            const saved = localStorage.getItem(fullKey);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (error) {
            console.error(`Error reading ${fullKey} from localStorage:`, error);
            return defaultState;
        }
    });

    // Update localStorage when state changes
    useEffect(() => {
        try {
            localStorage.setItem(fullKey, JSON.stringify(isOpen));
        } catch (error) {
            console.error(`Error saving ${fullKey} to localStorage:`, error);
        }
    }, [isOpen, fullKey]);

    const toggle = useCallback(() => setIsOpen(prev => !prev), []);

    return { isOpen, toggle, setIsOpen };
}
