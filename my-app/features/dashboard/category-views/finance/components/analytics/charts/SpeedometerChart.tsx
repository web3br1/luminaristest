/**
 * SpeedometerChart (Gauge / Velocímetro)
 *
 * Minimalist SVG gauge chart for percentage KPIs.
 * Clean design: monochrome arc, single accent color needle,
 * only 0 and 100 labels, optional ideal-target marker.
 */

import React, { useMemo } from 'react';
import { useTheme } from '@/lib/hooks/useTheme';

export interface SpeedometerChartProps {
    /** Current percentage value (e.g. 42.5 for 42.5%) */
    value: number;
    /** Chart title */
    title: string;
    /** Minimum value on the scale (default: 0) */
    min?: number;
    /** Maximum value on the scale (default: 100) */
    max?: number;
    /** Optional ideal/target percentage value — renders a green marker */
    idealTarget?: number;
    /** Label for the ideal zone (e.g. "Meta: >20%") */
    idealLabel?: string;
    /** Whether higher values are better (true) or worse (false). Default: true */
    higherIsBetter?: boolean;
    /** Optional suffix for the value display (default: '%') */
    suffix?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2 + 8;
const RADIUS = 90; // Reduced slightly to accommodate thicker stroke
const STROKE_WIDTH = 38; // Thicker as requested
const START_ANGLE = 180; // left
const END_ANGLE = 0;     // right (sweep = 180°)

/**
 * Convert a value in [min, max] to an angle in [START_ANGLE, END_ANGLE].
 */
function valueToAngle(value: number, min: number, max: number): number {
    const clamped = Math.max(min, Math.min(max, value));
    const ratio = (clamped - min) / (max - min || 1);
    return START_ANGLE - ratio * (START_ANGLE - END_ANGLE);
}

/**
 * Convert polar coordinates to SVG Cartesian.
 */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
        x: cx + r * Math.cos(rad),
        y: cy - r * Math.sin(rad),
    };
}

/**
 * Create an SVG arc path descriptor.
 */
function describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number,
): string {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
    const sweep = startAngle > endAngle ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/**
 * Get the minimalist color for the value arc and needle.
 * Using a single solid color (monochrome) for minimalist aesthetics as requested,
 * instead of traffic light colors.
 */
function getNeedleColor(isDark: boolean): string {
    return isDark ? '#f4f4f5' : '#18181b'; // zinc-100 dark mode, zinc-900 light mode
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SpeedometerChart({
    value,
    title,
    min = 0,
    max = 100,
    idealTarget,
    idealLabel,
    higherIsBetter = true,
    suffix = '%',
}: SpeedometerChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const needleAngle = useMemo(
        () => valueToAngle(value, min, max),
        [value, min, max],
    );

    const needleColor = useMemo(
        () => getNeedleColor(isDark),
        [isDark],
    );

    // Needle tip
    const needleTip = useMemo(
        () => polarToCartesian(CX, CY, RADIUS - 6, needleAngle),
        [needleAngle],
    );

    // Ideal target marker
    const idealMarker = useMemo(() => {
        if (idealTarget === undefined) return null;
        const angle = valueToAngle(idealTarget, min, max);
        const outer = polarToCartesian(CX, CY, RADIUS + STROKE_WIDTH / 2 + 4, angle);
        const inner = polarToCartesian(CX, CY, RADIUS - STROKE_WIDTH / 2 - 4, angle);
        return { outer, inner };
    }, [idealTarget, min, max]);

    // Background arc (full semi-circle)
    const bgArc = describeArc(CX, CY, RADIUS, START_ANGLE, END_ANGLE);

    // Value arc
    const valueArc = describeArc(CX, CY, RADIUS, START_ANGLE, needleAngle);

    // Display value
    const displayValue = value % 1 === 0 ? value.toString() : value.toFixed(1);

    // Label positions (only 0 and max)
    const label0 = polarToCartesian(CX, CY, RADIUS + STROKE_WIDTH / 2 + 16, START_ANGLE);
    const label100 = polarToCartesian(CX, CY, RADIUS + STROKE_WIDTH / 2 + 16, END_ANGLE);

    const trackColor = isDark ? '#27272a' : '#e5e7eb';
    const filledTrackColor = isDark ? '#a1a1aa' : '#52525b'; // Subtle filled track color if we wanted to separate from needle, but needleColor is used for the text/needle. Let's make the filled arc the same as needle color.

    return (
        <div className="flex flex-col items-center">
            <svg
                width={SIZE}
                height={SIZE / 2 + 60}
                viewBox={`0 0 ${SIZE} ${SIZE / 2 + 60}`}
                className="overflow-visible"
            >
                {/* Background arc (track) */}
                <path
                    d={bgArc}
                    fill="none"
                    stroke={trackColor}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="butt"
                />

                {/* Filled arc (value) */}
                {value > min && (
                    <path
                        d={valueArc}
                        fill="none"
                        stroke={needleColor} // Minimalist monochrome fill
                        strokeWidth={STROKE_WIDTH}
                        strokeLinecap="butt" // Square edges
                        style={{ transition: 'all 0.5s ease' }}
                    />
                )}

                {/* Min label: 0 */}
                <text
                    x={label0.x}
                    y={label0.y + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[11px] font-medium"
                    fill={isDark ? '#71717a' : '#9ca3af'}
                >
                    {min}
                </text>

                {/* Max label: 100 */}
                <text
                    x={label100.x}
                    y={label100.y + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[11px] font-medium"
                    fill={isDark ? '#71717a' : '#9ca3af'}
                >
                    {max}
                </text>

                {/* Ideal target marker */}
                {idealMarker && (
                    <g>
                        <line
                            x1={idealMarker.inner.x}
                            y1={idealMarker.inner.y}
                            x2={idealMarker.outer.x}
                            y2={idealMarker.outer.y}
                            stroke="#10b981" // Keep the marker itself noticeable but minimalist
                            strokeWidth={3}
                            strokeLinecap="butt" // Square edge marker
                            opacity={1}
                        />
                    </g>
                )}

                {/* Needle */}
                <line
                    x1={CX}
                    y1={CY}
                    x2={needleTip.x}
                    y2={needleTip.y}
                    stroke={needleColor}
                    strokeWidth={4} // Thicker needle
                    strokeLinecap="butt" // Square tip
                    style={{
                        transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                    }}
                />

                {/* Center pivot */}
                <circle
                    cx={CX}
                    cy={CY}
                    r={8}
                    fill={needleColor}
                    stroke={isDark ? '#18181b' : '#ffffff'}
                    strokeWidth={2}
                />

                {/* Value text */}
                <text
                    x={CX}
                    y={CY + 30}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-xl font-bold"
                    fill={needleColor}
                >
                    {displayValue}{suffix}
                </text>
            </svg>

            {/* Ideal target label */}
            {idealTarget !== undefined && (
                <div className="flex items-center gap-1.5 mt-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                        {idealLabel || `Meta: ${idealTarget}${suffix}`}
                    </span>
                </div>
            )}
        </div>
    );
}
