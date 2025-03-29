// Theme integration with Home Assistant
(function() {
    // Function to get theme variables from parent window
    function getHAThemeVariables() {
        try {
            // Try to access the parent window (Home Assistant)
            if (window.parent && window.parent.document) {
                // Get computed styles to extract theme variables
                const styles = window.getComputedStyle(window.parent.document.body);
                
                return {
                    // Primary colors
                    primaryColor: styles.getPropertyValue('--primary-color').trim(),
                    primaryBackground: styles.getPropertyValue('--primary-background-color').trim(),
                    secondaryBackground: styles.getPropertyValue('--card-background-color').trim(),
                    
                    // Text colors
                    primaryText: styles.getPropertyValue('--primary-text-color').trim(),
                    secondaryText: styles.getPropertyValue('--secondary-text-color').trim(),
                    
                    // Card and UI styles
                    cardBorderRadius: styles.getPropertyValue('--ha-card-border-radius') || '4px',
                    boxShadow: styles.getPropertyValue('--ha-card-box-shadow') || 'none',
                    
                    // Is this a dark theme?
                    isDark: window.parent.document.body.classList.contains('themable') && 
                           (window.parent.document.querySelector('html').getAttribute('data-theme') || '').includes('dark')
                };
            }
        } catch (e) {
            console.warn('Could not access Home Assistant theme variables:', e);
        }
        
        // Fallback to light theme
        return {
            primaryColor: '#03a9f4',
            primaryBackground: '#f5f5f5',
            secondaryBackground: '#ffffff',
            primaryText: '#212121',
            secondaryText: '#727272',
            cardBorderRadius: '4px',
            boxShadow: '0 2px 2px 0 rgba(0,0,0,0.14)',
            isDark: false
        };
    }
    
    // Apply theme to document
    function applyTheme() {
        const theme = getHAThemeVariables();
        const root = document.documentElement;
        
        // Set CSS variables
        root.style.setProperty('--chores-primary-color', theme.primaryColor);
        root.style.setProperty('--chores-primary-background', theme.primaryBackground);
        root.style.setProperty('--chores-secondary-background', theme.secondaryBackground);
        root.style.setProperty('--chores-primary-text', theme.primaryText);
        root.style.setProperty('--chores-secondary-text', theme.secondaryText);
        root.style.setProperty('--chores-card-radius', theme.cardBorderRadius);
        root.style.setProperty('--chores-box-shadow', theme.boxShadow);
        
        // Apply background to body
        document.body.style.backgroundColor = theme.primaryBackground;
        document.body.style.color = theme.primaryText;
        
        // Apply theme class to body
        if (theme.isDark) {
            document.body.classList.add('ha-dark-theme');
            document.body.classList.remove('ha-light-theme');
        } else {
            document.body.classList.add('ha-light-theme');
            document.body.classList.remove('ha-dark-theme');
        }
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