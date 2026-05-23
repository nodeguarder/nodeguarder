import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null): string {
  if (!date) return '\u2014'
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateFull(date: string | null): string {
  if (!date) return '\u2014'
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function timeAgo(date: string | null): string {
  if (!date) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'online': return 'badge-online'
    case 'offline': return 'badge-offline'
    case 'revoked': return 'badge-revoked'
    default: return 'badge-offline'
  }
}

export function actionBadgeClass(action: string): string {
  switch (action) {
    case 'REDACTED': case 'AUTO_REDACTED': return 'badge-redact'
    case 'ALLOWED': return 'badge-allow'
    case 'BLOCKED': return 'badge-block'
    default: return 'badge-auto'
  }
}

export const API_BASE = '/api/v1'
