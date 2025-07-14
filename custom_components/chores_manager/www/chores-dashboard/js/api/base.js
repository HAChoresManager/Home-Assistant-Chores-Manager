/**
 * Base UI components for the Chores Manager
 * Provides common, reusable components used throughout the application
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Base components require React');
        return;
    }

    const h = React.createElement;

    /**
     * Loading spinner component
     */
    const Loading = ({ message = 'Loading...', size = 'medium' }) => {
        const sizeClasses = {
            small: 'h-8 w-8',
            medium: 'h-12 w-12',
            large: 'h-16 w-16'
        };

        return h('div', { className: 'flex flex-col items-center justify-center p-4' },
            h('div', {
                className: `animate-spin rounded-full border-b-2 border-blue-500 ${sizeClasses[size]}`
            }),
            message && h('p', { className: 'mt-4 text-gray-600' }, message)
        );
    };

    /**
     * Error message component
     */
    const ErrorMessage = ({ error, message, onRetry, onDismiss }) => {
        // Handle different types of error input
        let errorMessage = '';
        if (message) {
            errorMessage = message;
        } else if (error) {
            if (typeof error === 'string') {
                errorMessage = error;
            } else if (error.message) {
                errorMessage = error.message;
            } else {
                errorMessage = 'An unknown error occurred';
            }
        } else {
            errorMessage = 'An error occurred';
        }

        return h('div', { className: 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded' },
            h('div', { className: 'flex items-start' },
                h('span', { className: 'text-xl mr-2' }, '⚠️'),
                h('div', { className: 'flex-1' },
                    h('p', { className: 'font-medium' }, 'An error occurred'),
                    h('p', { className: 'text-sm mt-1' }, errorMessage)
                ),
                h('div', { className: 'flex items-center ml-4' },
                    onRetry && h('button', {
                        className: 'bg-red-200 hover:bg-red-300 text-red-800 font-bold py-1 px-3 rounded mr-2',
                        onClick: onRetry
                    }, 'Retry'),
                    onDismiss && h('button', {
                        className: 'text-red-600 hover:text-red-800',
                        onClick: onDismiss
                    }, '✕')
                )
            )
        );
    };

    /**
     * Alert component
     */
    const Alert = ({ type = 'info', title, message, onClose }) => {
        const typeStyles = {
            info: 'bg-blue-100 border-blue-500 text-blue-700',
            success: 'bg-green-100 border-green-500 text-green-700',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
            error: 'bg-red-100 border-red-500 text-red-700'
        };

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        return h('div', {
            className: `p-4 border-l-4 rounded ${typeStyles[type]} flex items-start`
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
     * Empty state component
     */
    const EmptyState = ({ icon = '📭', title, message, action }) => {
        return h('div', { className: 'text-center py-12' },
            h('div', { className: 'text-6xl mb-4' }, icon),
            h('h3', { className: 'text-lg font-medium text-gray-900 mb-2' }, title),
            message && h('p', { className: 'text-gray-500 mb-4' }, message),
            action && h('button', {
                className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
                onClick: action.onClick
            }, action.label)
        );
    };

    /**
     * Badge component
     */
    const Badge = ({ children, color = 'gray', size = 'medium' }) => {
        const colorClasses = {
            gray: 'bg-gray-100 text-gray-800',
            red: 'bg-red-100 text-red-800',
            yellow: 'bg-yellow-100 text-yellow-800',
            green: 'bg-green-100 text-green-800',
            blue: 'bg-blue-100 text-blue-800',
            purple: 'bg-purple-100 text-purple-800'
        };

        const sizeClasses = {
            small: 'px-2 py-0.5 text-xs',
            medium: 'px-2.5 py-0.5 text-sm',
            large: 'px-3 py-1 text-base'
        };

        return h('span', {
            className: `inline-flex items-center rounded-full font-medium ${colorClasses[color]} ${sizeClasses[size]}`
        }, children);
    };

    /**
     * Progress bar component
     */
    const ProgressBar = ({ value, max = 100, color = 'blue', showLabel = false }) => {
        const percentage = Math.min(100, Math.max(0, (value / max) * 100));
        
        const colorClasses = {
            blue: 'bg-blue-500',
            green: 'bg-green-500',
            yellow: 'bg-yellow-500',
            red: 'bg-red-500',
            purple: 'bg-purple-500'
        };

        return h('div', { className: 'w-full' },
            showLabel && h('div', { className: 'flex justify-between text-sm text-gray-600 mb-1' },
                h('span', null, `${value}/${max}`),
                h('span', null, `${Math.round(percentage)}%`)
            ),
            h('div', { className: 'progress-container' },
                h('div', {
                    className: `progress-bar ${colorClasses[color]}`,
                    style: { width: `${percentage}%` }
                })
            )
        );
    };

    /**
     * Tooltip component
     */
    const Tooltip = ({ children, content, position = 'top' }) => {
        const [isVisible, setIsVisible] = React.useState(false);

        const positionClasses = {
            top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
            bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
            left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
            right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
        };

        return h('div', { 
            className: 'relative inline-block',
            onMouseEnter: () => setIsVisible(true),
            onMouseLeave: () => setIsVisible(false)
        },
            children,
            isVisible && h('div', {
                className: `absolute z-10 px-3 py-2 text-sm text-white bg-gray-900 rounded-md shadow-lg whitespace-nowrap ${positionClasses[position]}`
            }, content)
        );
    };

    // Export base components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        Loading,
        ErrorMessage,
        Alert,
        Modal,
        EmptyState,
        Badge,
        ProgressBar,
        Tooltip
    });

    console.log('Base components loaded successfully');
})();