/**
 * PROPERLY FIXED Base UI Components for the Chores Manager
 * Modal now correctly centers in viewport
 */

(function() {
    'use strict';

    if (!window.React) {
        console.error('Base components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    /**
     * Loading spinner component
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
                className: `mt-4 text-gray-600 ${size === 'small' ? 'text-sm' : size === 'large' ? 'text-lg' : ''}` 
            }, message)
        );

        if (overlay) {
            return h('div', { 
                className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' 
            }, content);
        }

        return content;
    };

    /**
     * Error message component
     */
    const ErrorMessage = ({ message, onRetry, className = '' }) => {
        return h('div', { className: `bg-red-50 border border-red-200 rounded-lg p-4 ${className}` },
            h('div', { className: 'flex items-start' },
                h('div', { className: 'flex-shrink-0' },
                    h('span', { className: 'text-red-500 text-xl' }, '⚠️')
                ),
                h('div', { className: 'ml-3 flex-1' },
                    h('h3', { className: 'text-sm font-medium text-red-800' }, 'Error'),
                    h('p', { className: 'mt-1 text-sm text-red-700' }, message)
                ),
                onRetry && h('div', { className: 'ml-auto pl-3' },
                    h('button', {
                        className: 'px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-800 rounded transition-colors',
                        onClick: onRetry
                    }, 'Retry')
                )
            )
        );
    };

    /**
     * Alert component
     */
    const Alert = ({ type = 'info', message, children, onClose, className = '' }) => {
        const types = {
            info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'ℹ️' },
            success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: '✅' },
            warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: '⚠️' },
            error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '❌' }
        };

        const config = types[type] || types.info;

        return h('div', { 
            className: `${config.bg} ${config.border} border rounded-lg p-4 ${className}` 
        },
            h('div', { className: 'flex items-start justify-between' },
                h('div', { className: 'flex items-start' },
                    h('span', { className: 'text-xl mr-3' }, config.icon),
                    h('span', { className: `${config.text} ${children ? 'font-medium' : ''}` }, message),
                    children && h('div', { className: message ? 'text-sm mt-1' : '' }, children)
                ),
                onClose && h('button', {
                    className: 'ml-4 text-lg hover:bg-black hover:bg-opacity-10 rounded p-1',
                    onClick: onClose
                }, '×')
            )
        );
    };

    /**
     * PROPERLY FIXED Modal component - truly viewport-centered
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

        useEffect(() => {
            const handleEscape = (e) => {
                if (e.key === 'Escape' && isOpen && onClose) {
                    onClose();
                }
            };

            if (isOpen) {
                document.addEventListener('keydown', handleEscape);
                document.body.style.overflow = 'hidden';
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

        const handleOverlayClick = useCallback((e) => {
            if (closeOnOverlay && e.target === e.currentTarget && onClose) {
                onClose();
            }
        }, [closeOnOverlay, onClose]);

        if (!isOpen) return null;

        // CRITICAL: Proper viewport-centered positioning
        const overlayStyle = {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        };

        // Container for proper scrolling if modal is too tall
        const modalContainerStyle = {
            maxHeight: '90vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };

        return h('div', {
            style: overlayStyle,
            className: `modal-overlay transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`,
            onClick: handleOverlayClick
        },
            h('div', { style: modalContainerStyle },
                h('div', {
                    ref: modalRef,
                    className: `bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} transform transition-transform duration-300 ${isVisible ? 'scale-100' : 'scale-95'}`,
                    style: {
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column'
                    },
                    onClick: (e) => e.stopPropagation()
                },
                    // Header
                    (title || onClose) && h('div', { 
                        className: 'flex items-center justify-between p-6 border-b',
                        style: { flexShrink: 0 }
                    },
                        h('h2', { className: 'text-xl font-semibold' }, title || ''),
                        onClose && h('button', {
                            className: 'text-gray-400 hover:text-gray-600 text-2xl leading-none',
                            onClick: onClose
                        }, '×')
                    ),
                    
                    // Content - scrollable
                    h('div', { 
                        className: 'p-6 overflow-y-auto',
                        style: { flex: '1 1 auto' }
                    }, children)
                )
            )
        );
    };

    /**
     * Empty state component
     */
    const EmptyState = ({ icon = '📭', title = 'No data', message, action, onAction }) => {
        return h('div', { className: 'text-center py-12 px-4' },
            h('div', { className: 'text-6xl mb-4' }, icon),
            h('h3', { className: 'text-lg font-medium text-gray-900 mb-2' }, title),
            message && h('p', { className: 'text-gray-600 mb-6' }, message),
            action && onAction && h('button', {
                className: 'px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors',
                onClick: onAction
            }, action)
        );
    };

    /**
     * Badge component
     */
    const Badge = ({ children, variant = 'default', className = '' }) => {
        const variants = {
            default: 'bg-gray-100 text-gray-800',
            primary: 'bg-blue-100 text-blue-800',
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            danger: 'bg-red-100 text-red-800',
            info: 'bg-cyan-100 text-cyan-800'
        };

        return h('span', {
            className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`
        }, children);
    };

    /**
     * Progress bar component
     */
    const ProgressBar = ({ value, max = 100, variant = 'primary', showLabel = false, className = '' }) => {
        const percentage = Math.min(100, Math.max(0, (value / max) * 100));
        
        const variants = {
            primary: 'bg-blue-500',
            success: 'bg-green-500',
            warning: 'bg-yellow-500',
            danger: 'bg-red-500'
        };

        return h('div', { className: `w-full ${className}` },
            showLabel && h('div', { className: 'flex justify-between mb-1 text-sm' },
                h('span', null, `${value} / ${max}`),
                h('span', null, `${Math.round(percentage)}%`)
            ),
            h('div', { className: 'w-full bg-gray-200 rounded-full h-2.5' },
                h('div', {
                    className: `h-2.5 rounded-full transition-all duration-300 ${variants[variant]}`,
                    style: { width: `${percentage}%` }
                })
            )
        );
    };

    /**
     * Tooltip component
     */
    const Tooltip = ({ children, content, position = 'top' }) => {
        const [show, setShow] = useState(false);

        return h('div', { 
            className: 'relative inline-block',
            onMouseEnter: () => setShow(true),
            onMouseLeave: () => setShow(false)
        },
            children,
            show && h('div', {
                className: `absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap ${
                    position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
                    position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
                    position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
                    'right-full top-1/2 -translate-y-1/2 -mr-1'
                }`
            }, content)
        );
    };

    /**
     * Button component
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
     * Card component
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

    // Export all components
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

    console.log('✅ Base components loaded with properly centered modals');
})();