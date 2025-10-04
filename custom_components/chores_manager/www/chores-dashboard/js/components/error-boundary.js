/**
 * Error Boundary Component
 */
(function() {
    'use strict';
    
    if (!window.React) return;
    
    const h = React.createElement;
    
    class ErrorBoundary extends React.Component {
        constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
        }
        
        static getDerivedStateFromError(error) {
            return { hasError: true, error };
        }
        
        componentDidCatch(error, errorInfo) {
            console.error('ErrorBoundary caught:', error, errorInfo);
        }
        
        render() {
            if (this.state.hasError) {
                return h('div', { className: 'p-8 bg-red-50 border border-red-200 rounded-lg m-4' },
                    h('h2', { className: 'text-xl font-bold text-red-800 mb-2' }, 'Er is iets fout gegaan'),
                    h('p', { className: 'text-red-600 mb-4' }, this.state.error?.message || 'Onbekende fout'),
                    h('button', {
                        onClick: () => window.location.reload(),
                        className: 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700'
                    }, 'Pagina vernieuwen')
                );
            }
            
            return this.props.children;
        }
    }
    
    window.choreComponents = window.choreComponents || {};
    window.choreComponents.ErrorBoundary = ErrorBoundary;
    window.choreComponents.withErrorBoundary = (Component) => (props) => 
        h(ErrorBoundary, null, h(Component, props));
    
    console.log('✅ ErrorBoundary loaded');
})();