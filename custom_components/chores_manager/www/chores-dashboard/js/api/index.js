/**
 * Main API module that combines all API classes.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // Main API class that combines all API modules
    class API {
        constructor() {
            this.chores = new window.ChoresAPI.ChoresAPI();
            this.users = new window.ChoresAPI.UsersAPI();
            this.theme = new window.ChoresAPI.ThemeAPI();
            
            // Expose getSensorState from base API
            this.getSensorState = this.chores.getSensorState.bind(this.chores);
        }
        
        /**
         * Initialize the API
         */
        async initialize() {
            // Check authentication
            const token = this.chores.getAuthToken();
            if (!token) {
                console.warn('API initialized without authentication token');
            }
            
            return true;
        }
    }
    
    // Create and export singleton instance
    window.ChoresAPI = new API();
    
    // Also export the API class for testing
    window.ChoresAPI.API = API;
})();