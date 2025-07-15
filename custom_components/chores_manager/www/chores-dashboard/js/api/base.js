/**
 * Base API functionality for Chores Dashboard.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // API endpoints
    const ENDPOINTS = {
        // Chore services
        ADD_CHORE: '/api/services/chores_manager/add_chore',
        MARK_DONE: '/api/services/chores_manager/mark_done',
        UPDATE_DESCRIPTION: '/api/services/chores_manager/update_description',
        RESET_CHORE: '/api/services/chores_manager/reset_chore',
        DELETE_CHORE: '/api/services/chores_manager/delete_chore',
        FORCE_DUE: '/api/services/chores_manager/force_due',
        
        // Subtask services
        COMPLETE_SUBTASK: '/api/services/chores_manager/complete_subtask',
        ADD_SUBTASK: '/api/services/chores_manager/add_subtask',
        DELETE_SUBTASK: '/api/services/chores_manager/delete_subtask',
        
        // User services
        ADD_USER: '/api/services/chores_manager/add_user',
        DELETE_USER: '/api/services/chores_manager/delete_user',
        GET_HA_USERS: '/api/services/chores_manager/get_ha_users',
        
        // Theme services
        SAVE_THEME: '/api/services/chores_manager/save_theme',
        
        // Sensor endpoint
        SENSOR_STATE: '/api/states/sensor.chores_overview'
    };
    
    // Base API class
    class BaseAPI {
        constructor() {
            this.retryConfig = {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 5000
            };
        }
        
        /**
         * Make an authenticated API call with retry logic
         */
        async fetchWithAuth(url, options = {}) {
            const maxRetries = this.retryConfig.maxRetries;
            let lastError = null;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const token = this.getAuthToken();
                    
                    const fetchOptions = {
                        ...options,
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache',
                            ...options.headers
                        },
                        credentials: 'same-origin'
                    };
                    
                    if (token) {
                        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
                    }
                    
                    const response = await fetch(url, fetchOptions);
                    
                    // Handle 401 errors
                    if (response.status === 401 && attempt < maxRetries) {
                        console.warn(`Authentication failed for ${url}, retrying...`);
                        await this.handleAuthError();
                        await this.delay(this.calculateBackoff(attempt));
                        continue;
                    }
                    
                    return response;
                    
                } catch (error) {
                    lastError = error;
                    console.error(`Fetch error for ${url} (attempt ${attempt + 1}):`, error);
                    
                    if (attempt < maxRetries) {
                        await this.delay(this.calculateBackoff(attempt));
                    }
                }
            }
            
            throw lastError || new Error('Max retries exceeded');
        }
        
        /**
         * Get the authentication token
         */
        getAuthToken() {
            // Try multiple sources
            const token = localStorage.getItem('chores_auth_token') ||
                         window.choreUtils?.getAuthToken?.() ||
                         null;
            
            if (!token) {
                console.warn('No authentication token available');
            }
            
            return token;
        }
        
        /**
         * Handle authentication errors
         */
        async handleAuthError() {
            // Clear stored token
            localStorage.removeItem('chores_auth_token');
            
            // Try to refresh token if auth helper is available
            if (window.choreAuth?.getBestToken) {
                try {
                    const newToken = await window.choreAuth.getBestToken();
                    if (newToken) {
                        localStorage.setItem('chores_auth_token', newToken);
                    }
                } catch (e) {
                    console.error('Failed to refresh token:', e);
                }
            }
            
            // Dispatch auth error event
            window.dispatchEvent(new CustomEvent('chores-auth-error', {
                detail: { message: 'Authentication failed' }
            }));
        }
        
        /**
         * Calculate exponential backoff delay
         */
        calculateBackoff(attempt) {
            const delay = Math.min(
                this.retryConfig.baseDelay * Math.pow(2, attempt),
                this.retryConfig.maxDelay
            );
            // Add jitter
            return delay + Math.random() * 1000;
        }
        
        /**
         * Delay helper
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        /**
         * Make a service call
         */
        async callService(endpoint, data = {}) {
            try {
                const response = await this.fetchWithAuth(endpoint, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Service call failed: ${response.status} ${errorText}`);
                }
                
                const result = await response.json();
                
                // Check for service-level errors
                if (result && result.success === false) {
                    throw new Error(result.error || 'Service returned an error');
                }
                
                return result;
                
            } catch (error) {
                console.error('Service call error:', error);
                throw error;
            }
        }
        
        /**
         * Get sensor state
         */
        async getSensorState() {
            const response = await this.fetchWithAuth(ENDPOINTS.SENSOR_STATE);
            
            if (response.status === 404) {
                // Sensor not available yet
                return {
                    state: "0",
                    attributes: {
                        friendly_name: "Chores Overview",
                        overdue_tasks: [],
                        stats: {},
                        assignees: [
                            {id: "laura", name: "Laura", color: "#F5B7B1", active: true},
                            {id: "martijn", name: "Martijn", color: "#F9E79F", active: true},
                            {id: "wie_kan", name: "Wie kan", color: "#A9DFBF", active: true}
                        ]
                    }
                };
            }
            
            if (!response.ok) {
                throw new Error(`Failed to get sensor state: ${response.status}`);
            }
            
            return await response.json();
        }
    }
    
    // Export
    window.ChoresAPI.BaseAPI = BaseAPI;
    window.ChoresAPI.ENDPOINTS = ENDPOINTS;
})();