import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Łączy klasy Tailwind, rozstrzygając konflikty (późniejsza wygrywa). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
