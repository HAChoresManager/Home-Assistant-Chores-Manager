/**
 * COMPLETELY FIXED Main API module that combines all API classes
 * Fixes all method binding issues and ensures proper initialization
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
            console.log('🚀 Initializing FIXED ChoresAPI...');
            
            // Save references before creating instances
            const ENDPOINTS = window.ChoresAPI.ENDPOINTS;
            const BaseAPI = window.ChoresAPI.BaseAPI;
            const ChoresAPIClass = window.ChoresAPI.ChoresAPI;
            const UsersAPI = window.ChoresAPI.UsersAPI;
            const ThemeAPI = window.ChoresAPI.ThemeAPI;
            
            // Create instances
            const baseInstance = new BaseAPI();
            const choresInstance = new ChoresAPIClass();
            const usersInstance = new UsersAPI();
            const themeInstance = new ThemeAPI();
            
            // FIXED: Ensure theme instance has access to base API
            themeInstance.setBaseAPI(baseInstance);
            
            // FIXED: Create a unified API object that exposes all methods with proper binding
            const api = {
                // Expose chores methods with proper binding
                chores: {
                    getAll: choresInstance.getAll.bind(choresInstance),
                    add: choresInstance.add.bind(choresInstance),
                    update: choresInstance.update.bind(choresInstance),
                    delete: choresInstance.delete.bind(choresInstance),
                    markComplete: choresInstance.markComplete.bind(choresInstance),
                    markCompleted: choresInstance.markComplete.bind(choresInstance), // Alias
                    complete: choresInstance.markComplete.bind(choresInstance), // Alias
                    completeSubtask: choresInstance.completeSubtask?.bind(choresInstance),
                    resetCompletion: choresInstance.resetCompletion?.bind(choresInstance),
                    getStats: choresInstance.getStats?.bind(choresInstance)
                },
                
                // Expose users methods with proper binding
                users: {
                    getAll: usersInstance.getAll.bind(usersInstance),
                    add: usersInstance.add.bind(usersInstance),
                    update: usersInstance.update.bind(usersInstance),
                    updateColor: usersInstance.updateColor.bind(usersInstance),
                    delete: usersInstance.delete.bind(usersInstance),
                    getHAUsers: usersInstance.getHAUsers.bind(usersInstance)
                },
                
                // FIXED: Expose theme methods with proper binding
                theme: {
                    get: themeInstance.get.bind(themeInstance),
                    save: themeInstance.save.bind(themeInstance),
                    reset: themeInstance.reset.bind(themeInstance),
                    applyTheme: themeInstance.applyTheme.bind(themeInstance),
                    getCurrentTheme: themeInstance.getCurrentTheme.bind(themeInstance),
                    validateTheme: themeInstance.validateTheme.bind(themeInstance),
                    getPresets: themeInstance.getPresets.bind(themeInstance),
                    applyPreset: themeInstance.applyPreset.bind(themeInstance)
                },
                
                // FIXED: Expose getSensorState directly from the base instance
                getSensorState: baseInstance.getSensorState.bind(baseInstance),
                
                // FIXED: Add backward compatibility for sensor.getState()
                sensor: {
                    getState: baseInstance.getSensorState.bind(baseInstance)
                },
                
                // Initialize method with comprehensive setup
                initialize: async function() {
                    console.log('🔧 Initializing API system...');
                    
                    try {
                        // Check authentication
                        const token = baseInstance.getAuthToken ? baseInstance.getAuthToken() : null;
                        if (!token) {
                            console.warn('⚠️ API initialized without authentication token');
                        } else {
                            console.log('✅ Authentication token available');
                        }
                        
                        // Test basic connectivity
                        try {
                            await baseInstance.getSensorState();
                            console.log('✅ API connectivity test passed');
                        } catch (connectError) {
                            console.warn('⚠️ API connectivity test failed:', connectError.message);
                        }
                        
                        // Initialize theme
                        try {
                            const theme = await themeInstance.get();
                            themeInstance.applyTheme(theme);
                            console.log('✅ Theme initialized');
                        } catch (themeError) {
                            console.warn('⚠️ Theme initialization failed:', themeError.message);
                        }
                        
                        console.log('🎉 API system initialized successfully');
                        return true;
                        
                    } catch (error) {
                        console.error('❌ API initialization failed:', error);
                        throw error;
                    }
                },
                
                // Get auth token
                getAuthToken: function() {
                    return baseInstance.getAuthToken ? baseInstance.getAuthToken() : null;
                },
                
                // Health check method
                healthCheck: async function() {
                    try {
                        const state = await baseInstance.getSensorState();
                        return {
                            status: 'healthy',
                            timestamp: new Date().toISOString(),
                            sensorState: !!state,
                            hasAuth: !!this.getAuthToken()
                        };
                    } catch (error) {
                        return {
                            status: 'unhealthy',
                            timestamp: new Date().toISOString(),
                            error: error.message,
                            hasAuth: !!this.getAuthToken()
                        };
                    }
                }
            };
            
            // FIXED: Replace window.ChoresAPI with the new API object while preserving class definitions
            const originalClasses = {
                ENDPOINTS: ENDPOINTS,
                BaseAPI: BaseAPI,
                ChoresAPI: ChoresAPIClass,
                UsersAPI: UsersAPI,
                ThemeAPI: ThemeAPI
            };
            
            // Clear existing ChoresAPI
            window.ChoresAPI = {
                // The main API object (what app.js will use)
                ...api,
                
                // Preserve all the class definitions and constants for reference
                ...originalClasses
            };
            
            console.log('✅ ChoresAPI initialized successfully');
            console.log('📋 Available endpoints:', Object.keys(ENDPOINTS || {}));
            
            // Verify key methods are available
            const criticalMethods = [
                'getSensorState',
                'theme.get',
                'chores.getAll',
                'users.getAll'
            ];
            
            const missingMethods = criticalMethods.filter(method => {
                const parts = method.split('.');
                let obj = window.ChoresAPI;
                for (const part of parts) {
                    if (!obj || typeof obj[part] !== 'function') {
                        return true;
                    }
                    obj = obj[part];
                }
                return false;
            });
            
            if (missingMethods.length === 0) {
                console.log('✅ All critical API methods confirmed available');
            } else {
                console.error('❌ Missing critical API methods:', missingMethods);
            }
            
            // Log available methods for debugging
            console.log('🔍 Available API methods:');
            console.log('  Chores:', Object.keys(window.ChoresAPI.chores || {}));
            console.log('  Users:', Object.keys(window.ChoresAPI.users || {}));
            console.log('  Theme:', Object.keys(window.ChoresAPI.theme || {}));
            
            // Dispatch event to signal API is ready
            window.dispatchEvent(new CustomEvent('chores-api-ready', {
                detail: {
                    timestamp: new Date().toISOString(),
                    methods: {
                        chores: Object.keys(api.chores),
                        users: Object.keys(api.users),
                        theme: Object.keys(api.theme)
                    }
                }
            }));
            
        } catch (error) {
            console.error('💥 Failed to initialize API:', error);
            
            // Create minimal fallback API
            window.ChoresAPI = {
                ...window.ChoresAPI, // Preserve existing classes
                error: error.message,
                getSensorState: async () => { throw new Error('API initialization failed'); },
                theme: {
                    get: async () => ({ backgroundColor: '#ffffff', cardColor: '#f8fafc' }),
                    save: async () => { throw new Error('API initialization failed'); },
                    reset: async () => { throw new Error('API initialization failed'); }
                },
                chores: {
                    getAll: async () => { throw new Error('API initialization failed'); }
                },
                users: {
                    getAll: async () => { throw new Error('API initialization failed'); }
                },
                initialize: async () => { throw error; }
            };
        }
    }
    
    // Start initialization
    initializeAPI();
})();