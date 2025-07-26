/**
 * Initialization logic for Chores Dashboard
 * Handles React app initialization and error boundaries
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    /**
     * Error Boundary Component
     */
    window.ChoresApp.ErrorBoundary = class ErrorBoundary extends React.Component {
        constructor(props) {
            super(props);
            this.state = { hasError: false, error: null };
        }
        
        static getDerivedStateFromError(error) {
            return { hasError: true, error };
        }
        
        componentDidCatch(error, errorInfo) {
            console.error('React Error Boundary caught:', error, errorInfo);
        }
        
        render() {
            const h = React.createElement;
            
            if (this.state.hasError) {
                return h('div', {
                    style: {
                        padding: '20px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        margin: '20px'
                    }
                },
                    h('h2', null, 'Er is een fout opgetreden'),
                    h('p', null, this.state.error?.message || 'Onbekende fout'),
                    h('button', {
                        onClick: () => window.location.reload(),
                        style: {
                            padding: '10px 20px',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }
                    }, 'Pagina herladen')
                );
            }
            
            return this.props.children;
        }
    };
    
    /**
     * Initialize the React application
     */
    window.ChoresApp.initApp = function() {
        console.log('Initializing Chores Dashboard React App...');
        
        try {
            // Get the root element
            const rootElement = document.getElementById('root');
            if (!rootElement) {
                throw new Error('Root element not found');
            }
            
            // Check if ReactDOM is available
            if (!window.ReactDOM) {
                throw new Error('ReactDOM not available');
            }
            
            // Create and render the app with error boundary
            const AppWithErrorBoundary = React.createElement(
                window.ChoresApp.ErrorBoundary,
                null,
                React.createElement(window.ChoresApp.ChoresApp)
            );
            
            // Check React version and use appropriate API
            const reactVersion = React.version;
            console.log('Using React ' + reactVersion);
            
            if (reactVersion && reactVersion.startsWith('18')) {
                // React 18 with createRoot
                console.log('Using React 18 createRoot API...');
                if (window.ReactDOM.createRoot) {
                    const root = window.ReactDOM.createRoot(rootElement);
                    root.render(AppWithErrorBoundary);
                    console.log('Chores Dashboard initialized successfully');
                } else {
                    // Fallback if createRoot is not available
                    window.ReactDOM.render(AppWithErrorBoundary, rootElement);
                    console.log('Chores Dashboard initialized successfully (fallback mode)');
                }
            } else {
                // React 17 or older
                window.ReactDOM.render(AppWithErrorBoundary, rootElement);
                console.log('Chores Dashboard initialized successfully');
            }
            
        } catch (error) {
            console.error('Failed to initialize Chores Dashboard:', error);
            document.getElementById('root').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; margin: 20px;">
                    <h2>Initialization Error</h2>
                    <p>${error.message}</p>
                    <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Reload Page
                    </button>
                </div>
            `;
        }
    };
    
    console.log('App initialization module loaded');
})();