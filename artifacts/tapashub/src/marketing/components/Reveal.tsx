import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  role?: React.AriaRole;
  "aria-label"?: string;
}

/** Fades + lifts its children into view the first time they enter the viewport. */
export function Reveal({ children, className = "", delay = 0, ...rest }: RevealProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
