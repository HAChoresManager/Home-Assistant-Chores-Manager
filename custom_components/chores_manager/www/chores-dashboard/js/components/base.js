/**
 * COMPLETELY FIXED Base UI Components for the Chores Manager
 * Provides all essential, reusable components used throughout the application
 * Fixed Modal implementation with proper viewport-fixed positioning
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
                className: `mt-4 text-gray-600 ${size === 'small' ? 'text-sm' : size === 'large' ? 'text-lg' : ''}` 
            }, message)
        );

        if (overlay) {
            return h('div', { className: 'fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50' }, content);
        }

        return content;
    };

    /**
     * Error message component with retry functionality
     */
    const ErrorMessage = ({ message, onRetry, onDismiss }) => {
        return h('div', { className: 'bg-red-50 border border-red-200 rounded-lg p-4 my-4' },
            h('div', { className: 'flex items-start' },
                h('div', { className: 'flex-shrink-0' },
                    h('svg', { className: 'h-5 w-5 text-red-400', viewBox: '0 0 20 20', fill: 'currentColor' },
                        h('path', { fillRule: 'evenodd', d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z', clipRule: 'evenodd' })
                    )
                ),
                h('div', { className: 'ml-3 flex-1' },
                    h('p', { className: 'text-sm text-red-700' }, message)
                ),
                (onRetry || onDismiss) && h('div', { className: 'ml-3 flex space-x-2' },
                    onRetry && h('button', {
                        className: 'text-sm font-medium text-red-600 hover:text-red-500',
                        onClick: onRetry
                    }, 'Retry'),
                    onDismiss && h('button', {
                        className: 'text-sm font-medium text-red-600 hover:text-red-500',
                        onClick: onDismiss
                    }, 'Dismiss')
                )
            )
        );
    };

    /**
     * Alert component for notifications
     */
    const Alert = ({ type = 'info', message, children, onClose }) => {
        const styles = {
            info: 'bg-blue-50 border-blue-200 text-blue-700',
            success: 'bg-green-50 border-green-200 text-green-700',
            warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
            error: 'bg-red-50 border-red-200 text-red-700'
        };

        return h('div', { className: `border rounded-lg p-4 my-2 ${styles[type]}` },
            h('div', { className: 'flex justify-between items-start' },
                h('div', { className: 'flex-1' },
                    message && h('p', { className: message && children ? 'font-medium' : '' }, message),
                    children && h('div', { className: message ? 'text-sm mt-1' : '' }, message),
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
     * COMPLETELY FIXED Modal component with proper viewport-fixed positioning
     * This ensures modals stay centered regardless of scroll position or device
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

        // Handle ESC key and prevent body scroll
        useEffect(() => {
            const handleEscape = (e) => {
                if (e.key === 'Escape' && isOpen && onClose) {
                    onClose();
                }
            };

            if (isOpen) {
                // Save current scroll position
                const scrollY = window.scrollY;
                
                document.addEventListener('keydown', handleEscape);
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';
                document.body.style.top = `-${scrollY}px`;
                document.body.style.width = '100%';
                
                // Animate in
                setTimeout(() => setIsVisible(true), 10);
            } else {
                setIsVisible(false);
                
                // Restore scroll position
                const scrollY = document.body.style.top;
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
                if (scrollY) {
                    window.scrollTo(0, parseInt(scrollY || '0') * -1);
                }
            }

            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.width = '';
            };
        }, [isOpen, onClose]);

        // Handle overlay click
        const handleOverlayClick = useCallback((e) => {
            if (closeOnOverlay && e.target === e.currentTarget && onClose) {
                onClose();
            }
        }, [closeOnOverlay, onClose]);

        if (!isOpen) return null;

        // CRITICAL FIX: Use inline styles to override any CSS that might break positioning
        const overlayStyle = {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            padding: '1rem',
            overflowY: 'auto'
        };

        return h('div', {
            style: overlayStyle,
            className: `modal-overlay transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`,
            onClick: handleOverlayClick
        },
            h('div', {
                ref: modalRef,
                className: `bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} transform transition-transform duration-300 ${isVisible ? 'scale-100' : 'scale-95'}`,
                style: {
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    margin: 'auto'
                },
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
                h('div', { className: 'p-6 overflow-y-auto', style: { maxHeight: 'calc(90vh - 120px)' } },
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
    const Badge = ({ variant = 'default', children, className = '' }) => {
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
    const ProgressBar = ({ value = 0, max = 100, variant = 'primary', showLabel = false, className = '' }) => {
        const percentage = Math.min(100, Math.max(0, (value / max) * 100));

        const variants = {
            primary: 'bg-blue-500',
            success: 'bg-green-500',
            warning: 'bg-yellow-500',
            danger: 'bg-red-500'
        };

        return h('div', { className: `w-full ${className}` },
            showLabel && h('div', { className: 'flex justify-between mb-1' },
                h('span', { className: 'text-sm font-medium text-gray-700' }, `${Math.round(percentage)}%`)
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
    const Tooltip = ({ content, children, position = 'top' }) => {
        const [isVisible, setIsVisible] = useState(false);

        return h('div', { 
            className: 'relative inline-block',
            onMouseEnter: () => setIsVisible(true),
            onMouseLeave: () => setIsVisible(false)
        },
            children,
            isVisible && h('div', {
                className: `absolute z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm whitespace-nowrap ${
                    position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
                    position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
                    position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
                    'right-full top-1/2 -translate-y-1/2 -mr-1'
                }`
            }, content)
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

    console.log('✅ FIXED Base components loaded successfully with viewport-fixed modals');
})();