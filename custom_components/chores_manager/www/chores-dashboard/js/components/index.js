/**
 * RESILIENT Component Loader for the Chores Manager
 * Fixed to continue loading even if API fails, ensuring TaskCard always loads
 */

(function() {
    'use strict';

    // Component loading configuration
    const COMPONENT_CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 15000,
        version: window.CHORES_APP_VERSION || '1.4.2-20250915-comprehensive-fix'
    };

    // FIXED: More resilient loading order - removed dependency on API being ready
    const componentManifest = [
        {
            name: 'error-boundary',
            file: 'components/error-boundary.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['ErrorBoundary', 'withErrorBoundary'],
            critical: true
        },
        {
            name: 'base',
            file: 'components/base.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['Loading', 'ErrorMessage', 'Alert', 'Modal', 'EmptyState', 'Badge', 'ProgressBar', 'Tooltip', 'Button', 'Card'],
            critical: true
        },
        {
            name: 'dialogs',
            file: 'components/dialogs.js',
            dependencies: ['React', 'ReactDOM', 'choreComponents.Modal'],
            exports: ['ConfirmDialog', 'CompletionConfirmDialog', 'SubtaskCompletionDialog', 'ErrorDialog', 'SuccessDialog'],
            critical: true
        },
        // FIXED: Make TaskCard loading more resilient by reducing strict dependencies
        {
            name: 'task-card',
            file: 'components/tasks/task-card.js',
            dependencies: ['React', 'ReactDOM'], // Removed strict dialog dependencies
            exports: ['TaskCard'],
            critical: true,
            softDependencies: ['choreComponents.CompletionConfirmDialog', 'choreComponents.SubtaskCompletionDialog'] // These can be missing initially
        },
        {
            name: 'tasks',
            file: 'components/tasks.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['TaskDescription', 'PriorityIndicator', 'TaskStatusBadge', 'TaskFrequencyBadge', 'TaskAssigneeBadge', 'SubtaskProgress'],
            critical: false
        },
        {
            name: 'forms',
            file: 'components/forms.js',
            dependencies: ['React', 'ReactDOM', 'choreComponents.Modal'],
            exports: ['TaskForm', 'UserManagement', 'IconSelector', 'WeekDayPicker', 'MonthDayPicker'],
            critical: true
        },
        {
            name: 'stats',
            file: 'components/stats.js',
            dependencies: ['React', 'ReactDOM'],
            exports: ['StatsCard', 'UserStatsCard', 'ThemeSettings'],
            critical: false
        }
    ];

    // Track loading state
    const loadingState = {
        loaded: new Set(),
        failed: new Set(),
        retryCount: new Map(),
        startTime: Date.now()
    };

    /**
     * Check if a dependency is available
     */
    function isDependencyAvailable(dep) {
        const parts = dep.split('.');
        let obj = window;
        
        for (const part of parts) {
            if (!obj || typeof obj[part] === 'undefined') {
                return false;
            }
            obj = obj[part];
        }
        
        return true;
    }

    /**
     * RESILIENT: Wait for dependencies with graceful fallback
     */
    async function waitForDependencies(dependencies, timeout = 5000, allowPartial = false) {
        const startTime = Date.now();
        const checkInterval = 100;
        
        while (Date.now() - startTime < timeout) {
            const missing = dependencies.filter(dep => !isDependencyAvailable(dep));
            
            if (missing.length === 0) {
                return { success: true, missing: [] };
            }
            
            // For partial loading, check if we have at least the critical dependencies (React)
            if (allowPartial && dependencies.includes('React') && isDependencyAvailable('React')) {
                const criticalMissing = missing.filter(dep => dep.includes('React'));
                if (criticalMissing.length === 0) {
                    console.warn(`⚠️ Partial dependency load - missing: ${missing.join(', ')}`);
                    return { success: true, missing, partial: true };
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        const missing = dependencies.filter(dep => !isDependencyAvailable(dep));
        console.warn(`⏰ Dependency timeout - missing: ${missing.join(', ')}`);
        return { success: false, missing };
    }

    /**
     * Load a single script file with enhanced error handling
     */
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            // Check if script is already loaded
            const existingScript = document.querySelector(`script[src*="${url.split('?')[0]}"]`);
            if (existingScript) {
                console.log(`♻️ Script already loaded: ${url}`);
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = false;
            
            // Add cache busting and version
            const separator = url.includes('?') ? '&' : '?';
            script.src = `${url}${separator}v=${COMPONENT_CONFIG.version}&t=${Date.now()}`;
            
            script.onload = () => {
                console.log(`✅ Script loaded: ${url}`);
                resolve();
            };
            
            script.onerror = (error) => {
                console.error(`❌ Script failed to load: ${url}`, error);
                reject(new Error(`Failed to load script: ${url}`));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * RESILIENT: Load and validate a single component with graceful error handling
     */
    async function loadComponent(component) {
        const { name, file, dependencies, exports, critical, softDependencies } = component;
        
        try {
            console.log(`🔄 Loading component: ${name}`);
            
            // Wait for hard dependencies
            if (dependencies && dependencies.length > 0) {
                const depResult = await waitForDependencies(dependencies, 5000, !critical);
                if (!depResult.success && critical) {
                    throw new Error(`Critical dependencies not ready for ${name}: ${depResult.missing.join(', ')}`);
                } else if (!depResult.success) {
                    console.warn(`⚠️ Loading ${name} with missing dependencies: ${depResult.missing.join(', ')}`);
                }
            }
            
            // Load the component script
            await loadScript(`js/${file}`);
            
            // Wait for script execution
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify exports with resilient checking
            if (exports && exports.length > 0) {
                const missing = exports.filter(exportName => 
                    !window.choreComponents || !window.choreComponents[exportName]
                );
                
                if (missing.length > 0) {
                    if (critical) {
                        throw new Error(`Missing critical exports from ${name}: ${missing.join(', ')}`);
                    } else {
                        console.warn(`⚠️ Missing non-critical exports from ${name}: ${missing.join(', ')}`);
                    }
                }
            }
            
            // Check soft dependencies (for TaskCard)
            if (softDependencies && softDependencies.length > 0) {
                const missingSoft = softDependencies.filter(dep => !isDependencyAvailable(dep));
                if (missingSoft.length > 0) {
                    console.warn(`⚠️ ${name} loaded with missing soft dependencies: ${missingSoft.join(', ')} - will use fallbacks`);
                }
            }
            
            loadingState.loaded.add(component.name);
            console.log(`✅ Component ${name} loaded successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to load component ${name}:`, error);
            loadingState.failed.add(component.name);
            
            // Enhanced retry logic for critical components
            const retryCount = loadingState.retryCount.get(name) || 0;
            const maxRetries = critical ? COMPONENT_CONFIG.maxRetries + 2 : COMPONENT_CONFIG.maxRetries;
            
            if (retryCount < maxRetries) {
                console.log(`🔄 Retrying ${name} (attempt ${retryCount + 1}/${maxRetries})`);
                loadingState.retryCount.set(name, retryCount + 1);
                
                const retryDelay = COMPONENT_CONFIG.retryDelay * (retryCount + 1);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return loadComponent(component);
            }
            
            // For TaskCard specifically, try to create a fallback
            if (name === 'task-card' && critical) {
                console.warn(`⚠️ Creating fallback TaskCard component`);
                createFallbackTaskCard();
                loadingState.loaded.add(component.name);
                return true;
            }
            
            return false;
        }
    }

    /**
     * Create a fallback TaskCard component if loading fails
     */
    function createFallbackTaskCard() {
        if (!window.choreComponents) window.choreComponents = {};
        
        window.choreComponents.TaskCard = function FallbackTaskCard({ chore = {}, onComplete, onEdit, onDelete, assignees = [] }) {
            const h = React.createElement;
            
            return h('div', {
                className: 'p-4 bg-yellow-100 border border-yellow-400 rounded-lg mb-3'
            },
                h('div', { className: 'flex items-center justify-between' },
                    h('div', null,
                        h('h3', { className: 'font-medium text-yellow-800' }, chore.name || 'Task'),
                        h('p', { className: 'text-sm text-yellow-700' }, 'TaskCard fallback mode - some features unavailable')
                    ),
                    h('div', { className: 'flex gap-2' },
                        onComplete && h('button', {
                            onClick: () => onComplete(chore.id || chore.chore_id, 'Wie kan'),
                            className: 'px-3 py-1 bg-green-500 text-white rounded text-sm'
                        }, 'Complete'),
                        onEdit && h('button', {
                            onClick: () => onEdit(chore),
                            className: 'px-3 py-1 bg-blue-500 text-white rounded text-sm'
                        }, 'Edit')
                    )
                )
            );
        };
        
        console.log('⚠️ Fallback TaskCard component created');
    }

    /**
     * RESILIENT: Load all components with graceful error handling
     */
    async function loadAllComponents() {
        console.log('🚀 Starting RESILIENT component loader...');
        
        const results = {
            total: componentManifest.length,
            loaded: 0,
            failed: [],
            critical_failed: []
        };
        
        // Ensure choreComponents object exists
        window.choreComponents = window.choreComponents || {};
        
        // Load components in order, but don't let failures stop the process
        for (const component of componentManifest) {
            try {
                const success = await loadComponent(component);
                
                if (success) {
                    results.loaded++;
                } else {
                    results.failed.push(component.name);
                    if (component.critical) {
                        results.critical_failed.push(component.name);
                    }
                }
            } catch (error) {
                console.error(`💥 Critical error loading ${component.name}:`, error);
                results.failed.push(component.name);
                
                // Even if critical component fails, try to continue
                if (component.critical && component.name === 'task-card') {
                    createFallbackTaskCard();
                    results.loaded++;
                } else if (component.critical) {
                    results.critical_failed.push(component.name);
                }
            }
        }
        
        // Log comprehensive results
        const totalTime = Date.now() - loadingState.startTime;
        console.log(`📊 Component loading completed in ${totalTime}ms`);
        console.log(`✅ Loaded ${results.loaded}/${results.total} components`);
        
        if (results.failed.length > 0) {
            console.warn('⚠️ Failed components:', results.failed);
        }
        
        // RESILIENT: Don't fail completely even if some critical components fail
        const availableComponents = Object.keys(window.choreComponents);
        console.log(`📋 Available components: ${availableComponents.join(', ')}`);
        
        // Verify essential components are available (at least Loading and Modal)
        const essentialComponents = ['Loading', 'Modal'];
        const missingEssential = essentialComponents.filter(name => !window.choreComponents[name]);
        
        if (missingEssential.length > 0) {
            console.error('💥 Missing essential components:', missingEssential);
            return false;
        }
        
        // If TaskCard is missing, ensure we have a fallback
        if (!window.choreComponents.TaskCard) {
            console.warn('⚠️ TaskCard missing, creating fallback');
            createFallbackTaskCard();
        }
        
        return true;
    }

    /**
     * RESILIENT: Initialize the component loader
     */
    async function init() {
        try {
            // Check if React is available
            if (!window.React || !window.ReactDOM) {
                throw new Error('React or ReactDOM not found. Please ensure they are loaded before components.');
            }
            
            console.log(`🎯 React ${React.version} detected, starting resilient component loading...`);
            
            // Load all components
            const success = await loadAllComponents();
            
            console.log('🎉 Component system initialized!');
            
            // Always dispatch event - let the app decide if it can continue
            window.dispatchEvent(new CustomEvent('choreComponentsReady', {
                detail: {
                    loadedComponents: Array.from(loadingState.loaded),
                    failedComponents: Array.from(loadingState.failed),
                    loadTime: Date.now() - loadingState.startTime,
                    componentCount: Object.keys(window.choreComponents).length,
                    success
                }
            }));
            
            // Log component summary
            console.log(`📋 Available components:`, Object.keys(window.choreComponents));
            
        } catch (error) {
            console.error('💥 Component loader initialization failed:', error);
            
            // Create minimal fallback system
            window.choreComponents = window.choreComponents || {};
            
            // Ensure at least basic components exist
            if (!window.choreComponents.Loading) {
                window.choreComponents.Loading = function() {
                    return React.createElement('div', { className: 'p-4' }, 'Loading...');
                };
            }
            
            if (!window.choreComponents.TaskCard) {
                createFallbackTaskCard();
            }
            
            // Still dispatch event so app can continue
            window.dispatchEvent(new CustomEvent('choreComponentsReady', {
                detail: {
                    loadedComponents: ['Loading', 'TaskCard'],
                    failedComponents: [],
                    loadTime: Date.now() - loadingState.startTime,
                    componentCount: Object.keys(window.choreComponents).length,
                    success: false,
                    fallback: true,
                    error: error.message
                }
            }));
        }
    }

    // Store functions for external access and debugging
    window.ChoreComponentLoader = {
        init,
        loadComponent,
        getLoadingState: () => ({ ...loadingState }),
        getManifest: () => [...componentManifest],
        reload: () => {
            loadingState.loaded.clear();
            loadingState.failed.clear();
            loadingState.retryCount.clear();
            loadingState.startTime = Date.now();
            return init();
        },
        createFallbackTaskCard
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 10);
    }
    
    console.log('🔧 RESILIENT component loader initialized');
})();