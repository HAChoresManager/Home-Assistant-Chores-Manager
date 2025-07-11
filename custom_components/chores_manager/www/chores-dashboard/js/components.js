/**
 * Components compatibility layer for the Chores Manager
 * This file maintains backward compatibility while components are loaded from modular files
 * 
 * IMPORTANT: This is a transitional file. New code should import from the specific
 * component modules in the components/ directory.
 */

(function() {
    'use strict';

    console.log('Loading components compatibility layer...');

    // Check if components are already loaded from modular files
    if (window.choreComponents) {
        console.log('Components already loaded from modular files');
        return;
    }

    // Create placeholder for components
    window.choreComponents = window.choreComponents || {};

    // Add a warning message for developers
    console.warn(
        'components.js is deprecated. Components are now loaded from modular files:\n' +
        '- components/base.js - Base UI components\n' +
        '- components/tasks.js - Task-related components\n' +
        '- components/forms.js - Form components\n' +
        '- components/stats.js - Statistics components\n' +
        '- components/dialogs.js - Dialog components\n' +
        'Please update your code to use the modular structure.'
    );

    // The actual components are now loaded by components/index.js
    // This file remains empty to maintain backward compatibility
    // and prevent errors if something still tries to load it directly

})();