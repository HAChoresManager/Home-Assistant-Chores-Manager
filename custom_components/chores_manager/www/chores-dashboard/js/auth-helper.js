// Chores Dashboard Authentication Helper
// Manages authentication tokens for Home Assistant API access
// Version: 1.4.1-20250415-flickerfix

(function() {
    'use strict';
    
    // Token storage key
    const TOKEN_KEY = 'chores_auth_token';
    const TOKEN_VALIDATION_INTERVAL = 30000; // 30 seconds
    
    // Track last validation
    let lastValidation = 0;
    let cachedToken = null;
    
    /**
     * Get Home Assistant token from various sources
     */
    function getHassToken() {
        try {
            // Method 1: Direct access to hassConnection in parent window
            if (window.parent && window.parent.hassConnection) {
                const connection = window.parent.hassConnection;
                if (connection.options && connection.options.auth && 
                    connection.options.auth.data && connection.options.auth.data.access_token) {
                    console.log('Got token from parent hassConnection');
                    return connection.options.auth.data.access_token;
                }
                // Alternative path in hassConnection
                if (connection.auth && connection.auth.data && connection.auth.data.access_token) {
                    console.log('Got token from parent hassConnection.auth');
                    return connection.auth.data.access_token;
                }
            }
            
            // Method 2: Check for hassConnection in current window
            if (window.hassConnection) {
                const connection = window.hassConnection;
                if (connection.options && connection.options.auth && 
                    connection.options.auth.data && connection.options.auth.data.access_token) {
                    console.log('Got token from window hassConnection');
                    return connection.options.auth.data.access_token;
                }
                if (connection.auth && connection.auth.data && connection.auth.data.access_token) {
                    console.log('Got token from window hassConnection.auth');
                    return connection.auth.data.access_token;
                }
            }
            
            // Method 3: Try to access through Home Assistant main element
            if (window.parent && window.parent.document) {
                const haElement = window.parent.document.querySelector('home-assistant');
                if (haElement && haElement.hass && haElement.hass.auth && 
                    haElement.hass.auth.data && haElement.hass.auth.data.access_token) {
                    console.log('Got token from home-assistant element');
                    return haElement.hass.auth.data.access_token;
                }
                
                // Try through the hass property directly
                if (haElement && haElement.hass && haElement.hass.auth && 
                    haElement.hass.auth.accessToken) {
                    console.log('Got token from home-assistant element (accessToken)');
                    return haElement.hass.auth.accessToken;
                }
            }
            
            // Method 4: Check localStorage for hassTokens
            const hassTokens = localStorage.getItem('hassTokens');
            if (hassTokens) {
                try {
                    const tokens = JSON.parse(hassTokens);
                    if (tokens.access_token) {
                        console.log('Got token from localStorage hassTokens');
                        return tokens.access_token;
                    }
                } catch (e) {
                    console.warn('Failed to parse hassTokens:', e);
                }
            }
            
            // Method 5: Check URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('auth') || urlParams.get('token');
            if (urlToken) {
                console.log('Got token from URL parameters');
                return urlToken;
            }
            
            return null;
        } catch (e) {
            console.warn('Error getting HA token:', e);
            return null;
        }
    }
    
    /**
     * Get stored token from localStorage
     */
    function getStoredToken() {
        const stored = localStorage.getItem(TOKEN_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.token && data.expires > Date.now()) {
                    return data.token;
                }
            } catch (e) {
                // Might be a plain string token
                return stored;
            }
        }
        return null;
    }
    
    /**
     * Store token in localStorage
     */
    function storeToken(token) {
        if (token) {
            const data = {
                token: token,
                expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            };
            localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
            cachedToken = token;
        }
    }
    
    /**
     * Clear stored token
     */
    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
        cachedToken = null;
    }
    
    /**
     * Validate token by making a test API call
     */
    async function validateToken(token) {
        if (!token) return false;
        
        try {
            const response = await fetch('/api/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Get the best available token
     */
    async function getBestToken() {
        // Return cached token if recently validated
        if (cachedToken && (Date.now() - lastValidation) < TOKEN_VALIDATION_INTERVAL) {
            return cachedToken;
        }
        
        // Try to get HA token first
        const hassToken = getHassToken();
        if (hassToken) {
            // Validate if needed
            if ((Date.now() - lastValidation) > TOKEN_VALIDATION_INTERVAL) {
                const isValid = await validateToken(hassToken);
                if (isValid) {
                    lastValidation = Date.now();
                    storeToken(hassToken);
                    cachedToken = hassToken;
                    return hassToken;
                }
            } else {
                cachedToken = hassToken;
                return hassToken;
            }
        }
        
        // Try stored token
        const storedToken = getStoredToken();
        if (storedToken) {
            // Validate if needed
            if ((Date.now() - lastValidation) > TOKEN_VALIDATION_INTERVAL) {
                const isValid = await validateToken(storedToken);
                if (isValid) {
                    lastValidation = Date.now();
                    cachedToken = storedToken;
                    return storedToken;
                }
                // Token is invalid, clear it
                clearToken();
            } else {
                cachedToken = storedToken;
                return storedToken;
            }
        }
        
        console.warn('No valid authentication token found');
        return null;
    }
    
    /**
     * Simple synchronous token getter
     */
    function getToken() {
        // Try cached token first
        if (cachedToken) {
            return cachedToken;
        }
        
        // Try to get HA token
        const hassToken = getHassToken();
        if (hassToken) {
            cachedToken = hassToken;
            return hassToken;
        }
        
        // Try stored token
        const storedToken = getStoredToken();
        if (storedToken) {
            cachedToken = storedToken;
            return storedToken;
        }
        
        return null;
    }
    
    /**
     * Initialize authentication
     */
    async function initialize() {
        console.log('Initializing chores authentication helper');
        
        // Try to get and validate a token
        const token = await getBestToken();
        if (token) {
            console.log('Authentication initialized successfully');
            return true;
        } else {
            console.warn('Authentication initialization failed - no valid token found');
            
            // Dispatch event to notify about auth failure
            window.dispatchEvent(new CustomEvent('chores-auth-failed', {
                detail: { message: 'No valid authentication token found' }
            }));
            
            return false;
        }
    }
    
    // Export authentication helper
    window.choreAuth = {
        getToken: getToken,
        getBestToken: getBestToken,
        getStoredToken: getStoredToken,
        validateToken: validateToken,
        storeToken: storeToken,
        clearToken: clearToken,
        initialize: initialize
    };
    
    // Auto-initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    console.log('Using Home Assistant native token');
})();