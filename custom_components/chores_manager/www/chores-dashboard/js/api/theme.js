/**
 * COMPLETELY FIXED Theme API for the Chores Manager
 * Fixes the missing theme.get() method and adds comprehensive theme management
 */

window.ChoresAPI = window.ChoresAPI || {};

(function() {
    'use strict';

    class ThemeAPI {
        constructor() {
            this.baseAPI = null;
            this.defaultTheme = {
                backgroundColor: '#ffffff',
                cardColor: '#f8fafc',
                primaryTextColor: '#1f2937',
                secondaryTextColor: '#6b7280',
                accentColor: '#3b82f6',
                borderColor: '#e5e7eb',
                successColor: '#10b981',
                warningColor: '#f59e0b',
                errorColor: '#ef4444'
            };
        }

        /**
         * Initialize with base API instance
         */
        setBaseAPI(baseAPI) {
            this.baseAPI = baseAPI;
        }

        /**
         * FIXED: Get theme settings from sensor state
         */
        async get() {
            try {
                console.log('🎨 Getting theme settings...');
                
                // Try to get from sensor state first
                if (this.baseAPI && typeof this.baseAPI.getSensorState === 'function') {
                    const sensorState = await this.baseAPI.getSensorState();
                    if (sensorState?.attributes?.theme_settings) {
                        console.log('✅ Theme loaded from sensor state');
                        return {
                            ...this.defaultTheme,
                            ...sensorState.attributes.theme_settings
                        };
                    }
                }

                // Fallback to direct API call
                if (this.baseAPI && typeof this.baseAPI.get === 'function') {
                    const response = await this.baseAPI.get('/theme');
                    if (response?.theme_settings) {
                        console.log('✅ Theme loaded from API');
                        return {
                            ...this.defaultTheme,
                            ...response.theme_settings
                        };
                    }
                }

                // Try localStorage as fallback
                const savedTheme = localStorage.getItem('chores_theme');
                if (savedTheme) {
                    try {
                        const parsed = JSON.parse(savedTheme);
                        console.log('✅ Theme loaded from localStorage');
                        return {
                            ...this.defaultTheme,
                            ...parsed
                        };
                    } catch (e) {
                        console.warn('Failed to parse saved theme from localStorage');
                    }
                }

                console.log('ℹ️ Using default theme');
                return this.defaultTheme;

            } catch (error) {
                console.error('❌ Error getting theme:', error);
                return this.defaultTheme;
            }
        }

        /**
         * FIXED: Save theme settings with multiple persistence methods
         */
        async save(themeSettings) {
            try {
                console.log('🎨 Saving theme settings:', themeSettings);

                const themeToSave = {
                    ...this.defaultTheme,
                    ...themeSettings
                };

                let success = false;

                // Try to save via API
                if (this.baseAPI && typeof this.baseAPI.post === 'function') {
                    try {
                        await this.baseAPI.post('/theme', { theme_settings: themeToSave });
                        console.log('✅ Theme saved via API');
                        success = true;
                    } catch (apiError) {
                        console.warn('⚠️ Failed to save theme via API:', apiError);
                    }
                }

                // Save to localStorage as backup
                try {
                    localStorage.setItem('chores_theme', JSON.stringify(themeToSave));
                    console.log('✅ Theme saved to localStorage');
                    success = true;
                } catch (storageError) {
                    console.warn('⚠️ Failed to save theme to localStorage:', storageError);
                }

                if (!success) {
                    throw new Error('Failed to save theme settings');
                }

                // Apply theme immediately
                this.applyTheme(themeToSave);

                return themeToSave;

            } catch (error) {
                console.error('❌ Error saving theme:', error);
                throw error;
            }
        }

        /**
         * FIXED: Reset theme to defaults
         */
        async reset() {
            try {
                console.log('🎨 Resetting theme to defaults');

                // Save default theme
                await this.save(this.defaultTheme);

                // Clear localStorage
                try {
                    localStorage.removeItem('chores_theme');
                } catch (e) {
                    console.warn('Failed to clear theme from localStorage');
                }

                console.log('✅ Theme reset to defaults');
                return this.defaultTheme;

            } catch (error) {
                console.error('❌ Error resetting theme:', error);
                throw error;
            }
        }

        /**
         * Apply theme to the DOM
         */
        applyTheme(theme) {
            try {
                const root = document.documentElement;
                
                // Apply CSS custom properties
                root.style.setProperty('--theme-background', theme.backgroundColor);
                root.style.setProperty('--theme-card', theme.cardColor);
                root.style.setProperty('--theme-primary-text', theme.primaryTextColor);
                root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor);
                root.style.setProperty('--theme-accent', theme.accentColor);
                root.style.setProperty('--theme-border', theme.borderColor);
                root.style.setProperty('--theme-success', theme.successColor);
                root.style.setProperty('--theme-warning', theme.warningColor);
                root.style.setProperty('--theme-error', theme.errorColor);

                // Apply to body for immediate effect
                document.body.style.backgroundColor = theme.backgroundColor;
                document.body.style.color = theme.primaryTextColor;

                console.log('✅ Theme applied to DOM');

            } catch (error) {
                console.error('❌ Error applying theme:', error);
            }
        }

        /**
         * Get current theme from DOM
         */
        getCurrentTheme() {
            try {
                const root = document.documentElement;
                const style = getComputedStyle(root);

                return {
                    backgroundColor: style.getPropertyValue('--theme-background') || this.defaultTheme.backgroundColor,
                    cardColor: style.getPropertyValue('--theme-card') || this.defaultTheme.cardColor,
                    primaryTextColor: style.getPropertyValue('--theme-primary-text') || this.defaultTheme.primaryTextColor,
                    secondaryTextColor: style.getPropertyValue('--theme-secondary-text') || this.defaultTheme.secondaryTextColor,
                    accentColor: style.getPropertyValue('--theme-accent') || this.defaultTheme.accentColor,
                    borderColor: style.getPropertyValue('--theme-border') || this.defaultTheme.borderColor,
                    successColor: style.getPropertyValue('--theme-success') || this.defaultTheme.successColor,
                    warningColor: style.getPropertyValue('--theme-warning') || this.defaultTheme.warningColor,
                    errorColor: style.getPropertyValue('--theme-error') || this.defaultTheme.errorColor
                };
            } catch (error) {
                console.error('Error getting current theme:', error);
                return this.defaultTheme;
            }
        }

        /**
         * Validate theme settings
         */
        validateTheme(theme) {
            const isValidColor = (color) => {
                return typeof color === 'string' && (
                    color.startsWith('#') || 
                    color.startsWith('rgb') || 
                    color.startsWith('hsl') ||
                    ['transparent', 'inherit', 'initial', 'unset'].includes(color)
                );
            };

            const errors = [];

            if (theme.backgroundColor && !isValidColor(theme.backgroundColor)) {
                errors.push('Invalid backgroundColor');
            }
            if (theme.cardColor && !isValidColor(theme.cardColor)) {
                errors.push('Invalid cardColor');
            }
            if (theme.primaryTextColor && !isValidColor(theme.primaryTextColor)) {
                errors.push('Invalid primaryTextColor');
            }
            if (theme.secondaryTextColor && !isValidColor(theme.secondaryTextColor)) {
                errors.push('Invalid secondaryTextColor');
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        }

        /**
         * Get available theme presets
         */
        getPresets() {
            return {
                light: {
                    name: 'Light',
                    backgroundColor: '#ffffff',
                    cardColor: '#f8fafc',
                    primaryTextColor: '#1f2937',
                    secondaryTextColor: '#6b7280',
                    accentColor: '#3b82f6',
                    borderColor: '#e5e7eb',
                    successColor: '#10b981',
                    warningColor: '#f59e0b',
                    errorColor: '#ef4444'
                },
                dark: {
                    name: 'Dark',
                    backgroundColor: '#111827',
                    cardColor: '#1f2937',
                    primaryTextColor: '#f9fafb',
                    secondaryTextColor: '#d1d5db',
                    accentColor: '#60a5fa',
                    borderColor: '#374151',
                    successColor: '#34d399',
                    warningColor: '#fbbf24',
                    errorColor: '#f87171'
                },
                blue: {
                    name: 'Blue',
                    backgroundColor: '#eff6ff',
                    cardColor: '#dbeafe',
                    primaryTextColor: '#1e40af',
                    secondaryTextColor: '#3730a3',
                    accentColor: '#2563eb',
                    borderColor: '#93c5fd',
                    successColor: '#059669',
                    warningColor: '#d97706',
                    errorColor: '#dc2626'
                },
                green: {
                    name: 'Green',
                    backgroundColor: '#f0fdf4',
                    cardColor: '#dcfce7',
                    primaryTextColor: '#14532d',
                    secondaryTextColor: '#166534',
                    accentColor: '#16a34a',
                    borderColor: '#86efac',
                    successColor: '#22c55e',
                    warningColor: '#ea580c',
                    errorColor: '#dc2626'
                }
            };
        }

        /**
         * Apply preset theme
         */
        async applyPreset(presetName) {
            const presets = this.getPresets();
            const preset = presets[presetName];
            
            if (!preset) {
                throw new Error(`Unknown preset: ${presetName}`);
            }

            return await this.save(preset);
        }
    }

    // Export the class
    window.ChoresAPI.ThemeAPI = ThemeAPI;

    console.log('✅ FIXED ThemeAPI class loaded successfully');
})();