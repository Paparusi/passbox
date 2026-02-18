import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-db62.up.railway.app';
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sotooyxhgkqdgycgvzad.supabase.co';
