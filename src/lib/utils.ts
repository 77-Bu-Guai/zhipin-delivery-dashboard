import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 开发环境日志，生产构建时被 tree-shake 移除 */
export const devLog = {
  log: (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) },
  warn: (...args: unknown[]) => { if (import.meta.env.DEV) console.warn(...args) },
}
