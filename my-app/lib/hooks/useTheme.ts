import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  // Initialize theme state to undefined or null to indicate it hasn't been determined yet
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDeterminedTheme = storedTheme || (prefersDark ? 'dark' : 'light');
    
    // Apply immediately to avoid flash if possible and set state
    // This complements the script in _document.tsx
    const root = window.document.documentElement;
    if (initialDeterminedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark'); // Ensure light if not dark
    }
    setTheme(initialDeterminedTheme);

  }, []); // Runs once on mount

  useEffect(() => {
    // This effect now primarily handles changes initiated by toggleTheme
    // and ensures localStorage is updated.
    if (theme) { // Only run if theme is determined
      const root = window.document.documentElement;
      if (theme === 'dark') {
        if (!root.classList.contains('dark')) root.classList.add('dark');
      } else {
        if (root.classList.contains('dark')) root.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
    }
  }, [theme]); // Runs when theme state changes

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      // The useEffect above will handle class and localStorage update
      return newTheme;
    });
  }, []);

  return { theme: theme || 'light', toggleTheme }; // Return a default if still undefined, or handle loading state
} 