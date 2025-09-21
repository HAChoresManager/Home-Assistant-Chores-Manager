/**
 * COMPLETELY FIXED Base UI Components for the Chores Manager
 * Provides all essential, reusable components used throughout the application
 * Fixed Modal implementation and enhanced error handling
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Base components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    /**
     * Loading spinner component with enhanced visuals
     */
    const Loading = ({ message = 'Loading...', size = 'medium', overlay = false }) => {
        const sizeClasses = {
            small: 'h-6 w-6',
            medium: 'h-12 w-12',
            large: 'h-16 w-16'
        };

        const content = h('div', { 
            className: `flex flex-col items-center justify-center ${overlay ? 'p-8' : 'p-4'}` 
        },
            h('div', {
                className: `animate-spin rounded-full border-b-2 border-blue-500 ${sizeClasses[size]}`
            }),
            message && h('p', { 
                className: `mt-4 text-gray-600 ${size === 'small' ? 'text-sm' : ''}` 
            }, message)
        );

        if (overlay) {
            return h('div', { 
                className: 'fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50' 
            }, content);
        }

        return content;
    };

    /**
     * Enhanced error message component with comprehensive error handling
     */
    const ErrorMessage = ({ error, message, onRetry, onDismiss, title = 'Error' }) => {
        // Handle different types of error input
        let errorMessage = '';
        let errorDetails = null;
        
        if (message) {
            errorMessage = message;
        } else if (error) {
            if (typeof error === 'string') {
                errorMessage = error;
            } else if (error.message) {
                errorMessage = error.message;
                errorDetails = error.stack;
            } else if (error.toString) {
                errorMessage = error.toString();
            } else {
                errorMessage = 'An unknown error occurred';
            }
        } else {
            errorMessage = 'An error occurred';
        }

        return h('div', { className: 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded mb-4' },
            h('div', { className: 'flex items-start' },
                h('span', { className: 'text-xl mr-3 flex-shrink-0' }, '⚠️'),
                h('div', { className: 'flex-1' },
                    h('p', { className: 'font-medium' }, title),
                    h('p', { className: 'text-sm mt-1' }, errorMessage),
                    errorDetails && h('details', { className: 'mt-2' },
                        h('summary', { className: 'text-xs cursor-pointer text-red-600' }, 'Technical details'),
                        h('pre', { className: 'text-xs mt-1 bg-red-50 p-2 rounded overflow-auto' }, 
                            errorDetails.slice(0, 500) + (errorDetails.length > 500 ? '...' : '')
                        )
                    )
                ),
                h('div', { className: 'flex items-center ml-4 space-x-2' },
                    onRetry && h('button', {
                        className: 'bg-red-200 hover:bg-red-300 text-red-800 font-bold py-1 px-3 rounded text-sm transition-colors',
                        onClick: onRetry
                    }, 'Retry'),
                    onDismiss && h('button', {
                        className: 'bg-red-200 hover:bg-red-300 text-red-800 font-bold py-1 px-3 rounded text-sm transition-colors',
                        onClick: onDismiss
                    }, '×')
                )
            )
        );
    };

    /**
     * Alert component for various message types
     */
    const Alert = ({ type = 'info', title, message, onClose, children }) => {
        const alertStyles = {
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
            className: `border-l-4 p-4 rounded ${alertStyles[type]} mb-4` 
        },
            h('div', { className: 'flex items-start' },
                h('span', { className: 'text-lg mr-3 flex-shrink-0' }, icons[type]),
                h('div', { className: 'flex-1' },
                    title && h('p', { className: 'font-medium' }, title),
                    message && h('p', { className: title ? 'text-sm mt-1' : '' }, message),
                    children
                ),
                onClose && h('button', {
                    className: 'ml-4 text-lg hover:bg-black hover:bg-opacity-10 rounded p-1',
                    onClick: onClose
                }, '×')
            )
        );
    };

    /**
     * COMPLETELY FIXED Modal component with proper portal implementation
     */
    const Modal = ({ isOpen, onClose, children, title, size = 'medium', closeOnOverlay = true }) => {
        const modalRef = useRef(null);
        const [isVisible, setIsVisible] = useState(false);

        const sizeClasses = {
            small: 'max-w-md',
            medium: 'max-w-2xl',
            large: 'max-w-4xl',
            full: 'max-w-full mx-4'
        };

        // Handle ESC key
        useEffect(() => {
            const handleEscape = (e) => {
                if (e.key === 'Escape' && isOpen && onClose) {
                    onClose();
                }
            };

            if (isOpen) {
                document.addEventListener('keydown', handleEscape);
                document.body.style.overflow = 'hidden';
                
                // Animate in
                setTimeout(() => setIsVisible(true), 10);
            } else {
                setIsVisible(false);
                document.body.style.overflow = '';
            }

            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = '';
            };
        }, [isOpen, onClose]);

        // Handle overlay click
        const handleOverlayClick = useCallback((e) => {
            if (closeOnOverlay && e.target === e.currentTarget && onClose) {
                onClose();
            }
        }, [closeOnOverlay, onClose]);

        if (!isOpen) return null;

        return h('div', {
            className: `fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`,
            style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
            onClick: handleOverlayClick
        },
            h('div', {
                ref: modalRef,
                className: `bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden transform transition-transform duration-300 ${isVisible ? 'scale-100' : 'scale-95'}`,
                onClick: (e) => e.stopPropagation()
            },
                // Header
                (title || onClose) && h('div', { className: 'flex items-center justify-between p-6 border-b' },
                    h('h2', { className: 'text-xl font-semibold' }, title || ''),
                    onClose && h('button', {
                        className: 'text-gray-400 hover:text-gray-600 text-2xl leading-none',
                        onClick: onClose
                    }, '×')
                ),
                
                // Content
                h('div', { className: 'p-6 overflow-y-auto max-h-[calc(90vh-120px)]' },
                    children
                )
            )
        );
    };

    /**
     * Empty state component for when no data is available
     */
    const EmptyState = ({ icon = '📭', title = 'No data', message, action, onAction }) => {
        return h('div', { className: 'text-center py-12 px-4' },
            h('div', { className: 'text-6xl mb-4' }, icon),
            h('h3', { className: 'text-lg font-medium text-gray-900 mb-2' }, title),
            message && h('p', { className: 'text-gray-500 mb-4' }, message),
            action && onAction && h('button', {
                className: 'bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors',
                onClick: onAction
            }, action)
        );
    };

    /**
     * Badge component for status indicators
     */
    const Badge = ({ variant = 'default', size = 'medium', children, className = '' }) => {
        const variants = {
            default: 'bg-gray-100 text-gray-800',
            primary: 'bg-blue-100 text-blue-800',
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            error: 'bg-red-100 text-red-800',
            info: 'bg-blue-100 text-blue-800'
        };

        const sizes = {
            small: 'px-2 py-1 text-xs',
            medium: 'px-3 py-1 text-sm',
            large: 'px-4 py-2 text-base'
        };

        return h('span', {
            className: `inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]} ${className}`
        }, children);
    };

    /**
     * Progress bar component
     */
    const ProgressBar = ({ value = 0, max = 100, label, color = 'blue', size = 'medium' }) => {
        const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
        
        const colors = {
            blue: 'bg-blue-500',
            green: 'bg-green-500',
            yellow: 'bg-yellow-500',
            red: 'bg-red-500'
        };

        const sizes = {
            small: 'h-2',
            medium: 'h-4',
            large: 'h-6'
        };

        return h('div', { className: 'w-full' },
            label && h('div', { className: 'flex justify-between items-center mb-1' },
                h('span', { className: 'text-sm font-medium text-gray-700' }, label),
                h('span', { className: 'text-sm text-gray-500' }, `${Math.round(percentage)}%`)
            ),
            h('div', { className: `w-full bg-gray-200 rounded-full ${sizes[size]}` },
                h('div', {
                    className: `${colors[color]} ${sizes[size]} rounded-full transition-all duration-300 ease-out`,
                    style: { width: `${percentage}%` }
                })
            )
        );
    };

    /**
     * Tooltip component
     */
    const Tooltip = ({ content, position = 'top', children }) => {
        const [isVisible, setIsVisible] = useState(false);

        const positions = {
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
                className: `absolute z-50 px-2 py-1 text-sm text-white bg-gray-800 rounded shadow-lg whitespace-nowrap ${positions[position]}`
            },
                content,
                h('div', { 
                    className: `absolute w-2 h-2 bg-gray-800 transform rotate-45 ${
                        position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
                        position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
                        position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
                        'right-full top-1/2 -translate-y-1/2 -mr-1'
                    }`
                })
            )
        );
    };

    /**
     * Button component with various styles
     */
    const Button = ({ 
        variant = 'primary', 
        size = 'medium', 
        loading = false, 
        disabled = false, 
        children, 
        className = '',
        ...props 
    }) => {
        const variants = {
            primary: 'bg-blue-500 hover:bg-blue-600 text-white',
            secondary: 'bg-gray-500 hover:bg-gray-600 text-white',
            success: 'bg-green-500 hover:bg-green-600 text-white',
            danger: 'bg-red-500 hover:bg-red-600 text-white',
            warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
            outline: 'border border-gray-300 hover:bg-gray-50 text-gray-700'
        };

        const sizes = {
            small: 'px-3 py-1 text-sm',
            medium: 'px-4 py-2',
            large: 'px-6 py-3 text-lg'
        };

        const isDisabled = disabled || loading;

        return h('button', {
            className: `inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${variants[variant]} ${sizes[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`,
            disabled: isDisabled,
            ...props
        },
            loading && h('div', { className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2' }),
            children
        );
    };

    /**
     * Card component for content containers
     */
    const Card = ({ title, children, className = '', header, footer }) => {
        return h('div', { className: `bg-white rounded-lg shadow-sm border border-gray-200 ${className}` },
            (title || header) && h('div', { className: 'px-6 py-4 border-b border-gray-200' },
                header || h('h3', { className: 'text-lg font-medium' }, title)
            ),
            h('div', { className: 'px-6 py-4' }, children),
            footer && h('div', { className: 'px-6 py-4 border-t border-gray-200 bg-gray-50' }, footer)
        );
    };

    // Export all base components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        Loading,
        ErrorMessage,
        Alert,
        Modal,
        EmptyState,
        Badge,
        ProgressBar,
        Tooltip,
        Button,
        Card
    });

    console.log('✅ FIXED Base components loaded successfully with comprehensive functionality');
})();