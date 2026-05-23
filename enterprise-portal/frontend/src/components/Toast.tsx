import React, { useEffect } from 'react'

export interface ToastData {
  id: string
  message: string
  type?: 'success' | 'error' | 'info'
}

let toastListeners: ((toasts: ToastData[]) => void)[] = []
let toastQueue: ToastData[] = []

export function showToast(message: string, type: ToastData['type'] = 'info') {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  toastQueue = [...toastQueue, { id, message, type }]
  toastListeners.forEach((fn) => fn(toastQueue))
  setTimeout(() => {
    toastQueue = toastQueue.filter((t) => t.id !== id)
    toastListeners.forEach((fn) => fn(toastQueue))
  }, 4000)
}

export default function ToastContainer() {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  useEffect(() => {
    toastListeners = [...toastListeners, setToasts]
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setToasts)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-xl text-sm font-medium max-w-sm animate-in slide-in-from-right ${
            t.type === 'error'
              ? 'bg-red-600 text-white'
              : t.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-portal-card border border-portal-border text-portal-text'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
