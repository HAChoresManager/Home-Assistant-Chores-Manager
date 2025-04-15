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

// Improved token retrieval with priority on config.json
window.choreUtils.getAuthToken = function() {
    // CHANGED: Check localStorage first (instead of sessionStorage)
    const localToken = localStorage.getItem('chores_auth_token');
    if (localToken) {
        return localToken;
    }
    
    // Fallback to sessionStorage if localStorage is empty
    const sessionToken = sessionStorage.getItem('chores_auth_token');
    if (sessionToken) {
        // Move to localStorage for persistence
        localStorage.setItem('chores_auth_token', sessionToken);
        return sessionToken;
    }
    
    // If no token in storage, try to load from config.json synchronously
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/local/chores-dashboard/config.json?nocache=' + Date.now(), false);  // false = synchronous
        xhr.send(null);
        
        if (xhr.status === 200) {
            const config = JSON.parse(xhr.responseText);
            if (config && config.api_token) {
                // CHANGED: Store in localStorage
                localStorage.setItem('chores_auth_token', config.api_token);
                return config.api_token;
            }
        }
    } catch (e) {
        console.warn('Error loading config synchronously:', e);
    }
    
    // If that fails, try other methods as fallback
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('auth');
        if (token) {
            // CHANGED: Store in localStorage
            localStorage.setItem('chores_auth_token', token);
            return token;
        }
    } catch (e) {
        console.warn('Error extracting token from URL:', e);
    }
    
    return null;
};

// NEW: Set up periodic token refresh to prevent auth failures
window.choreUtils.setupPeriodicTokenRefresh = function(interval = 300000) { // 5 minutes default
    // Clear any existing refresh interval
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }
    
    // Set up a new refresh interval
    window.tokenRefreshInterval = setInterval(async function() {
        try {
            // Only refresh if we have a token already
            if (localStorage.getItem('chores_auth_token')) {
                console.log('Performing background token refresh check...');
                const newToken = await window.choreUtils.refreshToken();
                if (newToken) {
                    console.log('Background token refresh successful');
                }
            }
        } catch (e) {
            console.warn('Background token refresh failed:', e);
        }
    }, interval);
    
    // Also refresh on window focus - critical for devices that were inactive
    window.addEventListener('focus', async function() {
        try {
            if (localStorage.getItem('chores_auth_token')) {
                await window.choreUtils.refreshToken();
            }
        } catch (e) {
            console.warn('Focus token refresh failed:', e);
        }
    });
    
    return window.tokenRefreshInterval;
};

// Improved fetch with auth and exponential backoff
window.choreUtils.fetchWithAuth = async function(url, options = {}) {
    // Get auth token
    const token = window.choreUtils.getAuthToken();
    
    // Create fetch options with authentication
    const fetchOptions = { 
        ...options,
        headers: {
            ...options.headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    };
    
    // Add auth token if available
    if (token) {
        fetchOptions.headers = {
            ...fetchOptions.headers,
            'Authorization': `Bearer ${token}`
        };
    } else {
        console.warn('No auth token available for API request');
    }
    
    // ADDED: Retry mechanism with exponential backoff
    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second initial delay
    
    while (retries <= maxRetries) {
        try {
            // Use credentials to maintain session cookies too
            fetchOptions.credentials = 'same-origin';
            const response = await fetch(url, fetchOptions);
            
            if (response.status === 401) {
                // IMPROVED: Handle auth failures
                console.warn(`Authentication failed (attempt ${retries+1}/${maxRetries+1}), attempting to refresh token...`);
                
                if (retries === maxRetries) {
                    // Last attempt - clear token and try a complete token refresh
                    localStorage.removeItem('chores_auth_token');
                    sessionStorage.removeItem('chores_auth_token');
                    
                    // Try to reload the page to force a complete refresh
                    const shouldReload = confirm("Authentication has failed. Would you like to reload the page to try again?");
                    if (shouldReload) {
                        window.location.reload(true);
                        return new Response(JSON.stringify({error: "Authentication failed"}), {
                            status: 401,
                            headers: {'Content-Type': 'application/json'}
                        });
                    }
                }
                
                // Try to get a fresh token
                const newToken = await window.choreUtils.refreshToken();
                
                if (newToken && newToken !== token) {
                    // Retry with new token
                    const retryOptions = {
                        ...fetchOptions,
                        headers: {
                            ...fetchOptions.headers,
                            'Authorization': `Bearer ${newToken}`
                        }
                    };
                    retries++;
                    
                    // Exponential backoff
                    const delay = baseDelay * Math.pow(2, retries - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Try again with new token
                }
            }
            
            return response;
        } catch (e) {
            console.error(`Fetch error (attempt ${retries+1}/${maxRetries+1}):`, e);
            
            if (retries === maxRetries) {
                throw e; // Give up after max retries
            }
            
            retries++;
            // Exponential backoff
            const delay = baseDelay * Math.pow(2, retries - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// ADDED: Token refresh function
window.choreUtils.refreshToken = async function() {
    // Clear current token
    const currentToken = localStorage.getItem('chores_auth_token');
    localStorage.removeItem('chores_auth_token');
    
    // First try config.json
    try {
        const response = await fetch('/local/chores-dashboard/config.json?nocache=' + Date.now(), {
            cache: 'no-store'
        });
        
        if (response.ok) {
            const config = await response.json();
            if (config && config.api_token) {
                const token = config.api_token;
                localStorage.setItem('chores_auth_token', token);
                console.log('Refreshed token from config.json');
                return token;
            }
        }
    } catch (e) {
        console.warn('Error refreshing token from config:', e);
    }
    
    // If that fails, try extracting from parent window
    try {
        if (window.parent && window.parent.hassConnection) {
            const auth = window.parent.hassConnection.auth;
            if (auth && auth.data && auth.data.access_token) {
                const token = auth.data.access_token;
                localStorage.setItem('chores_auth_token', token);
                console.log('Refreshed token from parent window');
                return token;
            }
        }
    } catch (e) {
        console.warn('Cannot refresh token from parent window:', e);
    }
    
    // Last resort, return the original token
    return currentToken;
};

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

window.choreUtils.calculateNextDueDate = function(chore) {
    if (!chore || !chore.chore_id || !chore.name || chore.name.trim() === '') return new Date(9999, 0, 1);
    if (!chore.last_done) return new Date();

    const lastDone = new Date(chore.last_done);
    let nextDue = new Date(lastDone);

    switch (chore.frequency_type) {
        case 'Dagelijks':
            nextDue.setDate(lastDone.getDate() + 1);
            break;

        case 'Wekelijks':
            if (chore.weekday !== undefined) {
                const targetDay = parseInt(chore.weekday);
                let daysToAdd = (targetDay + 7 - lastDone.getDay()) % 7;
                daysToAdd = daysToAdd === 0 ? 7 : daysToAdd;
                nextDue.setDate(lastDone.getDate() + daysToAdd);
            } else {
                nextDue.setDate(lastDone.getDate() + 7);
            }
            break;

        case 'Meerdere keren per week':
            if (chore.startWeekday !== undefined) {
                const interval = Math.ceil(7 / chore.frequency_times);
                const targetDay = parseInt(chore.startWeekday);
                const currentDay = lastDone.getDay();
                const daysToStartDay = (targetDay - currentDay + 7) % 7;

                let daysToAdd = interval;
                if (daysToStartDay <= interval && daysToStartDay > 0) {
                    daysToAdd = daysToStartDay;
                } else if (daysToStartDay === 0) {
                    daysToAdd = interval;
                }

                nextDue.setDate(lastDone.getDate() + daysToAdd);
            } else {
                nextDue.setDate(lastDone.getDate() + Math.ceil(7 / chore.frequency_times));
            }
            break;

        case 'Maandelijks':
            if (chore.monthday !== undefined) {
                const targetDay = parseInt(chore.monthday);
                nextDue.setMonth(lastDone.getMonth() + 1);
                nextDue.setDate(Math.min(targetDay, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()));
            } else {
                nextDue.setMonth(lastDone.getMonth() + 1);
            }
            break;

        case 'Meerdere keren per maand':
            if (chore.startMonthday !== undefined) {
                const interval = Math.ceil(30 / chore.frequency_times);
                const targetDay = parseInt(chore.startMonthday);
                const currentDay = lastDone.getDate();
                const daysInMonth = new Date(lastDone.getFullYear(), lastDone.getMonth() + 1, 0).getDate();

                let nextOccurrence = targetDay;
                while (nextOccurrence <= currentDay) {
                    nextOccurrence += interval;
                }

                if (nextOccurrence > daysInMonth) {
                    nextDue.setMonth(lastDone.getMonth() + 1);
                    nextDue.setDate(Math.min(targetDay, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()));
                } else {
                    nextDue.setDate(nextOccurrence);
                }
            } else {
                nextDue.setDate(lastDone.getDate() + Math.ceil(30 / chore.frequency_times));
            }
            break;

        case 'Per kwartaal':
            if (chore.startMonth !== undefined && chore.startDay !== undefined) {
                const targetMonth = parseInt(chore.startMonth);
                const targetDay = parseInt(chore.startDay);

                const currentMonth = lastDone.getMonth();
                const monthsToAdd = 3;
                const nextMonth = (currentMonth + monthsToAdd) % 12;

                nextDue.setMonth(nextMonth);
                const daysInMonth = new Date(nextDue.getFullYear(), nextMonth + 1, 0).getDate();
                nextDue.setDate(Math.min(targetDay, daysInMonth));
            } else {
                nextDue.setMonth(lastDone.getMonth() + 3);
            }
            break;

        case 'Halfjaarlijks':
            if (chore.startMonth !== undefined && chore.startDay !== undefined) {
                const targetMonth = parseInt(chore.startMonth);
                const targetDay = parseInt(chore.startDay);

                const currentMonth = lastDone.getMonth();
                const monthsToAdd = 6;
                const nextMonth = (currentMonth + monthsToAdd) % 12;

                nextDue.setMonth(nextMonth);
                const daysInMonth = new Date(nextDue.getFullYear(), nextMonth + 1, 0).getDate();
                nextDue.setDate(Math.min(targetDay, daysInMonth));
            } else {
                nextDue.setMonth(lastDone.getMonth() + 6);
            }
            break;

        case 'Jaarlijks':
            if (chore.yearMonth !== undefined && chore.yearDay !== undefined) {
                const targetMonth = parseInt(chore.yearMonth);
                const targetDay = parseInt(chore.yearDay);

                nextDue.setFullYear(lastDone.getFullYear() + 1);
                nextDue.setMonth(targetMonth);
                const lastDayOfMonth = new Date(nextDue.getFullYear(), targetMonth + 1, 0).getDate();
                nextDue.setDate(Math.min(targetDay, lastDayOfMonth));
            } else {
                nextDue.setFullYear(lastDone.getFullYear() + 1);
            }
            break;

        default:
            nextDue.setDate(lastDone.getDate() + (chore.frequency_days || 7));
    }

    return nextDue;
};

window.choreUtils.isDueOrOverdue = function(chore) {
    if (!chore.last_done) return true; 

    const nextDue = window.choreUtils.calculateNextDueDate(chore);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return nextDue <= today;
};

window.choreUtils.isDueToday = function(chore) {
    if (!chore || !chore.chore_id || !chore.name || chore.name.trim() === '') return false;

    if (!chore.last_done) return true;

    const nextDue = window.choreUtils.calculateNextDueDate(chore);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return nextDue >= today && nextDue < tomorrow;
};

window.choreUtils.getBackgroundColor = function(assignedTo, assigneesList = []) {
    const assignee = assigneesList.find(a => a.name === assignedTo);
    if (assignee && assignee.color) {
        return `border border-solid bg-white`;
    }

    switch (assignedTo) {
        case 'Martijn': return 'bg-yellow-100 border-yellow-400';
        case 'Laura': return 'bg-red-100 border-red-400';
        case 'Sammen': return 'bg-blue-100 border-blue-400';
        case 'Wie kan': return 'bg-green-100 border-green-400';
        default: return 'bg-gray-100 border-gray-400';
    }
};

window.choreUtils.getPriorityColor = function(priority) {
    switch (priority) {
        case 'Hoog': return '#EF4444';
        case 'Middel': return '#F59E0B';
        case 'Laag': return '#3B82F6';
        default: return '#6B7280';
    }
};

window.choreUtils.formatTime = function(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}u ${mins > 0 ? mins + 'm' : ''}`;
};

// Force refresh to avoid caching problems
window.choreUtils.forceRefresh = function() {
    window.location.reload(true);
};

// ADDED: Helper function to clear all tokens and force auth refresh
window.choreUtils.resetAllTokens = function() {
    localStorage.removeItem('chores_auth_token');
    sessionStorage.removeItem('chores_auth_token');
    console.log('All authentication tokens cleared');
    return window.choreUtils.refreshToken();
};

// ADDED: Debug function to check token status
window.choreUtils.checkTokenStatus = async function() {
    const token = window.choreUtils.getAuthToken();
    const tokenStatus = {
        hasToken: !!token,
        tokenSource: 'unknown',
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 8) + '...' : 'none'
    };
    
    if (localStorage.getItem('chores_auth_token')) {
        tokenStatus.tokenSource = 'localStorage';
    } else if (sessionStorage.getItem('chores_auth_token')) {
        tokenStatus.tokenSource = 'sessionStorage';
    }
    
    // Test the token
    if (token) {
        try {
            const response = await fetch('/api/states', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            tokenStatus.isValid = response.ok;
            tokenStatus.statusCode = response.status;
        } catch (e) {
            tokenStatus.isValid = false;
            tokenStatus.error = e.message;
        }
    } else {
        tokenStatus.isValid = false;
    }
    
    console.table(tokenStatus);
    return tokenStatus;
};

console.log('ChoreUtils initialized');