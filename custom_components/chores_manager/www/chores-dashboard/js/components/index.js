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
            script.src = src + '?v=' + (window.CHORES_APP_VERSION || '1.4.1-20250415-flickerfix');
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
                    'TaskForm', 'UserManagement', 'IconSelector', 'WeekDayPicker', 'MonthDayPicker',
                    // Dialog components
                    'ConfirmDialog', 'CompletionConfirmDialog', 'SubtaskCompletionDialog', 'ErrorDialog', 'SuccessDialog',
                    // Stats components
                    'StatsCard', 'UserStatsCard', 'ThemeSettings'
                ];
                
                const missingComponents = expectedComponents.filter(comp => !window.choreComponents[comp]);
                if (missingComponents.length > 0) {
                    console.warn('Missing expected components:', missingComponents);
                } else {
                    console.log('All expected components are available');
                }
            } else {
                console.error('choreComponents object not found after loading');
            }
        } else {
            console.error(`Only ${loadedCount} of ${componentFiles.length} components loaded successfully`);
            console.error('Load errors:', loadErrors);
        }
    }

    // Start loading components
    loadAllComponents();

})();