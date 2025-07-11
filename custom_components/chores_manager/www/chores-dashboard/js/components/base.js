"""Base component utilities."""

window.ChoreComponents = window.ChoreComponents || {};

(function() {
    'use strict';
    
    const { createElement: h } = React;
    
    /**
     * Error Boundary component
     */
    class ErrorBoundary extends React.Component {
        constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
        }
        
        static getDerivedStateFromError(error) {
            return { hasError: true, error };
        }
        
        componentDidCatch(error, errorInfo) {
            console.error('Error caught by boundary:', error, errorInfo);
        }
        
        render() {
            if (this.state.hasError) {
                return h('div', {
                    className: 'error-boundary-container p-4 bg-red-50 text-red-700 rounded-lg'
                },
                    h('h2', { className: 'text-lg font-bold mb-2' }, 'Something went wrong'),
                    h('p', { className: 'mb-2' }, this.state.error?.message || 'An unexpected error occurred'),
                    h('button', {
                        className: 'px-4 py-2 bg-red-200 rounded hover:bg-red-300',
                        onClick: () => {
                            this.setState({ hasError: false, error: null });
                            window.location.reload();
                        }
                    }, 'Reload Application')
                );
            }
            
            return this.props.children;
        }
    }
    
    /**
     * Loading spinner component
     */
    const LoadingSpinner = ({ message = 'Loading...', size = 'medium' }) => {
        const sizeClasses = {
            small: 'w-6 h-6',
            medium: 'w-10 h-10',
            large: 'w-16 h-16'
        };
        
        return h('div', { className: 'flex flex-col items-center justify-center p-4' },
            h('div', {
                className: `${sizeClasses[size]} border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin`
            }),
            message && h('p', { className: 'mt-2 text-gray-600' }, message)
        );
    };
    
    /**
     * Empty state component
     */
    const EmptyState = ({ icon = '📋', title, description, action }) => {
        return h('div', { className: 'text-center py-8' },
            h('div', { className: 'text-4xl mb-4' }, icon),
            h('h3', { className: 'text-lg font-medium text-gray-900 mb-2' }, title),
            description && h('p', { className: 'text-gray-500 mb-4' }, description),
            action && h('div', { className: 'mt-4' }, action)
        );
    };
    
    /**
     * Alert component
     */
    const Alert = ({ type = 'info', title, message, onClose }) => {
        const typeStyles = {
            info: 'bg-blue-50 border-blue-200 text-blue-700',
            success: 'bg-green-50 border-green-200 text-green-700',
            warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
            error: 'bg-red-50 border-red-200 text-red-700'
        };
        
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        
        return h('div', {
            className: `p-4 border rounded-lg ${typeStyles[type]} flex items-start`
        },
            h('span', { className: 'mr-2 text-xl' }, icons[type]),
            h('div', { className: 'flex-1' },
                title && h('h4', { className: 'font-medium mb-1' }, title),
                h('p', null, message)
            ),
            onClose && h('button', {
                className: 'ml-2 hover:opacity-70',
                onClick: onClose
            }, '✕')
        );
    };
    
    /**
     * Modal wrapper component
     */
    const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
        if (!isOpen) return null;
        
        const sizeClasses = {
            small: 'max-w-md',
            medium: 'max-w-lg',
            large: 'max-w-2xl',
            xlarge: 'max-w-4xl'
        };
        
        return h('div', {
            className: 'modal-container',
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }
        },
            h('div', {
                className: `modal-content ${sizeClasses[size]} w-full mx-auto`
            },
                h('div', { className: 'flex justify-between items-center mb-4' },
                    h('h2', { className: 'text-xl font-bold' }, title),
                    h('button', {
                        className: 'text-gray-400 hover:text-gray-600',
                        onClick: onClose
                    }, '✕')
                ),
                children
            )
        );
    };
    
    /**
     * Confirm dialog component
     */
    const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
        if (!isOpen) return null;
        
        return h('div', { className: 'modal-container' },
            h('div', { className: 'confirm-dialog bg-white p-4 rounded-lg shadow-lg max-w-md w-full mx-auto' },
                h('h3', { className: 'text-lg font-medium mb-2' }, title),
                h('p', { className: 'mb-4 text-gray-700' }, message),
                h('div', { className: 'flex justify-end space-x-2' },
                    h('button', {
                        onClick: onCancel,
                        className: 'px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200'
                    }, cancelText),
                    h('button', {
                        onClick: onConfirm,
                        className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700'
                    }, confirmText)
                )
            )
        );
    };
    
    // Export components
    window.ChoreComponents.ErrorBoundary = ErrorBoundary;
    window.ChoreComponents.LoadingSpinner = LoadingSpinner;
    window.ChoreComponents.EmptyState = EmptyState;
    window.ChoreComponents.Alert = Alert;
    window.ChoreComponents.Modal = Modal;
    window.ChoreComponents.ConfirmDialog = ConfirmDialog;
})();