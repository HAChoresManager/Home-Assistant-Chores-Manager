// Chores Dashboard API Module - Base API
// Core functionality for all API interactions with Home Assistant
// Version: 1.4.1-20250415-flickerfix

(function(window) {
    'use strict';
    
    // Ensure ChoresAPI namespace exists
    window.ChoresAPI = window.ChoresAPI || {};
    
    // API Endpoints - Using full paths as in the original
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
    
    /**
     * Enhanced Base API class with exponential backoff and retry logic
     */
    class BaseAPI {
        constructor() {
            this.retryConfig = {
                maxRetries: 3,
                baseDelay: 1000,  // Start with 1 second
                maxDelay: 10000,  // Cap at 10 seconds
                backoffMultiplier: 2,
                jitterRange: 1000  // Add up to 1 second of jitter
            };
            
            // Track request statistics
            this.stats = {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                retriedRequests: 0,
                averageResponseTime: 0
            };
            
            // Request queue for rate limiting
            this.requestQueue = [];
            this.isProcessingQueue = false;
            this.requestsPerSecond = 10;  // Rate limit
            
            // Cache for GET requests
            this.cache = new Map();
            this.cacheTimeout = 5000;  // 5 seconds cache
        }
        
        /**
         * Calculate retry delay with exponential backoff and jitter
         */
        calculateRetryDelay(attempt) {
            // Exponential backoff: delay = min(base * (multiplier ^ attempt), maxDelay)
            const exponentialDelay = Math.min(
                this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
                this.retryConfig.maxDelay
            );
            
            // Add jitter to prevent thundering herd
            const jitter = Math.random() * this.retryConfig.jitterRange;
            
            return exponentialDelay + jitter;
        }
        
        /**
         * Check if error is retryable
         */
        isRetryableError(response) {
            // Retry on network errors, 5xx errors, and specific 4xx errors
            if (!response) return true;  // Network error
            
            const retryableStatuses = [
                408,  // Request Timeout
                429,  // Too Many Requests
                500,  // Internal Server Error
                502,  // Bad Gateway
                503,  // Service Unavailable
                504   // Gateway Timeout
            ];
            
            return retryableStatuses.includes(response.status);
        }
        
        /**
         * Get authentication token with multiple fallback mechanisms
         */
        getAuthToken() {
            // Try multiple sources for the token
            const sources = [
                // 1. Try native Home Assistant token from parent window
                () => {
                    if (window.parent && window.parent.hassConnection) {
                        try {
                            return window.parent.hassConnection.options.auth.data.access_token;
                        } catch (e) {
                            return null;
                        }
                    }
                    return null;
                },
                // 2. Try from global auth helper
                () => {
                    if (window.choreAuth && typeof window.choreAuth.getToken === 'function') {
                        try {
                            return window.choreAuth.getToken();
                        } catch (e) {
                            return null;
                        }
                    }
                    return null;
                },
                // 3. Check localStorage for chores-specific token
                () => localStorage.getItem('chores_auth_token'),
                // 4. Check sessionStorage
                () => sessionStorage.getItem('chores_auth_token'),
                // 5. Check localStorage for HA tokens
                () => {
                    const stored = localStorage.getItem('hassTokens');
                    if (stored) {
                        try {
                            const tokens = JSON.parse(stored);
                            return tokens.access_token;
                        } catch (e) {
                            return null;
                        }
                    }
                    return null;
                },
                // 6. Check config element
                () => {
                    const configEl = document.getElementById('chores-config');
                    return configEl ? configEl.dataset.token : null;
                },
                // 7. Check global variable
                () => window.CHORES_AUTH_TOKEN,
                // 8. Check meta tag
                () => {
                    const meta = document.querySelector('meta[name="chores-auth-token"]');
                    return meta ? meta.content : null;
                },
                // 9. Try URL parameters (for development)
                () => {
                    const urlParams = new URLSearchParams(window.location.search);
                    return urlParams.get('token');
                }
            ];
            
            for (const source of sources) {
                try {
                    const token = source();
                    if (token) {
                        return token;
                    }
                } catch (e) {
                    // Continue to next source
                }
            }
            
            console.warn('No authentication token found from any source');
            return null;
        }
        
        /**
         * Make an authenticated API call with enhanced retry logic
         */
        async fetchWithAuth(url, options = {}) {
            const startTime = Date.now();
            let lastError = null;
            let response = null;
            
            // Check cache for GET requests
            if (options.method === 'GET' || !options.method) {
                const cached = this.getCached(url);
                if (cached) {
                    console.log(`Cache hit for ${url}`);
                    this.stats.cacheHits = (this.stats.cacheHits || 0) + 1;
                    return cached;
                }
            }
            
            // Try request with retries
            for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
                try {
                    // Add delay for retries (exponential backoff)
                    if (attempt > 0) {
                        const delay = this.calculateRetryDelay(attempt - 1);
                        console.log(`Retry ${attempt}/${this.retryConfig.maxRetries} after ${Math.round(delay)}ms`);
                        await this.delay(delay);
                        this.stats.retriedRequests++;
                    }
                    
                    // Get fresh token for each attempt
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
                    } else if (attempt === 0) {
                        console.warn('No authentication token available for request to:', url);
                    }
                    
                    // Add timeout using AbortController
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000);  // 30 second timeout
                    fetchOptions.signal = controller.signal;
                    
                    this.stats.totalRequests++;
                    response = await fetch(url, fetchOptions);
                    clearTimeout(timeoutId);
                    
                    // Check if response is ok or if we should retry
                    if (response.ok) {
                        this.stats.successfulRequests++;
                        
                        // Update average response time
                        const responseTime = Date.now() - startTime;
                        this.stats.averageResponseTime = 
                            (this.stats.averageResponseTime * (this.stats.successfulRequests - 1) + responseTime) / 
                            this.stats.successfulRequests;
                        
                        // Cache successful GET responses
                        if (options.method === 'GET' || !options.method) {
                            this.setCached(url, response.clone());
                        }
                        
                        return response;
                    }
                    
                    // Check if error is retryable
                    if (!this.isRetryableError(response)) {
                        // Non-retryable error, fail immediately
                        console.error(`Non-retryable error ${response.status} for ${url}`);
                        this.stats.failedRequests++;
                        return response;
                    }
                    
                    // Retryable error, continue loop
                    lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                    
                } catch (error) {
                    lastError = error;
                    
                    // Check if error is abort (timeout)
                    if (error.name === 'AbortError') {
                        console.error(`Request timeout for ${url}`);
                    } else {
                        console.error(`Request error for ${url}:`, error);
                    }
                    
                    // Network errors are always retryable
                    if (attempt === this.retryConfig.maxRetries) {
                        this.stats.failedRequests++;
                        throw error;
                    }
                }
            }
            
            // All retries exhausted
            this.stats.failedRequests++;
            throw lastError || new Error('Request failed after all retries');
        }
        
        /**
         * Cache management
         */
        getCached(key) {
            const cached = this.cache.get(key);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.response.clone();
            }
            this.cache.delete(key);
            return null;
        }
        
        setCached(key, response) {
            this.cache.set(key, {
                response: response,
                timestamp: Date.now()
            });
            
            // Clean old cache entries
            if (this.cache.size > 100) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
        }
        
        /**
         * Clear cache
         */
        clearCache() {
            this.cache.clear();
        }
        
        /**
         * Delay helper
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        /**
         * Make a service call with queuing
         */
        async callService(endpoint, data = {}) {
            // Add to queue for rate limiting
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ endpoint, data, resolve, reject });
                this.processQueue();
            });
        }
        
        /**
         * Process request queue with rate limiting
         */
        async processQueue() {
            if (this.isProcessingQueue || this.requestQueue.length === 0) {
                return;
            }
            
            this.isProcessingQueue = true;
            
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift();
                
                try {
                    const response = await this.fetchWithAuth(request.endpoint, {
                        method: 'POST',
                        body: JSON.stringify(request.data)
                    });
                    
                    // Handle non-OK responses
                    if (!response.ok) {
                        let errorMessage = `Service call failed: ${response.status}`;
                        
                        try {
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.includes('application/json')) {
                                const errorData = await response.json();
                                errorMessage = errorData.message || errorData.error || errorMessage;
                            } else {
                                const errorText = await response.text();
                                errorMessage = `${response.status}: ${errorText || response.statusText}`;
                            }
                        } catch (e) {
                            errorMessage = `${response.status}: ${response.statusText}`;
                        }
                        
                        throw new Error(errorMessage);
                    }
                    
                    // Parse successful response
                    let result;
                    try {
                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            result = await response.json();
                        } else {
                            // Some services don't return JSON
                            result = { success: true };
                        }
                    } catch (e) {
                        // If parsing fails, assume success
                        result = { success: true };
                    }
                    
                    // Check for service-level errors
                    if (result && result.success === false) {
                        throw new Error(result.error || 'Service returned an error');
                    }
                    
                    request.resolve(result);
                    
                } catch (error) {
                    console.error('Service call error:', error);
                    console.error('Service details:', {
                        endpoint: request.endpoint,
                        data: request.data,
                        error: error.message
                    });
                    request.reject(error);
                }
                
                // Rate limiting delay
                await this.delay(1000 / this.requestsPerSecond);
            }
            
            this.isProcessingQueue = false;
        }
        
        /**
         * Get sensor state with fallback
         */
        async getSensorState() {
            try {
                const response = await this.fetchWithAuth(ENDPOINTS.SENSOR_STATE);
                
                if (response.status === 404) {
                    // Sensor not available yet, return default state
                    console.warn('Sensor not found, returning default state');
                    return this.getDefaultSensorState();
                }
                
                if (!response.ok) {
                    throw new Error(`Failed to get sensor state: ${response.status}`);
                }
                
                const state = await response.json();
                
                // Handle unavailable state
                if (state.state === 'unavailable' || state.state === 'unknown') {
                    console.warn('Sensor is unavailable, returning default state');
                    return this.getDefaultSensorState();
                }
                
                return state;
                
            } catch (error) {
                console.error('Error getting sensor state:', error);
                // Return default state on error
                return this.getDefaultSensorState();
            }
        }
        
        /**
         * Get default sensor state
         */
        getDefaultSensorState() {
            return {
                state: "0",
                attributes: {
                    friendly_name: "Chores Overview",
                    chores: [],
                    overdue_tasks: [],
                    stats: {
                        total_tasks: 0,
                        completed_today: 0,
                        overdue_count: 0
                    },
                    assignees: [
                        {id: "laura", name: "Laura", color: "#F5B7B1", active: true},
                        {id: "martijn", name: "Martijn", color: "#F9E79F", active: true},
                        {id: "wie_kan", name: "Wie kan", color: "#A9DFBF", active: true}
                    ],
                    theme_settings: {
                        primary_color: "#4299E1",
                        secondary_color: "#805AD5",
                        accent_color: "#38B2AC",
                        background_style: "gradient",
                        card_style: "modern",
                        enable_animations: true
                    }
                }
            };
        }
        
        /**
         * Get API statistics
         */
        getStats() {
            return {
                ...this.stats,
                cacheSize: this.cache.size,
                queueLength: this.requestQueue.length
            };
        }
        
        /**
         * Log error to backend (if implemented)
         */
        async logError(errorData) {
            // This could be implemented to send errors to a monitoring service
            console.log('Error logged:', errorData);
        }
    }
    
    // Export to ChoresAPI namespace
    window.ChoresAPI.BaseAPI = BaseAPI;
    window.ChoresAPI.ENDPOINTS = ENDPOINTS;
    
    console.log('BaseAPI loaded successfully with exponential backoff and retry logic');
})();