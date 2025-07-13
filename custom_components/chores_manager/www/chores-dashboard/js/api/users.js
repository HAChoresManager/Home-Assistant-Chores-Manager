/**
 * Users API functionality.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    class UsersAPI extends window.ChoresAPI.BaseAPI {
        constructor() {
            super();
        }
        
        /**
         * Add or update a user
         */
        async addUser(userData) {
            if (!userData.id || !userData.name) {
                throw new Error('User must have both id and name');
            }
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.ADD_USER,
                userData
            );
        }
        
        /**
         * Delete a user
         */
        async deleteUser(userId) {
            if (!userId) {
                throw new Error('User ID is required');
            }
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.DELETE_USER,
                {
                    user_id: userId
                }
            );
        }
        
        /**
         * Get Home Assistant users
         */
        async getHAUsers() {
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.GET_HA_USERS
            );
        }
    }
    
    // Export
    window.ChoresAPI.UsersAPI = UsersAPI;
})();