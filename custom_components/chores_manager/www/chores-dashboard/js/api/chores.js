// Chores Dashboard API Module - Chore Services
// Manages all chore-related operations (add, update, delete, complete)
// Version: 1.4.1-20250415-flickerfix

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
         * Ensures all required fields are present according to backend schema
         */
        async addChore(choreData) {
            // Log incoming data for debugging
            console.log('ChoresAPI.addChore called with:', choreData);
            
            // Generate chore_id if not provided
            if (!choreData.chore_id && !choreData.id) {
                // Generate ID from name if available
                if (choreData.name) {
                    choreData.chore_id = choreData.name.toLowerCase()
                        .replace(/[^a-z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_|_$/g, '');
                } else {
                    choreData.chore_id = 'chore_' + Date.now();
                }
            }
            
            // Build the data object with only the fields expected by the backend
            const serviceData = {
                chore_id: choreData.chore_id || choreData.id
            };
            
            // Add optional fields only if they are provided
            if (choreData.name !== undefined) {
                serviceData.name = choreData.name;
            }
            
            if (choreData.frequency_type !== undefined) {
                serviceData.frequency_type = choreData.frequency_type;
            }
            
            if (choreData.assigned_to !== undefined) {
                serviceData.assigned_to = choreData.assigned_to;
            }
            
            if (choreData.priority !== undefined) {
                serviceData.priority = choreData.priority;
            }
            
            if (choreData.duration !== undefined) {
                const duration = parseInt(choreData.duration);
                serviceData.duration = isNaN(duration) ? 15 : duration;
            }
            
            if (choreData.description !== undefined) {
                serviceData.description = choreData.description;
            }
            
            if (choreData.icon !== undefined) {
                serviceData.icon = choreData.icon;
            }
            
            if (choreData.notify_when_due !== undefined) {
                serviceData.notify_when_due = Boolean(choreData.notify_when_due);
            }
            
            // Handle frequency-specific fields
            // The backend requires these values even if the frontend leaves them blank
            if (choreData.frequency_days !== undefined) {
                const days = parseInt(choreData.frequency_days);
                serviceData.frequency_days = isNaN(days) ? 7 : days;
            } else {
                serviceData.frequency_days = 7;
            }

            if (choreData.frequency_times !== undefined) {
                const times = parseInt(choreData.frequency_times);
                serviceData.frequency_times = isNaN(times) ? 1 : times;
            } else {
                serviceData.frequency_times = 1;
            }
            
            if (choreData.selected_weekday !== undefined) {
                serviceData.selected_weekday = choreData.selected_weekday;
            }
            
            if (choreData.selected_weekdays !== undefined) {
                serviceData.selected_weekdays = choreData.selected_weekdays;
            }
            
            if (choreData.selected_day_of_month !== undefined) {
                const dom = parseInt(choreData.selected_day_of_month);
                if (!isNaN(dom)) {
                    serviceData.selected_day_of_month = dom;
                }
            }

            if (choreData.selected_days_of_month !== undefined) {
                serviceData.selected_days_of_month = (choreData.selected_days_of_month || [])
                    .map(d => parseInt(d))
                    .filter(d => !isNaN(d));
            }
            
            // Handle alternating assignment
            if (choreData.use_alternating !== undefined) {
                serviceData.use_alternating = Boolean(choreData.use_alternating);
            }
            
            if (choreData.alternate_with !== undefined) {
                serviceData.alternate_with = choreData.alternate_with;
            }
            
            // Handle date fields
            if (choreData.start_date !== undefined) {
                serviceData.start_date = choreData.start_date;
            }
            
            if (choreData.end_date !== undefined) {
                serviceData.end_date = choreData.end_date;
            }
            
            console.log('Sending to service:', serviceData);
            
            // Ensure ENDPOINTS are available
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.ADD_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            try {
                const result = await this.callService(endpoints.ADD_CHORE, serviceData);
                console.log('Chore added successfully:', result);
                return result;
            } catch (error) {
                console.error('Failed to add chore:', error);
                // Add more context to the error
                if (error.message.includes('400')) {
                    console.error('Bad Request - Check that all required fields are provided:', serviceData);
                    throw new Error(`Failed to add chore: Missing required fields or invalid data. ${error.message}`);
                }
                throw error;
            }
        }
        
        /**
         * Mark a chore as done
         * Using 'person' parameter to match backend schema
         */
        async markDone(choreId, completedBy) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.MARK_DONE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            console.log('Marking chore done:', choreId, 'by', completedBy);
            
            return await this.callService(
                endpoints.MARK_DONE,
                {
                    chore_id: choreId,
                    person: completedBy  // Matches backend schema
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
         * Reset a chore's completion status
         */
        async resetChore(choreId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.RESET_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            console.log('Resetting chore:', choreId);
            
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
            
            console.log('Deleting chore:', choreId);
            
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
            
            const data = { 
                chore_id: choreId, 
                notify: notify 
            };
            
            if (message) {
                data.message = message;
            }
            
            console.log('Forcing chore due:', choreId);
            
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
            
            console.log('Completing subtask:', subtaskId, 'by', completedBy);
            
            return await this.callService(
                endpoints.COMPLETE_SUBTASK,
                {
                    subtask_id: parseInt(subtaskId),
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
            
            console.log('Adding subtask to chore:', choreId, name);
            
            return await this.callService(
                endpoints.ADD_SUBTASK,
                {
                    chore_id: choreId,
                    name: name,
                    position: parseInt(position)
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
            
            console.log('Deleting subtask:', subtaskId);
            
            return await this.callService(
                endpoints.DELETE_SUBTASK,
                { subtask_id: parseInt(subtaskId) }
            );
        }
        
        /**
         * Helper method to validate chore data
         */
        validateChoreData(choreData) {
            const errors = [];
            
            if (!choreData.chore_id && !choreData.id) {
                if (!choreData.name) {
                    errors.push('Either chore_id or name is required');
                }
            }
            
            // Add more validation as needed based on backend requirements
            
            if (errors.length > 0) {
                throw new Error(`Validation failed: ${errors.join(', ')}`);
            }
            
            return true;
        }
    }
    
    // Export to window
    window.ChoresAPI.ChoresAPI = ChoresAPI;
    
    console.log('ChoresAPI.ChoresAPI loaded successfully');
})();