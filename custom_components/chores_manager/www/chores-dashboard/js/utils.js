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

// Authentication helper functions
window.choreUtils.getAuthToken = function() {
    // First check session storage (where auth-helper.js stored it)
    const sessionToken = sessionStorage.getItem('chores_auth_token');
    if (sessionToken) {
        return sessionToken;
    }
    
    // Try extracting it directly if not found
    try {
        if (window.parent && window.parent.hassConnection) {
            const auth = window.parent.hassConnection.auth;
            if (auth && auth.data && auth.data.access_token) {
                // Store for future use
                sessionStorage.setItem('chores_auth_token', auth.data.access_token);
                return auth.data.access_token;
            }
        }
    } catch (e) {
        console.warn('Could not access parent window:', e);
    }
    
    // Last resort - try getting from config.json
    try {
        const configResponse = fetch('/local/chores-dashboard/config.json?nocache=' + Date.now(), {
            method: 'GET',
            cache: 'no-store'
        }).then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Failed to load config');
        }).then(config => {
            if (config && config.api_token) {
                sessionStorage.setItem('chores_auth_token', config.api_token);
                return config.api_token;
            }
            return null;
        }).catch(error => {
            console.warn('Error loading config.json:', error);
            return null;
        });
        
        if (configResponse) return configResponse;
    } catch (e) {
        console.warn('Error loading from config.json:', e);
    }
    
    return null;
};

// Improved token retrieval and fetch with auth
window.choreUtils.getAuthToken = function() {
    // First check session storage (where auth-helper.js stored it)
    const sessionToken = sessionStorage.getItem('chores_auth_token');
    if (sessionToken) {
        return sessionToken;
    }
    
    // Try getting from URL search params
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('auth');
        if (token) {
            // Store for future use
            sessionStorage.setItem('chores_auth_token', token);
            return token;
        }
    } catch (e) {
        console.warn('Error extracting token from URL:', e);
    }
    
    // Check localStorage for tokens
    try {
        const authData = localStorage.getItem('hassTokens');
        if (authData) {
            const tokens = JSON.parse(authData);
            if (tokens && tokens.access_token) {
                sessionStorage.setItem('chores_auth_token', tokens.access_token);
                return tokens.access_token;
            }
        }
    } catch (e) {
        console.warn('Error retrieving from localStorage:', e);
    }
    
    // Try extracting it directly from parent window
    try {
        if (window.parent && window.parent.hassConnection) {
            const auth = window.parent.hassConnection.auth;
            if (auth && auth.data && auth.data.access_token) {
                // Store for future use
                sessionStorage.setItem('chores_auth_token', auth.data.access_token);
                return auth.data.access_token;
            }
        }
    } catch (e) {
        console.warn('Could not access parent window:', e);
    }
    
    return null;
};

// Improved fetch with auth
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
    
    try {
        // Use credentials to maintain session cookies too
        fetchOptions.credentials = 'same-origin';
        const response = await fetch(url, fetchOptions);
        
        if (response.status === 401) {
            // Try to refresh token on auth failure
            console.warn('Authentication failed, attempting to refresh token...');
            sessionStorage.removeItem('chores_auth_token');
            const newToken = window.choreUtils.getAuthToken();
            
            if (newToken && newToken !== token) {
                // Retry with new token
                const retryOptions = {
                    ...fetchOptions,
                    headers: {
                        ...fetchOptions.headers,
                        'Authorization': `Bearer ${newToken}`
                    }
                };
                return fetch(url, retryOptions);
            }
        }
        
        return response;
    } catch (e) {
        console.error('Fetch error:', e);
        throw e;
    }
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

console.log('ChoreUtils initialized');