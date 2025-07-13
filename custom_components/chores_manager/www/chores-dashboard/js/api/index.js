/**
 * Main API module that combines all API classes.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // Save references to what was already loaded
    const ENDPOINTS = window.ChoresAPI.ENDPOINTS;
    const BaseAPI = window.ChoresAPI.BaseAPI;
    const ChoresAPI = window.ChoresAPI.ChoresAPI;
    const UsersAPI = window.ChoresAPI.UsersAPI;
    const ThemeAPI = window.ChoresAPI.ThemeAPI;
    
    // Main API class that combines all API modules
    class API {
        constructor() {
            this.chores = new ChoresAPI();
            this.users = new UsersAPI();
            this.theme = new ThemeAPI();
            
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
    
    // Create singleton instance but preserve existing properties
    const apiInstance = new API();
    
    // Restore the static properties
    window.ChoresAPI = apiInstance;
    window.ChoresAPI.ENDPOINTS = ENDPOINTS;
    window.ChoresAPI.BaseAPI = BaseAPI;
    window.ChoresAPI.ChoresAPI = ChoresAPI;
    window.ChoresAPI.UsersAPI = UsersAPI;
    window.ChoresAPI.ThemeAPI = ThemeAPI;
    window.ChoresAPI.API = API;
    
    console.log('ChoresAPI initialized with endpoints:', Object.keys(ENDPOINTS || {}));
})();