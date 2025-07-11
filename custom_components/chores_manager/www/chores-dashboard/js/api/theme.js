"""Theme API functionality."""

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';
    
    class ThemeAPI extends window.ChoresAPI.BaseAPI {
        constructor() {
            super();
        }
        
        /**
         * Save theme settings
         */
        async saveTheme(themeData) {
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
    }
    
    // Export
    window.ChoresAPI.ThemeAPI = ThemeAPI;
})();