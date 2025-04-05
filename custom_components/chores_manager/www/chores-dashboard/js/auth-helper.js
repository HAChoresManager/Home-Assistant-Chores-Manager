// More reliable auth token extraction
(function() {
    // First try config.json to get the token
    async function getConfigToken() {
        try {
            const response = await fetch('/local/chores-dashboard/config.json?nocache=' + Date.now(), {
                cache: 'no-store'
            });
            if (!response.ok) return null;
            
            const config = await response.json();
            if (config && config.api_token) {
                console.log('Using auth token from config.json');
                return config.api_token;
            }
            return null;
        } catch (e) {
            console.warn('Cannot extract token from config.json:', e);
            return null;
        }
    }
    
    // Fallback methods to get token if config.json fails
    function extractHassToken() {
        // Try all possible methods to get the token
        
        // Method 1: Get from URL hash if present
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('auth');
            if (token) {
                return token;
            }
        } catch (e) {
            console.warn('Cannot extract token from URL:', e);
        }
        
        // Method 2: Try to access hass object directly
        try {
            if (window.hassConnection) {
                const auth = window.hassConnection.auth;
                if (auth && auth.data && auth.data.access_token) {
                    return auth.data.access_token;
                }
            }
        } catch (e) {
            console.warn('Cannot access window.hassConnection:', e);
        }
        
        // Method 3: Access through parent window
        try {
            if (window.parent && window.parent.hassConnection) {
                const auth = window.parent.hassConnection.auth;
                if (auth && auth.data && auth.data.access_token) {
                    return auth.data.access_token;
                }
            }
        } catch (e) {
            console.warn('Cannot access parent window auth:', e);
        }

        // Method 4: Look for auth data in localStorage
        try {
            const authData = localStorage.getItem('hassTokens');
            if (authData) {
                const tokens = JSON.parse(authData);
                if (tokens && tokens.access_token) {
                    return tokens.access_token;
                }
            }
        } catch (e) {
            console.warn('Cannot access localStorage tokens:', e);
        }

        return null;
    }

    // Initialize tokens asynchronously
    const initAuth = async () => {
        // First try to get token from config
        const configToken = await getConfigToken();
        
        if (configToken) {
            sessionStorage.setItem('chores_auth_token', configToken);
            
            // Create a global event that other scripts can listen for
            const event = new CustomEvent('chores-auth-ready', { detail: { token: configToken } });
            window.dispatchEvent(event);
        } else {
            // If config token fails, try other methods
            const token = extractHassToken();
            if (token) {
                sessionStorage.setItem('chores_auth_token', token);
                console.log('Successfully retrieved Home Assistant auth token');
                
                // Create a global event
                const event = new CustomEvent('chores-auth-ready', { detail: { token } });
                window.dispatchEvent(event);
            } else {
                console.warn('Could not retrieve Home Assistant auth token');
            }
        }
    };
    
    // Start auth initialization
    initAuth();
})();