'use client';

import React from 'react';

interface TruncatedTextProps {
    text: string | number;
    maxLength?: number;
    className?: string;
}

/**
 * A reusable component for truncating text with a hover tooltip
 */
export function TruncatedText({ text, maxLength = 40, className = '' }: TruncatedTextProps) {
    const str = String(text || '');
    if (str.length <= maxLength) return <span className={className}>{str}</span>;

    const truncated = str.slice(0, maxLength) + '...';

    return (
        <span className={className} title={str}>
            {truncated}
        </span>
    );
}
