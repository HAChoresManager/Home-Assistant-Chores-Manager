// Chores Dashboard API Module - Chore Services
// Manages all chore-related operations (add, update, delete, complete)
// Part of the modular architecture - depends on base.js

(function(window) {
    'use strict';
    
    // Ensure dependencies are loaded
    if (!window.ChoresAPI || !window.ChoresAPI.BaseAPI) {
        console.error('ChoresAPI: base.js must be loaded before chores.js');
        return;
    }
    
    /**
     * ChoresAPI - Handles all chore-related operations
     * Extends BaseAPI for common functionality
     */
    class ChoresAPI extends window.ChoresAPI.BaseAPI {
        constructor() {
            super();
            console.log('ChoresAPI: Initializing chore services');
            
            // Verify endpoints are available
            if (!window.ChoresAPI.ENDPOINTS) {
                throw new Error('ChoresAPI: ENDPOINTS not available');
            }
            
            this.ENDPOINTS = window.ChoresAPI.ENDPOINTS;
        }
        
        /**
         * Add or update a chore
         */
        async addChore(choreData) {
            // Normalize chore data structure
            const normalizedData = {
                chore_id: choreData.chore_id || choreData.id,
                name: choreData.name,
                frequency_type: choreData.frequency_type || 'Wekelijks',
                frequency_days: choreData.frequency_days || choreData.frequency || 7,
                assigned_to: choreData.assigned_to || 'Wie kan',
                priority: choreData.priority || 'Middel',
                duration: choreData.duration || 15,
                description: choreData.description || '',
                icon: choreData.icon || null,
                use_alternating: choreData.use_alternating || false,
                alternate_with: choreData.alternate_with || '',
                notify_when_due: choreData.notify_when_due || false
            };
            
            // Handle weekly day selection
            if (choreData.selected_weekday !== undefined) {
                normalizedData.selected_weekday = choreData.selected_weekday;
            }
            
            // Handle monthly day selection
            if (choreData.selected_day_of_month !== undefined) {
                normalizedData.selected_day_of_month = choreData.selected_day_of_month;
            }
            
            // Handle multiple days per week
            if (choreData.selected_weekdays) {
                normalizedData.selected_weekdays = choreData.selected_weekdays;
            }
            
            // Handle multiple days per month
            if (choreData.selected_days_of_month) {
                normalizedData.selected_days_of_month = choreData.selected_days_of_month;
            }
            
            // Ensure frequency_days is set
            normalizedData.frequency_days = normalizedData.frequency_days || 7;
            
            // Handle date fields conversion
            if (choreData.start_date) {
                normalizedData.start_date = choreData.start_date;
            }
            if (choreData.end_date) {
                normalizedData.end_date = choreData.end_date;
            }
            
            // Ensure ENDPOINTS are available
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.ADD_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(endpoints.ADD_CHORE, normalizedData);
        }
        
        /**
         * Mark a chore as done
         * FIXED: Using 'person' parameter to match backend
         */
        async markDone(choreId, completedBy) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.MARK_DONE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.MARK_DONE,
                {
                    chore_id: choreId,
                    person: completedBy  // FIXED: Was 'completed_by', now 'person'
                }
            );
        }
        
        /**
         * Update chore description
         */
        async updateDescription(choreId, description) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.UPDATE_DESCRIPTION) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.UPDATE_DESCRIPTION,
                {
                    chore_id: choreId,
                    description: description
                }
            );
        }
        
        /**
         * Reset a chore
         */
        async resetChore(choreId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.RESET_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.RESET_CHORE,
                { chore_id: choreId }
            );
        }
        
        /**
         * Delete a chore
         */
        async deleteChore(choreId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.DELETE_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.DELETE_CHORE,
                { chore_id: choreId }
            );
        }
        
        /**
         * Force a chore to be due today
         */
        async forceDue(choreId, notify = false, message = null) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.FORCE_DUE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            const data = { chore_id: choreId, notify: notify };
            if (message) {
                data.message = message;
            }
            
            return await this.callService(endpoints.FORCE_DUE, data);
        }
        
        /**
         * Complete a subtask
         * Using 'person' parameter to match backend
         */
        async completeSubtask(subtaskId, completedBy) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.COMPLETE_SUBTASK) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.COMPLETE_SUBTASK,
                {
                    subtask_id: subtaskId,
                    person: completedBy  // Matches backend expectation
                }
            );
        }
        
        /**
         * Add a subtask to a chore
         */
        async addSubtask(choreId, name, position = 0) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.ADD_SUBTASK) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.ADD_SUBTASK,
                {
                    chore_id: choreId,
                    name: name,
                    position: position
                }
            );
        }
        
        /**
         * Delete a subtask
         */
        async deleteSubtask(subtaskId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.DELETE_SUBTASK) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.DELETE_SUBTASK,
                { subtask_id: subtaskId }
            );
        }
        
        /**
         * Add a user
         */
        async addUser(userId, name, color = null, avatar = null) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.ADD_USER) {
                throw new Error('API endpoints not properly initialized');
            }
            
            const data = { id: userId, name: name };
            if (color) data.color = color;
            if (avatar) data.avatar = avatar;
            
            return await this.callService(endpoints.ADD_USER, data);
        }
        
        /**
         * Delete a user
         */
        async deleteUser(userId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.DELETE_USER) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.DELETE_USER,
                { user_id: userId }
            );
        }
        
        /**
         * Get Home Assistant users
         */
        async getHAUsers() {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.GET_HA_USERS) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(endpoints.GET_HA_USERS, {});
        }
        
        /**
         * Save theme settings
         */
        async saveTheme(primaryColor, accentColor = null) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.SAVE_THEME) {
                throw new Error('API endpoints not properly initialized');
            }
            
            const data = { primary_color: primaryColor };
            if (accentColor) {
                data.accent_color = accentColor;
            }
            
            return await this.callService(endpoints.SAVE_THEME, data);
        }
    }
    
    // Create and expose the ChoresAPI instance
    const instance = new ChoresAPI();
    
    // Ensure the ChoresAPI namespace exists
    if (!window.ChoresAPI) {
        window.ChoresAPI = {};
    }
    
    // Store the instance
    window.ChoresAPI.chores = instance;
    
    // Also expose the class if needed
    window.ChoresAPI.ChoresAPI = ChoresAPI;
    
    console.log('ChoresAPI.ChoresAPI loaded successfully');
    
})(window);