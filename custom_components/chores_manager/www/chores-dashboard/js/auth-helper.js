// Simplified authentication helper with better mobile app support
(function() {
    // Simplified token storage - single key for all users/devices
    const TOKEN_KEY = 'chores_auth_token';
    const TOKEN_VALIDATION_INTERVAL = 30000; // 30 seconds
    
    // Get Home Assistant token from parent window (works in mobile app and web)
    function getHassToken() {
        try {
            // Method 1: Direct access to hass object in parent window
            if (window.parent && window.parent.hassConnection && 
                window.parent.hassConnection.auth && 
                window.parent.hassConnection.auth.data && 
                window.parent.hassConnection.auth.data.access_token) {
                return window.parent.hassConnection.auth.data.access_token;
            }
            
            // Method 2: Check for hass in current window (if not in iframe)
            if (window.hassConnection && 
                window.hassConnection.auth && 
                window.hassConnection.auth.data && 
                window.hassConnection.auth.data.access_token) {
                return window.hassConnection.auth.data.access_token;
            }
            
            // Method 3: Try to access through document.querySelector (for HA web)
            if (window.parent && window.parent.document) {
                const haElement = window.parent.document.querySelector('home-assistant');
                if (haElement && haElement.hass && haElement.hass.auth && 
                    haElement.hass.auth.data && haElement.hass.auth.data.access_token) {
                    return haElement.hass.auth.data.access_token;
                }
            }
            
            // Method 4: Check URL parameters (passed from HA)
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('auth');
            if (urlToken) {
                return urlToken;
            }
            
            return null;
        } catch (e) {
            console.warn('Error getting HA token:', e);
            return null;
        }
    }
    
    // Get token from config.json as fallback
    async function getConfigToken() {
        try {
            const response = await fetch('/local/chores-dashboard/config.json?nocache=' + Date.now(), {
                cache: 'no-store'
            });
            if (!response.ok) return null;
            
            const config = await response.json();
            return config?.api_token || null;
        } catch (e) {
            console.warn('Error getting config token:', e);
            return null;
        }
    }
    
    // Validate token with HA API
    async function validateToken(token) {
        if (!token) return false;
        
        try {
            const response = await fetch('/api/config', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                },
                timeout: 5000
            });
            return response.ok;
        } catch (e) {
            console.warn('Token validation failed:', e);
            return false;
        }
    }
    
    // Get best available token
    async function getBestToken() {
        // 1. Try Home Assistant native token first
        const hassToken = getHassToken();
        if (hassToken) {
            const isValid = await validateToken(hassToken);
            if (isValid) {
                console.log('Using Home Assistant native token');
                localStorage.setItem(TOKEN_KEY, hassToken);
                return hassToken;
            }
        }
        
        // 2. Try stored token
        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (storedToken) {
            const isValid = await validateToken(storedToken);
            if (isValid) {
                console.log('Using stored token');
                return storedToken;
            } else {
                // Clear invalid stored token
                localStorage.removeItem(TOKEN_KEY);
            }
        }
        
        // 3. Try config.json token
        const configToken = await getConfigToken();
        if (configToken) {
            const isValid = await validateToken(configToken);
            if (isValid) {
                console.log('Using config.json token');
                localStorage.setItem(TOKEN_KEY, configToken);
                return configToken;
            }
        }
        
        console.warn('No valid token found');
        return null;
    }
    
    // Initialize authentication
    const initAuth = async () => {
        try {
            const token = await getBestToken();
            
            if (token) {
                // Dispatch success event
                const event = new CustomEvent('chores-auth-ready', { 
                    detail: { token: token } 
                });
                window.dispatchEvent(event);
                
                // Set up token validation interval
                setupTokenValidation(token);
            } else {
                // Dispatch error event
                const errorEvent = new CustomEvent('chores-auth-error', {
                    detail: { message: 'No valid authentication token found' }
                });
                window.dispatchEvent(errorEvent);
            }
        } catch (e) {
            console.error('Auth initialization failed:', e);
            const errorEvent = new CustomEvent('chores-auth-error', {
                detail: { message: 'Authentication initialization failed: ' + e.message }
            });
            window.dispatchEvent(errorEvent);
        }
    };
    
    // Set up periodic token validation
    function setupTokenValidation(initialToken) {
        let currentToken = initialToken;
        
        const validatePeriodically = async () => {
            try {
                // Always try to get the latest HA token first
                const hassToken = getHassToken();
                if (hassToken && hassToken !== currentToken) {
                    const isValid = await validateToken(hassToken);
                    if (isValid) {
                        currentToken = hassToken;
                        localStorage.setItem(TOKEN_KEY, hassToken);
                        console.log('Updated to newer HA token');
                        return;
                    }
                }
                
                // Validate current token
                const isValid = await validateToken(currentToken);
                if (!isValid) {
                    console.log('Current token invalid, refreshing...');
                    const newToken = await getBestToken();
                    if (newToken) {
                        currentToken = newToken;
                        console.log('Token refreshed successfully');
                    } else {
                        console.error('Failed to refresh token');
                        const errorEvent = new CustomEvent('chores-auth-error', {
                            detail: { message: 'Token expired and refresh failed' }
                        });
                        window.dispatchEvent(errorEvent);
                    }
                }
            } catch (e) {
                console.warn('Token validation error:', e);
            }
        };
        
        // Validate immediately and then every 30 seconds
        validatePeriodically();
        const interval = setInterval(validatePeriodically, TOKEN_VALIDATION_INTERVAL);
        
        // Also validate when window regains focus
        window.addEventListener('focus', validatePeriodically);
        
        // Store interval for cleanup
        window.choreAuthInterval = interval;
    }
    
    // Expose methods globally
    window.choreAuth = {
        getBestToken: getBestToken,
        validateToken: validateToken,
        initAuth: initAuth,
        getStoredToken: () => localStorage.getItem(TOKEN_KEY),
        clearToken: () => localStorage.removeItem(TOKEN_KEY)
    };
    
    // Start auth initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (window.choreAuthInterval) {
            clearInterval(window.choreAuthInterval);
        }
    });
})();