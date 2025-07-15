/**
 * Chores API functionality.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    // Wait for BaseAPI to be available
    if (!window.ChoresAPI.BaseAPI) {
        console.error('ChoresAPI.BaseAPI not found. Make sure base.js is loaded first.');
        // Set a flag to indicate this module failed to load
        window.ChoresAPI._choresAPIError = 'BaseAPI not available';
        return;
    }
    
    class ChoresAPI extends window.ChoresAPI.BaseAPI {
        constructor() {
            super();
        }
        
        /**
         * Add or update a chore
         */
        async addChore(choreData) {
            // Ensure chore_id is set for updates
            if (!choreData.chore_id && choreData.id) {
                choreData.chore_id = choreData.id;
            }
            
            // For new chores, generate a unique ID if not provided
            if (!choreData.chore_id) {
                choreData.chore_id = `chore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            // Normalize the data for API
            const normalizedData = {
                chore_id: choreData.chore_id,
            };
            
            // Only include fields that are present and not undefined
            const fields = [
                'name', 'frequency_type', 'frequency_days', 'frequency_times',
                'assigned_to', 'priority', 'duration', 'icon', 'description',
                'alternate_with', 'use_alternating', 'notify_when_due',
                'weekday', 'monthday', 'startMonth', 'startDay',
                'active_days', 'active_monthdays', 'has_subtasks', 'subtasks',
                'subtasks_completion_type', 'subtasks_streak_type', 'subtasks_period'
            ];
            
            fields.forEach(field => {
                if (choreData[field] !== undefined) {
                    normalizedData[field] = choreData[field];
                }
            });
            
            // Set defaults for required fields if not present
            normalizedData.name = normalizedData.name || 'Unnamed Task';
            normalizedData.frequency_type = normalizedData.frequency_type || 'Wekelijks';
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
                    completed_by: completedBy
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
                {
                    chore_id: choreId
                }
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
                {
                    chore_id: choreId
                }
            );
        }
        
        /**
         * Force chore to be due
         */
        async forceDue(choreId) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.FORCE_DUE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.FORCE_DUE,
                {
                    chore_id: choreId
                }
            );
        }
        
        /**
         * Complete subtasks
         */
        async completeSubtasks(subtaskIds, person) {
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.COMPLETE_SUBTASK) {
                throw new Error('API endpoints not properly initialized');
            }
            
            // Handle both single subtask and array
            if (!Array.isArray(subtaskIds)) {
                subtaskIds = [subtaskIds];
            }
            
            const results = {
                successful: [],
                failed: []
            };
            
            // Process each subtask
            for (const subtaskId of subtaskIds) {
                try {
                    await this.callService(
                        endpoints.COMPLETE_SUBTASK,
                        {
                            subtask_id: subtaskId,
                            person: person
                        }
                    );
                    results.successful.push(subtaskId);
                } catch (error) {
                    console.error(`Failed to complete subtask ${subtaskId}:`, error);
                    results.failed.push({ id: subtaskId, error: error.message });
                }
            }
            
            return results;
        }
        
        /**
         * Add a subtask
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
                {
                    subtask_id: subtaskId
                }
            );
        }
    }
    
    // Export
    window.ChoresAPI.ChoresAPI = ChoresAPI;
    console.log('ChoresAPI.ChoresAPI loaded successfully');
})();