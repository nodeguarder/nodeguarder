import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../utils/cn';

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDangerous = false
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className="bg-card border border-border rounded-xl shadow-lg max-w-md w-full animate-in fade-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "p-2 rounded-lg",
                                isDangerous ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                            )}>
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">
                                {title}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {message}
                    </p>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={cn(
                                "px-4 py-2 text-sm font-medium text-white rounded-md transition-colors",
                                isDangerous
                                    ? "bg-rose-600 hover:bg-rose-700"
                                    : "bg-primary hover:bg-primary/90"
                            )}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
