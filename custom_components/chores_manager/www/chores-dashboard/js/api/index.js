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
    
    // Main API class that combines all API modules
    class API {
        constructor() {
            // Only create instances if classes are available
            if (!checkAPIDependencies()) {
                throw new Error('API dependencies not loaded');
            }
            
            this.chores = new window.ChoresAPI.ChoresAPI();
            this.users = new window.ChoresAPI.UsersAPI();
            this.theme = new window.ChoresAPI.ThemeAPI();
            
            // Expose getSensorState from base API
            this.getSensorState = this.chores.getSensorState.bind(this.chores);
            
            // Add backward compatibility for sensor.getState()
            this.sensor = {
                getState: this.getSensorState.bind(this)
            };
            
            // Mark as initialized
            this._initialized = true;
        }
        
        /**
         * Initialize the API
         */
        async initialize() {
            // Check authentication - use BaseAPI method through chores instance
            const token = this.chores.getAuthToken ? this.chores.getAuthToken() : null;
            if (!token) {
                console.warn('API initialized without authentication token');
            }
            
            return true;
        }
        
        /**
         * Get authentication token (delegate to BaseAPI)
         */
        getAuthToken() {
            return this.chores.getAuthToken ? this.chores.getAuthToken() : null;
        }
    }
    
    // Initialize API when dependencies are ready
    function initializeAPI() {
        if (!checkAPIDependencies()) {
            console.warn('API dependencies not ready, waiting...');
            setTimeout(initializeAPI, 50);
            return;
        }
        
        try {
            // Save references before creating instance
            const ENDPOINTS = window.ChoresAPI.ENDPOINTS;
            const BaseAPI = window.ChoresAPI.BaseAPI;
            const ChoresAPIClass = window.ChoresAPI.ChoresAPI;
            const UsersAPI = window.ChoresAPI.UsersAPI;
            const ThemeAPI = window.ChoresAPI.ThemeAPI;
            
            // Create singleton instance
            const apiInstance = new API();
            
            // Create a new namespace that includes both the instance and the classes
            const ChoresAPINamespace = {
                // The main API instance (what app.js will use)
                instance: apiInstance,
                
                // Preserve all the class definitions
                ENDPOINTS: ENDPOINTS,
                BaseAPI: BaseAPI,
                ChoresAPI: ChoresAPIClass,
                UsersAPI: UsersAPI,
                ThemeAPI: ThemeAPI,
                API: API,
                
                // Expose instance methods at the root level for backward compatibility
                chores: apiInstance.chores,
                users: apiInstance.users,
                theme: apiInstance.theme,
                getSensorState: apiInstance.getSensorState.bind(apiInstance),
                sensor: apiInstance.sensor,
                initialize: apiInstance.initialize.bind(apiInstance),
                getAuthToken: apiInstance.getAuthToken.bind(apiInstance)
            };
            
            // Replace window.ChoresAPI with the new namespace
            window.ChoresAPI = ChoresAPINamespace;
            
            console.log('ChoresAPI initialized successfully with endpoints:', Object.keys(ENDPOINTS || {}));
            
            // Dispatch event to signal API is ready
            window.dispatchEvent(new CustomEvent('chores-api-ready'));
        } catch (error) {
            console.error('Failed to initialize API:', error);
        }
    }
    
    // Start initialization
    initializeAPI();
})();