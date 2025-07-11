"""Chores API functionality."""

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
            // Normalize the data for API
            const normalizedData = {
                chore_id: choreData.chore_id,
            };
            
            // Only include fields that are present
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
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.ADD_CHORE,
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
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.MARK_DONE,
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
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.UPDATE_DESCRIPTION,
                {
                    chore_id: choreId,
                    description: description
                }
            );
        }
        
        /**
         * Reset chore completion
         */
        async resetChore(choreId) {
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.RESET_CHORE,
                {
                    chore_id: choreId
                }
            );
        }
        
        /**
         * Delete a chore
         */
        async deleteChore(choreId) {
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.DELETE_CHORE,
                {
                    chore_id: choreId
                }
            );
        }
        
        /**
         * Force a chore to be due today
         */
        async forceDue(choreId, notify = false, message = null) {
            const data = {
                chore_id: choreId,
                notify: notify
            };
            
            if (message) {
                data.message = message;
            }
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.FORCE_DUE,
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
            
            const results = {
                successful: [],
                failed: []
            };
            
            // Process each subtask
            for (const subtaskId of subtaskIds) {
                try {
                    await this.callService(
                        window.ChoresAPI.ENDPOINTS.COMPLETE_SUBTASK,
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
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.ADD_SUBTASK,
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
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.DELETE_SUBTASK,
                {
                    subtask_id: subtaskId
                }
            );
        }
    }
    
    // Export
    window.ChoresAPI.ChoresAPI = ChoresAPI;
})();