// IMPORTANT: This script runs before the main chores dashboard loads
// It retrieves and stores the Home Assistant auth token
(function() {
    // Find and extract Home Assistant auth token from different sources
    function extractHassToken() {
        // Method 1: Access through parent window (iframe context)
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

        // Method 2: Try getting from localStorage
        try {
            const hassAuth = localStorage.getItem('hassAuth');
            if (hassAuth) {
                const authData = JSON.parse(hassAuth);
                if (authData && authData.access_token) {
                    return authData.access_token;
                }
            }
        } catch (e) {
            console.warn('Cannot access localStorage auth:', e);
        }

        // Method 3: Check if token is in the URL
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('auth_token');
            if (token) {
                return token;
            }
        } catch (e) {
            console.warn('Cannot extract token from URL:', e);
        }

        return null;
    }

    // Store the token where the main app can find it
    const token = extractHassToken();
    if (token) {
        sessionStorage.setItem('chores_auth_token', token);
        console.log('Successfully retrieved Home Assistant auth token');
    } else {
        console.warn('Could not retrieve Home Assistant auth token');
    }
})();