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
            script.src = src + '?v=' + (window.CHORES_APP_VERSION || Date.now());
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
                    'TaskCard', 'TaskDescription', 'PriorityIndicator',
                    'TaskForm', 'UserManagement', 'IconSelector',
                    'StatsCard', 'UserStatsCard', 'ThemeSettings',
                    'ConfirmDialog', 'CompletionConfirmDialog', 'SubtaskCompletionDialog'
                ];
                
                const missingComponents = expectedComponents.filter(
                    comp => !window.choreComponents[comp]
                );
                
                if (missingComponents.length > 0) {
                    console.warn('Missing components:', missingComponents);
                } else {
                    console.log('All expected components are available');
                }
            }
            
            // Trigger custom event to signal components are ready
            window.dispatchEvent(new CustomEvent('choreComponentsReady'));
        } else {
            console.error(`Only ${loadedCount}/${componentFiles.length} components loaded`);
            console.error('Load errors:', loadErrors);
        }
    }

    // Start loading components
    loadAllComponents().catch(error => {
        console.error('Fatal error loading components:', error);
    });

    // Export loader status
    window.choreComponentLoader = {
        isLoading: () => loadedCount < componentFiles.length,
        getLoadedCount: () => loadedCount,
        getTotalCount: () => componentFiles.length,
        getErrors: () => loadErrors
    };

    console.log('Component loader initialized');
})();