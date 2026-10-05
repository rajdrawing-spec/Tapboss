import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BRANDS } from "../data/brands";

/**
 * The TapasHub ecosystem diagram: a center node with every brand connected
 * around it. Positions are computed on a circle so adding/removing a brand
 * in brands.ts never needs a layout change here.
 */
export function EcosystemVisual({ className = "" }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const size = 440;
  const center = size / 2;
  const radius = 170;
  const nodeRadius = 30;

  const nodes = BRANDS.map((brand, i) => {
    const angle = (i / BRANDS.length) * Math.PI * 2 - Math.PI / 2;
    return {
      brand,
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full"
        role="img"
        aria-label="The TapasHub ecosystem, connecting ten brands around one company"
      >
        {nodes.map(({ brand, x, y }) => (
          <motion.line
            key={`line-${brand.slug}`}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke={brand.accent}
            strokeOpacity={0.25}
            strokeWidth={1.5}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, delay: 0.1 }}
          />
        ))}

        <motion.circle
          cx={center}
          cy={center}
          r={54}
          className="fill-background stroke-primary"
          strokeWidth={2}
          initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <text
          x={center}
          y={center + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}
        >
          TAPASHUB
        </text>

        {nodes.map(({ brand, x, y }, i) => (
          <motion.g
            key={brand.slug}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
          >
            <circle cx={x} cy={y} r={nodeRadius} className="fill-card stroke-border" strokeWidth={1} />
            <circle cx={x} cy={y} r={3} fill={brand.accent} />
            <text
              x={x}
              y={y + nodeRadius + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {brand.name}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
