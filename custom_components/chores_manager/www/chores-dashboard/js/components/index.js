/**
 * Improved Component Loader for the Chores Manager
 * Loads all modular components with dependency checking and error handling
 */

(function() {
    'use strict';

    // Component loading configuration
    const COMPONENT_CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 10000,
        version: window.CHORES_APP_VERSION || '1.4.1-20250415'
    };

    // Define the loading order with dependencies
    const componentManifest = [
        {
            name: 'error-boundary',
            file: 'components/error-boundary.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['ErrorBoundary', 'withErrorBoundary']
        },
        {
            name: 'base',
            file: 'components/base.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['Loading', 'ErrorMessage', 'Alert', 'Modal', 'EmptyState', 'Badge', 'ProgressBar', 'Tooltip']
        },
        {
            name: 'dialogs',
            file: 'components/dialogs.js',
            dependencies: ['React', 'ReactDOM', 'choreComponents.Modal'],
            exports: ['ConfirmDialog', 'CompletionConfirmDialog', 'SubtaskCompletionDialog', 'ErrorDialog', 'SuccessDialog']
        },
        {
            name: 'tasks',
            file: 'components/tasks.js',
            dependencies: ['React', 'ReactDOM', 'choreComponents.CompletionConfirmDialog', 'choreComponents.SubtaskCompletionDialog'],
            exports: ['TaskCard', 'TaskDescription', 'PriorityIndicator']
        },
        {
            name: 'forms',
            file: 'components/forms.js',
            dependencies: ['React', 'ReactDOM', 'choreComponents.Modal'],
            exports: ['TaskForm', 'UserManagement', 'IconSelector', 'WeekDayPicker', 'MonthDayPicker']
        },
        {
            name: 'stats',
            file: 'components/stats.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['StatsCard', 'UserStatsCard', 'ThemeSettings']
        }
    ];

    // Track loading state
    const loadingState = {
        loaded: new Set(),
        failed: new Set(),
        retryCount: new Map()
    };

    /**
     * Check if a dependency is available
     */
    function isDependencyAvailable(dep) {
        // Handle nested dependencies like choreComponents.Modal
        const parts = dep.split('.');
        let obj = window;
        
        for (const part of parts) {
            if (!obj || typeof obj !== 'object') return false;
            obj = obj[part];
        }
        
        return obj !== undefined;
    }

    /**
     * Verify all dependencies for a component
     */
    function verifyDependencies(component) {
        const missing = [];
        
        for (const dep of component.dependencies) {
            if (!isDependencyAvailable(dep)) {
                missing.push(dep);
            }
        }
        
        return {
            ready: missing.length === 0,
            missing: missing
        };
    }

    /**
     * Verify component exports
     */
    function verifyExports(component) {
        if (!window.choreComponents) return false;
        
        for (const exportName of component.exports) {
            if (!window.choreComponents[exportName]) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Load a script with retry logic
     */
    function loadScript(src, retries = COMPONENT_CONFIG.maxRetries) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            
            function attemptLoad() {
                attempts++;
                
                const script = document.createElement('script');
                script.src = `js/${src}?v=${COMPONENT_CONFIG.version}`;
                script.type = 'text/javascript';
                
                const timeout = setTimeout(() => {
                    script.remove();
                    if (attempts < retries) {
                        console.warn(`Timeout loading ${src}, retry ${attempts}/${retries}`);
                        setTimeout(attemptLoad, COMPONENT_CONFIG.retryDelay * attempts);
                    } else {
                        reject(new Error(`Failed to load ${src} after ${retries} attempts`));
                    }
                }, COMPONENT_CONFIG.timeout);
                
                script.onload = () => {
                    clearTimeout(timeout);
                    console.log(`✓ Loaded: ${src}`);
                    resolve();
                };
                
                script.onerror = (error) => {
                    clearTimeout(timeout);
                    script.remove();
                    
                    if (attempts < retries) {
                        console.warn(`Error loading ${src}, retry ${attempts}/${retries}`);
                        setTimeout(attemptLoad, COMPONENT_CONFIG.retryDelay * attempts);
                    } else {
                        reject(new Error(`Failed to load ${src}: ${error}`));
                    }
                };
                
                document.head.appendChild(script);
            }
            
            attemptLoad();
        });
    }

    /**
     * Load a component with dependency checking
     */
    async function loadComponent(component) {
        // Check if already loaded
        if (loadingState.loaded.has(component.name)) {
            return true;
        }
        
        // Check if previously failed
        if (loadingState.failed.has(component.name)) {
            console.warn(`Skipping previously failed component: ${component.name}`);
            return false;
        }
        
        console.log(`Loading component: ${component.name}`);
        
        // Verify dependencies
        const depCheck = verifyDependencies(component);
        if (!depCheck.ready) {
            console.warn(`Dependencies not ready for ${component.name}:`, depCheck.missing);
            
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const secondCheck = verifyDependencies(component);
            if (!secondCheck.ready) {
                console.error(`Dependencies still missing for ${component.name}:`, secondCheck.missing);
                loadingState.failed.add(component.name);
                return false;
            }
        }
        
        try {
            // Load the script
            await loadScript(component.file);
            
            // Verify exports
            if (!verifyExports(component)) {
                throw new Error(`Component ${component.name} did not export expected functions`);
            }
            
            loadingState.loaded.add(component.name);
            return true;
            
        } catch (error) {
            console.error(`Failed to load component ${component.name}:`, error);
            loadingState.failed.add(component.name);
            return false;
        }
    }

    /**
     * Load all components in sequence
     */
    async function loadAllComponents() {
        console.log('🚀 Starting improved component loader...');
        
        const results = {
            total: componentManifest.length,
            loaded: 0,
            failed: []
        };
        
        // Ensure choreComponents object exists
        window.choreComponents = window.choreComponents || {};
        
        // Load components in order
        for (const component of componentManifest) {
            const success = await loadComponent(component);
            
            if (success) {
                results.loaded++;
            } else {
                results.failed.push(component.name);
            }
        }
        
        // Log results
        if (results.loaded === results.total) {
            console.log(`✅ All ${results.total} components loaded successfully`);
        } else {
            console.warn(`⚠️ Loaded ${results.loaded}/${results.total} components`);
            if (results.failed.length > 0) {
                console.error('Failed components:', results.failed);
            }
        }
        
        // Verify critical components
        const criticalComponents = [
            'ErrorBoundary', 'Loading', 'ErrorMessage', 'TaskCard'
        ];
        
        const missingCritical = criticalComponents.filter(
            name => !window.choreComponents[name]
        );
        
        if (missingCritical.length > 0) {
            console.error('❌ Missing critical components:', missingCritical);
            
            // Show error in UI
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = `
                    <div class="error-container" style="padding: 20px; margin: 20px; background: #fee; border: 1px solid #fcc; border-radius: 8px;">
                        <h2 style="color: #c00;">Component Loading Error</h2>
                        <p>Failed to load critical components: ${missingCritical.join(', ')}</p>
                        <p>Please check the browser console for details.</p>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #c00; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reload Page
                        </button>
                    </div>`;
            }
            
            return false;
        }
        
        // Dispatch success event
        window.dispatchEvent(new CustomEvent('chores-components-ready', {
            detail: {
                loaded: results.loaded,
                total: results.total,
                components: Array.from(loadingState.loaded)
            }
        }));
        
        return true;
    }

    /**
     * Initialize component loader
     */
    async function initialize() {
        // Wait for React to be available
        let reactWaitTime = 0;
        const maxWaitTime = 5000;
        
        while ((!window.React || !window.ReactDOM) && reactWaitTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
            reactWaitTime += 100;
        }
        
        if (!window.React || !window.ReactDOM) {
            console.error('React not available after waiting');
            return;
        }
        
        console.log('React detected, starting component loading');
        
        // Load all components
        const success = await loadAllComponents();
        
        if (success) {
            console.log('🎉 Component system initialized successfully');
        } else {
            console.error('Component system initialization failed');
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();