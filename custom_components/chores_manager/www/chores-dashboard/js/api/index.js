/**
 * BULLETPROOF Main API module - Handles all edge cases
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // Check if classes exist
    function checkAPIDependencies() {
        const deps = {
            BaseAPI: !!window.ChoresAPI.BaseAPI,
            ChoresAPI: !!window.ChoresAPI.ChoresAPI,
            UsersAPI: !!window.ChoresAPI.UsersAPI,
            ThemeAPI: !!window.ChoresAPI.ThemeAPI,
            ENDPOINTS: !!window.ChoresAPI.ENDPOINTS
        };
        
        const missing = Object.entries(deps).filter(([k, v]) => !v).map(([k]) => k);
        if (missing.length > 0) {
            console.warn('Missing API dependencies:', missing);
        }
        
        return missing.length === 0;
    }
    
    // Bulletproof method binding
    function safeBind(instance, methodName) {
        try {
            if (instance && instance[methodName] && typeof instance[methodName] === 'function') {
                return instance[methodName].bind(instance);
            }
        } catch (e) {
            console.warn(`Error binding ${methodName}:`, e);
        }
        
        // Return safe fallback
        return async (...args) => {
            console.warn(`Method ${methodName} not available`);
            throw new Error(`API method ${methodName} not implemented`);
        };
    }
    
    // Initialize API
    function initializeAPI() {
        if (!checkAPIDependencies()) {
            setTimeout(initializeAPI, 100);
            return;
        }
        
        try {
            console.log('🚀 Initializing BULLETPROOF ChoresAPI...');
            
            // Save class references
            const { BaseAPI, ChoresAPI: ChoresAPIClass, UsersAPI, ThemeAPI, ENDPOINTS } = window.ChoresAPI;
            
            // Create instances with error handling
            let baseInstance, choresInstance, usersInstance, themeInstance;
            
            try { baseInstance = new BaseAPI(); } catch (e) { 
                console.error('BaseAPI creation failed:', e);
                baseInstance = { getSensorState: async () => ({ attributes: {} }) };
            }
            
            try { choresInstance = new ChoresAPIClass(); } catch (e) { 
                console.error('ChoresAPI creation failed:', e);
                choresInstance = {};
            }
            
            try { usersInstance = new UsersAPI(); } catch (e) { 
                console.error('UsersAPI creation failed:', e);
                usersInstance = {};
            }
            
            try { 
                themeInstance = new ThemeAPI();
                if (themeInstance.setBaseAPI) themeInstance.setBaseAPI(baseInstance);
            } catch (e) { 
                console.error('ThemeAPI creation failed:', e);
                themeInstance = { get: async () => ({}), save: async () => {} };
            }
            
            // Build API object with safe bindings
            const api = {
                chores: {
                    getAll: safeBind(choresInstance, 'getAll'),
                    add: safeBind(choresInstance, 'add'),
                    update: safeBind(choresInstance, 'update'),
                    delete: safeBind(choresInstance, 'delete'),
                    markComplete: safeBind(choresInstance, 'markComplete'),
                    completeSubtask: safeBind(choresInstance, 'completeSubtask'),
                    resetCompletion: safeBind(choresInstance, 'resetCompletion')
                },
                users: {
                    getAll: safeBind(usersInstance, 'getAll'),
                    add: safeBind(usersInstance, 'add'),
                    update: safeBind(usersInstance, 'update'),
                    delete: safeBind(usersInstance, 'delete')
                },
                theme: {
                    get: safeBind(themeInstance, 'get'),
                    save: safeBind(themeInstance, 'save'),
                    reset: safeBind(themeInstance, 'reset')
                },
                getSensorState: safeBind(baseInstance, 'getSensorState'),
                initialize: async function() {
                    console.log('✅ API initialized');
                    return true;
                }
            };
            
            // Replace global API
            window.ChoresAPI = { ...api, BaseAPI, ChoresAPI: ChoresAPIClass, UsersAPI, ThemeAPI, ENDPOINTS };
            
            console.log('✅ ChoresAPI ready');
            window.dispatchEvent(new CustomEvent('chores-api-ready'));
            
        } catch (error) {
            console.error('API init error:', error);
            
            // Minimal fallback
            window.ChoresAPI = {
                ...window.ChoresAPI,
                getSensorState: async () => ({ attributes: { chores: [], assignees: [] } }),
                chores: { getAll: async () => [] },
                users: { getAll: async () => [] },
                theme: { get: async () => ({}), save: async () => {} },
                initialize: async () => false
            };
            
            window.dispatchEvent(new CustomEvent('chores-api-ready', { detail: { fallback: true } }));
        }
    }
    
    initializeAPI();
})();