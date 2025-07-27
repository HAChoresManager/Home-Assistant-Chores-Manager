/**
 * Main API module that combines all API classes.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // Wait for all API modules to be loaded
    function checkAPIDependencies() {
        return window.ChoresAPI.BaseAPI && 
               window.ChoresAPI.ChoresAPI && 
               window.ChoresAPI.UsersAPI && 
               window.ChoresAPI.ThemeAPI &&
               window.ChoresAPI.ENDPOINTS;
    }
    
    // Initialize API when dependencies are ready
    function initializeAPI() {
        if (!checkAPIDependencies()) {
            console.warn('API dependencies not ready, waiting...');
            setTimeout(initializeAPI, 50);
            return;
        }
        
        try {
            // Save references before creating instances
            const ENDPOINTS = window.ChoresAPI.ENDPOINTS;
            const BaseAPI = window.ChoresAPI.BaseAPI;
            const ChoresAPIClass = window.ChoresAPI.ChoresAPI;
            const UsersAPI = window.ChoresAPI.UsersAPI;
            const ThemeAPI = window.ChoresAPI.ThemeAPI;
            
            // Create instances
            const choresInstance = new ChoresAPIClass();
            const usersInstance = new UsersAPI();
            const themeInstance = new ThemeAPI();
            
            // Create a unified API object that exposes all methods
            const api = {
                // Expose chores methods with proper naming
                chores: {
                    // Map the expected method names to actual methods
                    add: choresInstance.addChore.bind(choresInstance),
                    addChore: choresInstance.addChore.bind(choresInstance), // Keep both for compatibility
                    markDone: choresInstance.markDone.bind(choresInstance),
                    updateDescription: choresInstance.updateDescription.bind(choresInstance),
                    reset: choresInstance.resetChore.bind(choresInstance),
                    resetChore: choresInstance.resetChore.bind(choresInstance),
                    delete: choresInstance.deleteChore.bind(choresInstance),
                    deleteChore: choresInstance.deleteChore.bind(choresInstance),
                    forceDue: choresInstance.forceDue.bind(choresInstance),
                    completeSubtask: choresInstance.completeSubtask.bind(choresInstance),
                    addSubtask: choresInstance.addSubtask.bind(choresInstance),
                    deleteSubtask: choresInstance.deleteSubtask.bind(choresInstance),
                    // Also expose base methods
                    getSensorState: choresInstance.getSensorState.bind(choresInstance)
                },
                
                // Expose users methods
                users: {
                    add: usersInstance.addUser.bind(usersInstance),
                    addUser: usersInstance.addUser.bind(usersInstance), // Keep both for compatibility
                    delete: usersInstance.deleteUser.bind(usersInstance),
                    deleteUser: usersInstance.deleteUser.bind(usersInstance),
                    getHAUsers: usersInstance.getHAUsers.bind(usersInstance)
                },
                
                // Expose theme methods
                theme: {
                    get: themeInstance.get.bind(themeInstance),
                    save: themeInstance.save.bind(themeInstance),
                    reset: themeInstance.reset.bind(themeInstance)
                },
                
                // Expose getSensorState directly from the chores instance (it inherits from BaseAPI)
                getSensorState: async function() {
                    // Call the getSensorState method from the BaseAPI through chores instance
                    if (typeof choresInstance.getSensorState === 'function') {
                        return await choresInstance.getSensorState();
                    } else {
                        // Fallback to using the base API directly
                        const baseInstance = new BaseAPI();
                        return await baseInstance.getSensorState();
                    }
                },
                
                // Add backward compatibility for sensor.getState()
                sensor: {
                    getState: async function() {
                        return await choresInstance.getSensorState();
                    }
                },
                
                // Initialize method
                initialize: async function() {
                    // Check authentication
                    const token = choresInstance.getAuthToken ? choresInstance.getAuthToken() : null;
                    if (!token) {
                        console.warn('API initialized without authentication token');
                    }
                    return true;
                },
                
                // Get auth token
                getAuthToken: function() {
                    return choresInstance.getAuthToken ? choresInstance.getAuthToken() : null;
                }
            };
            
            // Replace window.ChoresAPI with the new API object while preserving class definitions
            window.ChoresAPI = {
                // The main API object (what app.js will use)
                ...api,
                
                // Preserve all the class definitions and constants
                ENDPOINTS: ENDPOINTS,
                BaseAPI: BaseAPI,
                ChoresAPI: ChoresAPIClass,
                UsersAPI: UsersAPI,
                ThemeAPI: ThemeAPI
            };
            
            console.log('ChoresAPI initialized successfully with endpoints:', Object.keys(ENDPOINTS || {}));
            
            // Verify key methods are available
            if (typeof window.ChoresAPI.getSensorState === 'function') {
                console.log('getSensorState method confirmed available');
            } else {
                console.error('getSensorState method not available after initialization');
            }
            
            if (typeof window.ChoresAPI.theme.get === 'function') {
                console.log('theme.get method confirmed available');
            } else {
                console.error('theme.get method not available after initialization');
            }
            
            // Log available chores methods for debugging
            if (window.ChoresAPI.chores) {
                console.log('Available chores methods:', Object.keys(window.ChoresAPI.chores));
            }
            
            // Dispatch event to signal API is ready
            window.dispatchEvent(new CustomEvent('chores-api-ready'));
        } catch (error) {
            console.error('Failed to initialize API:', error);
        }
    }
    
    // Start initialization
    initializeAPI();
})();