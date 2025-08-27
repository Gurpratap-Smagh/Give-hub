import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines CSS classes.
 * @param inputs - The classes to combine.
 * @returns The combined class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number as a currency string.
 * @param amount - The number to format.
 * @param currency - The currency code (e.g., 'USD').
 * @param isCents - Whether the amount is in cents and needs to be divided by 100.
 * @returns The formatted currency string.
 */
export function formatCurrency(amount: number, currency = 'USD', isCents = false): string {
  // If amount is stored as cents in MongoDB, convert to dollars for display
  const displayAmount = isCents ? amount / 100 : amount;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(displayAmount);
}

/**
 * Formats a date object or string into a more readable format.
 * @param date - The date to format.
 * @returns The formatted date string (e.g., 'January 1, 2024').
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Truncates a string to a specified length and adds an ellipsis.
 * @param text - The string to truncate.
 * @param maxLength - The maximum length of the string.
 * @returns The truncated string.
 */
export function truncateText(text: string, maxLength = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}...`;
}
