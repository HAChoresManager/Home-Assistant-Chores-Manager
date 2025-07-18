/**
 * Component loader for the Chores Manager
 * Loads all modular components in the correct order
 */

(function() {
    'use strict';

    // Define the loading order - dependencies first
    const componentFiles = [
        'components/base.js',      // Base components and utilities
        'components/dialogs.js',   // Dialog components (needed by tasks and forms)
        'components/tasks.js',     // Task-related components
        'components/forms.js',     // Form components
        'components/stats.js',     // Statistics components
    ];

    let loadedCount = 0;
    let loadErrors = [];

    /**
     * Load a component script
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src + '?v=' + (window.CHORES_APP_VERSION || '1.4.0-20250415-modular');
            script.type = 'text/javascript';
            
            script.onload = () => {
                console.log(`Loaded: ${src}`);
                resolve();
            };
            
            script.onerror = (error) => {
                console.error(`Failed to load: ${src}`, error);
                reject(new Error(`Failed to load ${src}`));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Load all components in sequence
     */
    async function loadAllComponents() {
        console.log('Starting component loader...');
        
        for (const file of componentFiles) {
            try {
                await loadScript('js/' + file);
                loadedCount++;
            } catch (error) {
                loadErrors.push(error);
                console.error('Component loading error:', error);
            }
        }

        // Check if all components loaded successfully
        if (loadedCount === componentFiles.length) {
            console.log('All components loaded successfully');
            
            // Verify that choreComponents exists and has expected properties
            if (window.choreComponents) {
                const expectedComponents = [
                    // Base components
                    'Loading', 'ErrorMessage', 'Alert', 'Modal', 'EmptyState', 'Badge', 'ProgressBar', 'Tooltip',
                    // Task components
                    'TaskCard', 'TaskDescription', 'PriorityIndicator',
                    // Form components
                    'TaskForm', 'UserManagement', 'IconSelector',
                    // Stats components
                    'StatsCard', 'UserStatsCard', 'ThemeSettings',
                    // Dialog components
                    'ConfirmDialog', 'CompletionConfirmDialog', 'SubtaskCompletionDialog'
                ];
                
                const missingComponents = expectedComponents.filter(
                    comp => typeof window.choreComponents[comp] !== 'function'
                );
                
                if (missingComponents.length > 0) {
                    console.warn('Some expected components are missing:', missingComponents);
                } else {
                    console.log('All expected components are available');
                }
                
                // Log available components
                const availableComponents = Object.keys(window.choreComponents).filter(
                    key => typeof window.choreComponents[key] === 'function'
                );
                console.log('Available components:', availableComponents);
            }
            
            // Dispatch event to signal components are ready
            window.dispatchEvent(new CustomEvent('chores-components-ready'));
        } else {
            console.error(`Failed to load all components. Loaded: ${loadedCount}/${componentFiles.length}`);
            console.error('Load errors:', loadErrors);
            
            // Show error in the root element
            const rootElement = document.getElementById('root');
            if (rootElement) {
                rootElement.innerHTML = `
                    <div class="error-container">
                        <h2>Component Loading Error</h2>
                        <p>Failed to load some components. Please refresh the page.</p>
                        <p>Errors: ${loadErrors.map(e => e.message).join(', ')}</p>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px;">
                            Reload Page
                        </button>
                    </div>
                `;
            }
        }
    }

    // Start loading components
    loadAllComponents().catch(error => {
        console.error('Critical error loading components:', error);
    });
    
    console.log('Component loader initialized');
})();