import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../lib/utils";

export function Reveal({
  children,
  delay = 0,
  className,
  y = 34,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionLabel({
  children,
  className,
  index,
}: {
  children: React.ReactNode;
  className?: string;
  index?: string;
}) {
  return (
    <div className={cn("label flex items-center gap-3 text-muted", className)}>
      {index && <span className="text-jungle">{index}</span>}
      <span className="h-px w-8 bg-current opacity-40" />
      {children}
    </div>
  );
}

export function ArrowCircle({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full border border-current transition-all duration-500 group-hover:bg-jungle group-hover:border-jungle group-hover:text-cream",
        size === "md" ? "size-14" : "size-10",
        className
      )}
    >
      <ArrowUpRight
        className={cn(
          "transition-transform duration-500 group-hover:rotate-45",
          size === "md" ? "size-6" : "size-4"
        )}
        strokeWidth={1.4}
      />
    </span>
  );
}

export function Field({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label text-muted">{label}</span>
      <input
        {...props}
        className="mt-2 w-full border-b border-current/20 bg-transparent pb-2 text-[15px] outline-none transition-colors placeholder:text-muted/60 focus:border-jungle"
      />
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/5] w-full bg-current/5" />
      <div className="mt-5 h-3 w-24 bg-current/5" />
      <div className="mt-3 h-6 w-3/4 bg-current/5" />
    </div>
  );
}
