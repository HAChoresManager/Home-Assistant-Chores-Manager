// Create window.choreUtils namespace
window.choreUtils = {};

// Available icons for tasks
window.choreUtils.availableIcons = {
    'cleaning': '🧹',
    'cat': '🐱',
    'dishes': '🍽️',
    'bathroom': '🚿',
    'window': '🪟',
    'dishwasher': '🫧',
    'laundry': '👕',
    'plant': '🌱',
    'refrigerator': '🧊',
    'kitchen': '🧽',
    'trash': '🗑️',
    'bed': '🛏️',
    'water': '💧',
    'dust': '💨',
    'floors': '🧺',
    'food': '🍲',
    'shopping': '🛒',
    'general': '📋'
};

// Core utility functions (keeping the same)
window.choreUtils.isToday = function(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const date = new Date(dateString);
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
};

window.choreUtils.formatDate = function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

// [Keep all other utility functions]

// Improved authentication function that works with panel integration
window.choreUtils.fetchWithAuth = async function(url, options = {}) {
    try {
        // Try to get token from localStorage (set by the chores-dashboard.js component)
        let token = localStorage.getItem('chores_auth_token');
        
        // If no token in localStorage, try parent window (for iframe context)
        if (!token && window.parent) {
            try {
                // Try to get auth from parent window
                if (window.parent.hassConnection && 
                    window.parent.hassConnection.auth && 
                    window.parent.hassConnection.auth.data && 
                    window.parent.hassConnection.auth.data.access_token) {
                    token = window.parent.hassConnection.auth.data.access_token;
                }
                // Alternative method for newer HA versions
                else if (window.parent.document.querySelector('home-assistant') && 
                         window.parent.document.querySelector('home-assistant').hass && 
                         window.parent.document.querySelector('home-assistant').hass.auth && 
                         window.parent.document.querySelector('home-assistant').hass.auth.data) {
                    token = window.parent.document.querySelector('home-assistant').hass.auth.data.access_token;
                }
            } catch (e) {
                console.warn('Could not access parent window auth:', e);
            }
        }

        const fetchOptions = { ...options };
        
        // Always include credentials for cookie/session auth
        fetchOptions.credentials = 'same-origin';
        
        // Add Authorization header if we have a token
        if (token) {
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };
        }
        
        // Perform fetch with auth
        return fetch(url, fetchOptions);
    } catch (e) {
        console.error('Fetch with auth error:', e);
        throw e;
    }
};

console.log('ChoreUtils initialized');