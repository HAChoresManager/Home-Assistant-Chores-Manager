// More reliable auth token extraction
(function() {
    function extractHassToken() {
        // Try all possible methods to get the token
        
        // Method 1: Get from URL hash if present (most reliable when provided)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('auth');
            if (token) {
                return token;
            }
        } catch (e) {
            console.warn('Cannot extract token from URL:', e);
        }
        
        // Method 2: Try to access hass object directly (works in some iframe contexts)
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
        
        // Method 3: Access through parent window (iframe context)
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

    // Store and announce token
    const token = extractHassToken();
    if (token) {
        sessionStorage.setItem('chores_auth_token', token);
        console.log('Successfully retrieved Home Assistant auth token');
        
        // Create a global event that other scripts can listen for
        const event = new CustomEvent('chores-auth-ready', { detail: { token } });
        window.dispatchEvent(event);
    } else {
        console.warn('Could not retrieve Home Assistant auth token');
    }
})();