// More reliable auth token extraction with user-specific isolation
(function() {
    // Extract user ID from current session if possible
    function getUserIdentifier() {
        try {
            // Try to get user info from parent window
            if (window.parent && window.parent.hassConnection && 
                window.parent.hassConnection.connection && 
                window.parent.hassConnection.connection.options &&
                window.parent.hassConnection.connection.options.userID) {
                return window.parent.hassConnection.connection.options.userID;
            }
            
            // Fallback to getting from localStorage
            const hassTokens = localStorage.getItem('hassTokens');
            if (hassTokens) {
                try {
                    const parsed = JSON.parse(hassTokens);
                    if (parsed && parsed.user && parsed.user.id) {
                        return parsed.user.id;
                    }
                } catch (e) {}
            }
            
            // Final fallback - generate a device-specific ID that persists
            let deviceId = localStorage.getItem('choresDeviceId');
            if (!deviceId) {
                deviceId = 'device_' + Math.random().toString(36).substring(2, 10) + 
                           '_' + Date.now().toString(36);
                localStorage.setItem('choresDeviceId', deviceId);
            }
            return deviceId;
        } catch (e) {
            console.warn('Error getting user identifier:', e);
            // Generate a random ID as last resort
            return 'unknown_' + Math.random().toString(36).substring(2, 10);
        }
    }
    
    // Get user-specific token key
    function getTokenKey() {
        const userId = getUserIdentifier();
        return `chores_auth_token_${userId}`;
    }
    
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
        // Get user-specific token key
        const tokenKey = getTokenKey();
        
        // Try to get existing token first
        const existingToken = localStorage.getItem(tokenKey);
        if (existingToken) {
            // Validate token with a simple API call
            try {
                const response = await fetch('/api/config', {
                    headers: {
                        'Authorization': `Bearer ${existingToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    // Token is valid, use it
                    console.log(`Using existing valid token for ${tokenKey}`);
                    
                    // Create a global event that other scripts can listen for
                    const event = new CustomEvent('chores-auth-ready', { 
                        detail: { token: existingToken, tokenKey: tokenKey } 
                    });
                    window.dispatchEvent(event);
                    return;
                } else {
                    // Token is invalid, remove it
                    console.log(`Existing token for ${tokenKey} is invalid, removing`);
                    localStorage.removeItem(tokenKey);
                }
            } catch (e) {
                console.warn('Error validating existing token:', e);
            }
        }
        
        // If no valid token, try to get a new one
        // First try config.json
        const configToken = await getConfigToken();
        
        if (configToken) {
            localStorage.setItem(tokenKey, configToken);
            
            // Create a global event that other scripts can listen for
            const event = new CustomEvent('chores-auth-ready', { 
                detail: { token: configToken, tokenKey: tokenKey } 
            });
            window.dispatchEvent(event);
        } else {
            // If config token fails, try other methods
            const token = extractHassToken();
            if (token) {
                localStorage.setItem(tokenKey, token);
                console.log(`Successfully retrieved Home Assistant auth token for ${tokenKey}`);
                
                // Create a global event
                const event = new CustomEvent('chores-auth-ready', { 
                    detail: { token, tokenKey: tokenKey } 
                });
                window.dispatchEvent(event);
            } else {
                console.warn('Could not retrieve Home Assistant auth token');
                
                // Dispatch auth error event
                const errorEvent = new CustomEvent('chores-auth-error', {
                    detail: { message: 'Failed to retrieve authentication token' }
                });
                window.dispatchEvent(errorEvent);
            }
        }
    };
    
    // Expose methods globally
    window.choreAuth = {
        getUserIdentifier: getUserIdentifier,
        getTokenKey: getTokenKey,
        initAuth: initAuth
    };
    
    // Start auth initialization
    initAuth();
})();