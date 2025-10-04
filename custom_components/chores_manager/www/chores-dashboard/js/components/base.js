/**
 * FIXED Base UI Components with Portal-Based Modal
 * Core UI elements for the Chores Manager with proper modal positioning
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
     * Loading component with spinner
     */
    const Loading = ({ message = 'Loading...' }) => {
        return h('div', { className: 'flex flex-col items-center justify-center p-8' },
            h('div', { className: 'animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500' }),
            h('p', { className: 'mt-4 text-gray-600' }, message)
        );
    };

    /**
     * Error message component with retry option
     */
    const ErrorMessage = ({ error, onRetry }) => {
        const errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';
        
        return h('div', { className: 'bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg' },
            h('div', { className: 'flex items-center' },
                h('span', { className: 'text-red-500 mr-2' }, '⚠️'),
                h('div', { className: 'flex-1' },
                    h('p', { className: 'font-medium' }, 'Error'),
                    h('p', { className: 'text-sm mt-1' }, errorMessage)
                ),
                onRetry && h('button', {
                    className: 'ml-4 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm',
                    onClick: onRetry
                }, 'Retry')
            )
        );
    };

    /**
     * Alert component for messages
     */
    const Alert = ({ type = 'info', message, onClose, children }) => {
        const types = {
            info: 'bg-blue-50 border-blue-200 text-blue-800',
            success: 'bg-green-50 border-green-200 text-green-800',
            warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
            error: 'bg-red-50 border-red-200 text-red-800'
        };

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        return h('div', { 
            className: `border px-4 py-3 rounded-lg flex items-center ${types[type]}` 
        },
            h('span', { className: 'text-lg mr-3' }, icons[type]),
            h('div', { className: 'flex-1' },
                h('p', { className: message && children ? 'font-medium' : '' }, message),
                children && h('div', { className: message ? 'text-sm mt-1' : '' }, children)
            ),
            onClose && h('button', {
                className: 'ml-4 text-lg hover:bg-black hover:bg-opacity-10 rounded p-1',
                onClick: onClose
            }, '×')
        );
    };

    /**
     * PORTAL-BASED Modal component for proper root-level rendering
     * Uses React Portal to ensure modals always render at document body level
     */
    const Modal = ({ isOpen, onClose, children, title, size = 'medium', closeOnOverlay = true }) => {
        const modalRef = useRef(null);
        const [isVisible, setIsVisible] = useState(false);
        const [portalRoot, setPortalRoot] = useState(null);

        const sizeClasses = {
            small: 'max-w-md',
            medium: 'max-w-2xl',
            large: 'max-w-4xl',
            full: 'max-w-full mx-4'
        };

        // Create or get portal root element
        useEffect(() => {
            let modalPortal = document.getElementById('modal-portal');
            if (!modalPortal) {
                modalPortal = document.createElement('div');
                modalPortal.id = 'modal-portal';
                modalPortal.style.position = 'relative';
                modalPortal.style.zIndex = '10000';
                document.body.appendChild(modalPortal);
            }
            setPortalRoot(modalPortal);

            return () => {
                // Don't remove portal root as other modals might be using it
            };
        }, []);

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
                // Simplified body scroll lock
                document.body.style.overflow = 'hidden';
                
                // Animate in
                setTimeout(() => setIsVisible(true), 10);
            } else {
                setIsVisible(false);
                
                // Restore scroll
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

        if (!isOpen || !portalRoot) return null;

        // CRITICAL: Inline styles for proper viewport positioning
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

        const modalContent = h('div', {
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
                    margin: 'auto',
                    position: 'relative'
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

        // Use React Portal if available, otherwise render directly
        if (window.ReactDOM && window.ReactDOM.createPortal) {
            return window.ReactDOM.createPortal(modalContent, portalRoot);
        }
        
        // Fallback for older React versions
        return modalContent;
    };

    /**
     * Empty state component for when no data is available
     */
    const EmptyState = ({ icon = '📭', title = 'No data', message, action, onAction }) => {
        return h('div', { className: 'text-center py-12 px-4' },
            h('div', { className: 'text-6xl mb-4' }, icon),
            h('h3', { className: 'text-lg font-medium text-gray-900 mb-2' }, title),
            message && h('p', { className: 'text-gray-600 mb-4' }, message),
            action && onAction && h('button', {
                className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
                onClick: onAction
            }, action)
        );
    };

    /**
     * Badge component for status indicators
     */
    const Badge = ({ children, variant = 'default' }) => {
        const variants = {
            default: 'bg-gray-100 text-gray-800',
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            danger: 'bg-red-100 text-red-800',
            info: 'bg-blue-100 text-blue-800'
        };

        return h('span', { 
            className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}` 
        }, children);
    };

    /**
     * Progress bar component
     */
    const ProgressBar = ({ value = 0, max = 100, color = 'bg-blue-500' }) => {
        const percentage = Math.min(100, Math.max(0, (value / max) * 100));
        
        return h('div', { className: 'w-full bg-gray-200 rounded-full h-2 overflow-hidden' },
            h('div', { 
                className: `h-full transition-all duration-300 ${color}`,
                style: { width: `${percentage}%` }
            })
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
                className: `absolute z-10 px-2 py-1 text-sm text-white bg-gray-900 rounded whitespace-nowrap ${
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

    console.log('✅ FIXED Base components with Portal-based Modal loaded successfully');
})();