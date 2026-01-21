import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility function for className merging
// Can be extended to import from web app if needed
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

