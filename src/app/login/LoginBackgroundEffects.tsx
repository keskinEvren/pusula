'use client'

/**
 * LoginBackgroundEffects — SVG overlay for route-light & compass-glow animation.
 *
 * Coordinate system: viewBox matches the background image intrinsic size (6688 × 3764).
 * This SVG is placed INSIDE .background alongside the <Image>, sharing the same
 * width/height/left/top CSS so it moves and crops identically with the artwork.
 *
 * Moving light:
 * Concentric circular light (outer halo + bright core dot) animated along the route
 * path using CSS motion-path (offset-path & offset-distance).
 * Completely round, symmetrical, no tail, no cone, no dash.
 */

import styles from './login.module.css'

/** Compass center in image-pixel coordinates */
const CX = 4061
const CY = 1843

export function LoginBackgroundEffects() {
  return (
    <svg
      className={styles.backgroundGeometry}
      viewBox="0 0 6688 3764"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable={false}
    >
      <defs>
        {/* Soft, wide symmetrical blur for expansive outer horizon */}
        <filter id="light-halo-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="30" />
        </filter>

        {/* Mid halo blur for smooth luminance falloff */}
        <filter id="light-mid-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" />
        </filter>

        {/* Subtle blur for bright core */}
        <filter id="light-core-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>

        {/* Compass radial glow gradient */}
        <radialGradient id="compass-glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ===================== MOVING ROUND LIGHT ===================== */}
      {/* Concentric circles positioned at (0,0) and animated along the route via CSS offset-path */}
      <g className={styles.movingLightGroup}>
        {/* Expansive outer horizon: soft, distant atmospheric glow (~105px in image-space ≈ 70px diameter on 1920x1080) */}
        <circle
          cx="0"
          cy="0"
          r="105"
          fill="#3b82f6"
          opacity="0.5"
          filter="url(#light-halo-glow)"
        />

        {/* Mid halo: smooth inner gradient bridge (~55px in image-space ≈ 37px diameter on 1920x1080) */}
        <circle
          cx="0"
          cy="0"
          r="55"
          fill="#60a5fa"
          opacity="0.75"
          filter="url(#light-mid-glow)"
        />

        {/* Core: slightly enlarged, brilliant white circular dot (~23px in image-space ≈ 15.5px diameter on 1920x1080) */}
        <circle
          cx="0"
          cy="0"
          r="23"
          fill="#ffffff"
          opacity="1"
          filter="url(#light-core-glow)"
        />
      </g>

      {/* ===================== COMPASS GLOW ===================== */}
      <circle
        cx={CX}
        cy={CY}
        r="280"
        fill="url(#compass-glow-grad)"
        className={styles.compassGlow}
      />

      {/* Single subtle pulse ring */}
      <circle
        cx={CX}
        cy={CY}
        r="113"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="4"
        className={styles.compassPulse}
      />
    </svg>
  )
}
