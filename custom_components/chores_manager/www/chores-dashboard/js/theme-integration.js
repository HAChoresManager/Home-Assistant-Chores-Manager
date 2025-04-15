// Theme integration with Home Assistant
(function() {
    // Function to get theme variables from parent window
    function getHAThemeVariables() {
        try {
            // Try to access the parent window (Home Assistant)
            if (window.parent && window.parent.document) {
                // Get computed styles to extract theme variables
                const styles = window.getComputedStyle(window.parent.document.body);
                const backgroundColor = styles.getPropertyValue('background-color');
                
                return {
                    // Primary colors
                    primaryColor: styles.getPropertyValue('--primary-color').trim() || '#03a9f4',
                    backgroundColor: backgroundColor || '#f5f7f9',
                    
                    // Text colors
                    primaryText: styles.getPropertyValue('--primary-text-color').trim() || '#212121',
                    secondaryText: styles.getPropertyValue('--secondary-text-color').trim() || '#727272',
                    
                    // Card and UI styles
                    cardBorderRadius: styles.getPropertyValue('--ha-card-border-radius') || '0.5rem',
                    boxShadow: styles.getPropertyValue('--ha-card-box-shadow') || '0 2px 4px rgba(0, 0, 0, 0.1)'
                };
            }
        } catch (e) {
            console.warn('Could not access Home Assistant theme variables:', e);
        }
        
        // Fallback to light theme
        return {
            primaryColor: '#03a9f4',
            backgroundColor: '#f5f7f9',
            primaryText: '#212121',
            secondaryText: '#727272',
            cardBorderRadius: '0.5rem',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        };
    }
    
    // Apply theme to document - simplified version without dark mode detection
    function applyTheme() {
        // Just get theme variables, but don't apply any automatic theme classes
        const theme = getHAThemeVariables();
        const root = document.documentElement;
        
        // Remove any theme classes that might have been applied previously
        document.body.classList.remove('ha-dark-theme', 'ha-light-theme', 'ha-theme-green');
    }
    
    // Check for theme changes periodically
    function setupThemeChecker() {
        // Apply theme immediately
        applyTheme();
        
        // Then check periodically for changes
        setInterval(applyTheme, 2000);
        
        // Also check when window gets focus
        window.addEventListener('focus', applyTheme);
    }
    
    // Initialize when document is ready
    document.addEventListener('DOMContentLoaded', setupThemeChecker);
    
    // Expose theme utilities
    window.choreTheme = {
        getTheme: getHAThemeVariables,
        applyTheme: applyTheme
    };
})();