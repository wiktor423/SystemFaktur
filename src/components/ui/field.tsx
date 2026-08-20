"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const controlBase =
  "w-full rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors " +
  "border-border-strong hover:border-fg-subtle focus:border-accent focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(controlBase, "h-9.5", invalid && "border-danger focus:border-danger", className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(controlBase, "py-2 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          controlBase,
          // Pozycja tła jako własna właściwość, nie `bg-[right_…]`: skrót z
          // wartością dowolną bywa przez tailwind-merge uznany za kolor tła
          // i kasuje `bg-surface` z bazy. Kontrolka robiła się wtedy
          // przezroczysta, przez co natywna lista rozwijana traciła ciemne tło.
          // Spacje w data URI są zakodowane jako %20, żeby cała wartość
          // pozostała jedną klasą.
          "h-9.5 appearance-none bg-[length:1rem] bg-no-repeat pr-9",
          "[background-position:right_0.6rem_center]",
          "bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%238b8b99%22%20stroke-width=%222%22%20stroke-linecap=%22round%22><path%20d=%22m6%209%206%206%206-6%22/></svg>')]",
          invalid && "border-danger focus:border-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    // `min-w-0` — pole nie może rozpychać komórki siatki, gdy kontrolka
    // (np. natywne `type="date"`) ma dużą szerokość własną.
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-fg-muted">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="flex items-start gap-1.5 text-[12.5px] text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span className="text-[12.5px] text-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 select-none", disabled && "cursor-not-allowed opacity-55", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate && !checked;
        }}
        onChange={(event) => onChange(event.target.checked)}
        className={cn(
          "size-4 appearance-none rounded-[5px] border border-border-strong bg-surface transition-colors",
          "checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent",
          "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M20 6 9 17l-5-5%22/></svg>')] checked:bg-[length:0.7rem] checked:bg-center checked:bg-no-repeat",
          "indeterminate:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22><path d=%22M5 12h14%22/></svg>')] indeterminate:bg-[length:0.7rem] indeterminate:bg-center indeterminate:bg-no-repeat",
        )}
      />
      {label ? <span className="text-sm text-fg">{label}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 select-none", disabled && "cursor-not-allowed opacity-55")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-border-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left]",
            checked ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
      {label ? <span className="text-sm text-fg">{label}</span> : null}
    </label>
  );
}
