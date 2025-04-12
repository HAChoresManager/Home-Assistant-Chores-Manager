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
                
                // Detect if it's a green theme
                const isGreenTheme = detectGreenTheme(backgroundColor);
                
                return {
                    // Primary colors
                    primaryColor: styles.getPropertyValue('--primary-color').trim() || '#03a9f4',
                    backgroundColor: backgroundColor || '#f5f7f9',
                    
                    // Text colors
                    primaryText: styles.getPropertyValue('--primary-text-color').trim() || '#212121',
                    secondaryText: styles.getPropertyValue('--secondary-text-color').trim() || '#727272',
                    
                    // Card and UI styles
                    cardBorderRadius: styles.getPropertyValue('--ha-card-border-radius') || '0.5rem',
                    boxShadow: styles.getPropertyValue('--ha-card-box-shadow') || '0 2px 4px rgba(0, 0, 0, 0.1)',
                    
                    // Is this a dark theme?
                    isDark: detectDarkTheme(backgroundColor),
                    isGreenTheme: isGreenTheme
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
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            isDark: false,
            isGreenTheme: false
        };
    }
    
    // Detect if a color is dark
    function detectDarkTheme(backgroundColor) {
        // Simple check for dark background
        if (!backgroundColor) return false;
        
        // Parse RGB values from background color
        const rgbMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10);
            const g = parseInt(rgbMatch[2], 10);
            const b = parseInt(rgbMatch[3], 10);
            
            // Calculate perceived brightness (ITU-R BT.709)
            const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b);
            return brightness < 128;
        }
        
        // Fallback for other formats - check if color name contains 'dark'
        return backgroundColor.includes('dark') || 
               backgroundColor === '#000' || 
               backgroundColor === '#000000' ||
               backgroundColor === 'black';
    }
    
    // Detect if it's a green theme
    function detectGreenTheme(backgroundColor) {
        if (!backgroundColor) return false;
        
        // Parse RGB values
        const rgbMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10);
            const g = parseInt(rgbMatch[2], 10);
            const b = parseInt(rgbMatch[3], 10);
            
            // Check if green is the dominant component and it's a darker color
            return g > r && g > b && g < 150;
        }
        
        // Fallback - check if color includes green
        return backgroundColor.includes('green') || backgroundColor.includes('forest');
    }
    
    // Apply theme to document
    function applyTheme() {
        const theme = getHAThemeVariables();
        const root = document.documentElement;
        
        // Apply appropriate theme class
        if (theme.isGreenTheme) {
            document.body.classList.add('ha-theme-green');
            document.body.classList.remove('ha-dark-theme', 'ha-light-theme');
        } else if (theme.isDark) {
            document.body.classList.add('ha-dark-theme');
            document.body.classList.remove('ha-light-theme', 'ha-theme-green');
        } else {
            document.body.classList.add('ha-light-theme');
            document.body.classList.remove('ha-dark-theme', 'ha-theme-green');
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