/**
 * Theme API functionality.
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    class ThemeAPI extends window.ChoresAPI.BaseAPI {
        constructor() {
            super();
        }
        
        /**
         * Get current theme settings
         * Returns theme settings or null if not set
         */
        async get() {
            try {
                // Try to get theme from sensor state
                const sensorState = await this.getSensorState();
                
                if (sensorState && sensorState.attributes && sensorState.attributes.theme_settings) {
                    return sensorState.attributes.theme_settings;
                }
                
                // Return default theme if no settings found
                return {
                    backgroundColor: '#f3f4f6',
                    cardColor: '#ffffff',
                    primaryTextColor: '#1f2937',
                    secondaryTextColor: '#6b7280'
                };
            } catch (error) {
                console.error('Failed to get theme settings:', error);
                // Return default theme on error
                return {
                    backgroundColor: '#f3f4f6',
                    cardColor: '#ffffff',
                    primaryTextColor: '#1f2937',
                    secondaryTextColor: '#6b7280'
                };
            }
        }
        
        /**
         * Save theme settings
         * @param {Object} themeData - Theme configuration object
         * @param {string} themeData.backgroundColor - Background color hex
         * @param {string} themeData.cardColor - Card background color hex
         * @param {string} themeData.primaryTextColor - Primary text color hex
         * @param {string} themeData.secondaryTextColor - Secondary text color hex
         */
        async save(themeData) {
            // Validate required fields
            const required = ['backgroundColor', 'cardColor', 'primaryTextColor', 'secondaryTextColor'];
            const missing = required.filter(field => !themeData[field]);
            
            if (missing.length > 0) {
                throw new Error(`Missing required theme fields: ${missing.join(', ')}`);
            }
            
            // Validate color formats
            const colorRegex = /^#[0-9A-Fa-f]{6}$/;
            for (const field of required) {
                if (!colorRegex.test(themeData[field])) {
                    throw new Error(`Invalid color format for ${field}: ${themeData[field]}`);
                }
            }
            
            return await this.callService(
                window.ChoresAPI.ENDPOINTS.SAVE_THEME,
                themeData
            );
        }
        
        /**
         * Reset theme to defaults
         */
        async reset() {
            const defaultTheme = {
                backgroundColor: '#f3f4f6',
                cardColor: '#ffffff',
                primaryTextColor: '#1f2937',
                secondaryTextColor: '#6b7280'
            };
            
            return await this.save(defaultTheme);
        }
    }
    
    // Export
    window.ChoresAPI.ThemeAPI = ThemeAPI;
})();