/**
 * Initialization logic for Chores Dashboard
 * Handles React app initialization and error boundaries
 * Fixed version to prevent React error #130
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
        console.log('🚀 Initializing Chores Dashboard React App...');

        try {
            const rootElement = document.getElementById('root');
            if (!rootElement) {
                throw new Error('Root element not found');
            }
            if (!window.ReactDOM) {
                throw new Error('ReactDOM not available');
            }
            if (!window.choreComponents) {
                throw new Error('Components not available');
            }

            const criticalComponents = ['ErrorBoundary', 'Loading', 'ErrorMessage'];
            const missingCritical = criticalComponents.filter(name => !window.choreComponents[name]);
            if (missingCritical.length > 0) {
                console.warn('⚠️ Some critical components missing:', missingCritical);
                // Continue anyway, fallbacks should handle this
            }

            const AppComponent = window.ChoresApp.getApp();
            if (!AppComponent) {
                throw new Error('App component not available');
            }

            const AppWithErrorBoundary = React.createElement(
                window.ChoresApp.ErrorBoundary,
                null,
                React.createElement(AppComponent)
            );

            const reactVersion = React.version;
            console.log('Using React ' + reactVersion);

            if (reactVersion && reactVersion.startsWith('18')) {
                if (window.ReactDOM.createRoot) {
                    console.log('Using React 18 createRoot API');
                    const root = window.ReactDOM.createRoot(rootElement);
                    root.render(AppWithErrorBoundary);
                } else {
                    console.log('Falling back to legacy render API');
                    window.ReactDOM.render(AppWithErrorBoundary, rootElement);
                }
            } else {
                console.log('Using legacy render API');
                window.ReactDOM.render(AppWithErrorBoundary, rootElement);
            }

            console.log('✅ React app initialized successfully');
            document.body.classList.add('app-loaded');
            window.dispatchEvent(new CustomEvent('chores-app-initialized', {
                detail: {
                    version: window.CHORES_APP_VERSION,
                    reactVersion: reactVersion,
                    componentCount: Object.keys(window.choreComponents).length
                }
            }));
        } catch (error) {
            console.error('❌ Failed to initialize React app:', error);
            const rootElement = document.getElementById('root');
            if (rootElement) {
                rootElement.innerHTML = `
                    <div style="padding: 20px; margin: 20px; background: #fee; border: 1px solid #fcc; border-radius: 8px; font-family: Arial, sans-serif;">
                        <h2 style="color: #c00; margin-top: 0;">Initialization Error</h2>
                        <p>Failed to initialize the dashboard:</p>
                        <p><strong>${error.message}</strong></p>
                        <details style="margin: 10px 0;">
                            <summary>Debug Information</summary>
                            <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 12px;">
                                <div>React: ${!!window.React}</div>
                                <div>ReactDOM: ${!!window.ReactDOM}</div>
                                <div>Components: ${!!window.choreComponents} (${Object.keys(window.choreComponents || {}).length})</div>
                                <div>App: ${!!window.ChoresApp}</div>
                                <div>getApp: ${!!(window.ChoresApp && window.ChoresApp.getApp)}</div>
                            </div>
                        </details>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #c00; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reload Page
                        </button>
                    </div>`;
            }
        }
    };

    /**
     * Wait for dependencies and auto-initialize
     */
    function autoInitialize() {
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds

        function checkAndInit() {
            attempts++;
            const hasReact = window.React && window.ReactDOM;
            const hasComponents = window.choreComponents && Object.keys(window.choreComponents).length > 0;
            const hasApp = window.ChoresApp && window.ChoresApp.getApp;

            if (hasReact && hasComponents && hasApp) {
                console.log('✅ All dependencies ready, auto-initializing...');
                window.ChoresApp.initApp();
            } else if (attempts < maxAttempts) {
                if (attempts % 20 === 0) {
                    console.log('⏳ Waiting for dependencies...', {
                        react: hasReact,
                        components: hasComponents,
                        componentCount: Object.keys(window.choreComponents || {}).length,
                        app: hasApp
                    });
                }
                setTimeout(checkAndInit, 100);
            } else {
                console.error('❌ Timeout waiting for dependencies');
                console.error('Final state:', {
                    react: hasReact,
                    components: hasComponents,
                    componentCount: Object.keys(window.choreComponents || {}).length,
                    app: hasApp
                });
                try {
                    window.ChoresApp.initApp();
                } catch (error) {
                    console.error('Failed to initialize after timeout:', error);
                }
            }
        }
        checkAndInit();
    }

    /**
     * Listen for component ready events
     */
    function setupEventListeners() {
        window.addEventListener('chores-components-ready', (event) => {
            console.log('📦 Components ready event received:', event.detail);
            setTimeout(() => {
                if (window.ChoresApp && window.ChoresApp.getApp && !document.body.classList.contains('app-loaded')) {
                    console.log('🔄 Triggering initialization after components ready');
                    window.ChoresApp.initApp();
                }
            }, 100);
        });

        window.addEventListener('chores-app-initialized', (event) => {
            console.log('🎉 App initialization complete:', event.detail);
        });
    }

    /**
     * Initialize when DOM is ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            autoInitialize();
        });
    } else {
        setupEventListeners();
        autoInitialize();
    }

    console.log('📋 App initialization system loaded');
})();
