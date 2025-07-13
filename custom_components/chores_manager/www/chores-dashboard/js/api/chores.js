/**
 * Chores API functionality.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
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
            normalizedData.frequency_days = Number(normalizedData.frequency_days) || 7;
            normalizedData.frequency_times = Number(normalizedData.frequency_times) || 1;
            normalizedData.assigned_to = normalizedData.assigned_to || 'Wie kan';
            normalizedData.priority = normalizedData.priority || 'Middel';
            normalizedData.duration = Number(normalizedData.duration) || 15;
            
            // Convert numeric fields
            ['frequency_days', 'frequency_times', 'duration', 'weekday', 'monthday', 'startMonth', 'startDay'].forEach(field => {
                if (normalizedData[field] !== undefined) {
                    normalizedData[field] = Number(normalizedData[field]);
                }
            });
            
            // Convert boolean fields
            ['use_alternating', 'notify_when_due', 'has_subtasks'].forEach(field => {
                if (normalizedData[field] !== undefined) {
                    normalizedData[field] = Boolean(normalizedData[field]);
                }
            });
            
            // Handle subtasks
            if (normalizedData.has_subtasks && normalizedData.subtasks) {
                // Ensure subtasks is an array
                if (!Array.isArray(normalizedData.subtasks)) {
                    normalizedData.subtasks = [];
                }
                
                // Filter out empty subtasks
                normalizedData.subtasks = normalizedData.subtasks
                    .filter(st => st && st.name && st.name.trim())
                    .map(st => ({
                        name: st.name.trim(),
                        completed: st.completed || false
                    }));
            } else {
                normalizedData.subtasks = [];
            }
            
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.ADD_CHORE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.ADD_CHORE,
                normalizedData
            );
        }
        
        /**
         * Mark a chore as done
         */
        async markDone(choreId, person) {
            if (!choreId || !person) {
                throw new Error('Both choreId and person are required');
            }
            
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.MARK_DONE) {
                throw new Error('API endpoints not properly initialized');
            }
            
            return await this.callService(
                endpoints.MARK_DONE,
                {
                    chore_id: choreId,
                    person: person
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
                    description: description || ''
                }
            );
        }
        
        /**
         * Reset chore completion
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
            
            return await this.callService(
                endpoints.FORCE_DUE,
                data
            );
        }
        
        /**
         * Complete subtasks
         */
        async completeSubtasks(choreId, subtaskIds, person) {
            if (!choreId || !subtaskIds || !Array.isArray(subtaskIds) || !person) {
                throw new Error('Invalid parameters for subtask completion');
            }
            
            const endpoints = window.ChoresAPI.ENDPOINTS;
            if (!endpoints || !endpoints.COMPLETE_SUBTASK) {
                throw new Error('API endpoints not properly initialized');
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
})();