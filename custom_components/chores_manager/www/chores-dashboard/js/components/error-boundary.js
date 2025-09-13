/**
 * Error Boundary Component for Chores Manager
 * Provides graceful error handling for React components
 */

(function() {
    'use strict';
    
    const { Component, createElement: h } = React;
    
    /**
     * Error Boundary Component
     * Catches JavaScript errors in child components and displays fallback UI
     */
    class ErrorBoundary extends Component {
        constructor(props) {
            super(props);
            this.state = {
                hasError: false,
                error: null,
                errorInfo: null,
                errorId: null
            };
            
            // Bind methods
            this.resetError = this.resetError.bind(this);
        }
        
        static getDerivedStateFromError(error) {
            const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            return {
                hasError: true,
                error,
                errorId
            };
        }
        
        componentDidCatch(error, errorInfo) {
            // Log error details for debugging
            console.error('Component Error Caught:', error);
            console.error('Error Info:', errorInfo);
            
            // Update state with error details
            this.setState({
                error: error,
                errorInfo: errorInfo
            });
            
            // Send error to monitoring service if available
            if (window.ChoresAPI && window.ChoresAPI.logError) {
                window.ChoresAPI.logError({
                    error: error.toString(),
                    stack: error.stack,
                    componentStack: errorInfo.componentStack,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        resetError() {
            this.setState({
                hasError: false,
                error: null,
                errorInfo: null,
                errorId: null
            });
        }
        
        render() {
            if (this.state.hasError) {
                return h('div', {
                    className: 'error-boundary-fallback p-4 m-4 bg-red-50 border border-red-200 rounded-lg'
                },
                    h('div', { className: 'flex items-start' },
                        h('div', { className: 'flex-shrink-0' },
                            h('svg', {
                                className: 'h-5 w-5 text-red-400',
                                viewBox: '0 0 20 20',
                                fill: 'currentColor'
                            },
                                h('path', {
                                    fillRule: 'evenodd',
                                    d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
                                    clipRule: 'evenodd'
                                })
                            )
                        ),
                        h('div', { className: 'ml-3 flex-1' },
                            h('h3', { className: 'text-sm font-medium text-red-800' },
                                'Er is iets misgegaan'
                            ),
                            h('div', { className: 'mt-2 text-sm text-red-700' },
                                h('p', {}, 
                                    this.props.fallbackMessage || 
                                    'Er is een onverwachte fout opgetreden. Probeer de pagina te vernieuwen.'
                                )
                            ),
                            
                            // Show error details in debug mode
                            this.props.showDetails && this.state.error && h('details', {
                                className: 'mt-3 text-xs'
                            },
                                h('summary', { className: 'cursor-pointer text-red-600' },
                                    'Technische details'
                                ),
                                h('pre', { className: 'mt-2 p-2 bg-red-100 rounded text-red-800 overflow-auto' },
                                    this.state.error.toString(),
                                    '\n\n',
                                    this.state.error.stack
                                )
                            ),
                            
                            // Action buttons
                            h('div', { className: 'mt-4 flex space-x-3' },
                                h('button', {
                                    onClick: this.resetError,
                                    className: 'bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors'
                                }, 'Probeer opnieuw'),
                                h('button', {
                                    onClick: () => window.location.reload(),
                                    className: 'bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition-colors'
                                }, 'Pagina vernieuwen')
                            )
                        )
                    )
                );
            }
            
            // No error, render children normally
            return this.props.children;
        }
    }
    
    /**
     * HOC to wrap components with error boundary
     */
    function withErrorBoundary(Component, options = {}) {
        return function ErrorBoundaryWrapper(props) {
            return h(ErrorBoundary, options,
                h(Component, props)
            );
        };
    }
    
    /**
     * Hook to trigger error boundary (for testing)
     */
    function useErrorHandler() {
        return (error) => {
            throw error;
        };
    }
    
    // Export components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        ErrorBoundary,
        withErrorBoundary,
        useErrorHandler
    });
    
    console.log('Error Boundary component loaded successfully');
})();