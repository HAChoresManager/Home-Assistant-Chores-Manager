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

// Simplified token key - single for all users
const TOKEN_KEY = 'chores_auth_token';

// Get authentication token - simplified approach
window.choreUtils.getAuthToken = function() {
    // Get from localStorage first
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
        return storedToken;
    }
    
    // If no stored token, try to get from choreAuth helper
    if (window.choreAuth && window.choreAuth.getStoredToken) {
        return window.choreAuth.getStoredToken();
    }
    
    return null;
};

// Simplified fetch with authentication and retry logic
window.choreUtils.fetchWithAuth = async function(url, options = {}) {
    const maxRetries = 3;
    const baseDelay = 1000;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Get the current best token
            let token = window.choreUtils.getAuthToken();
            
            // If no token and we have choreAuth helper, try to get one
            if (!token && window.choreAuth && window.choreAuth.getBestToken) {
                try {
                    token = await window.choreAuth.getBestToken();
                } catch (e) {
                    console.warn('Failed to get token from choreAuth:', e);
                }
            }
            
            const fetchOptions = {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    ...options.headers
                },
                credentials: 'same-origin'
            };
            
            // Add auth token if available
            if (token) {
                fetchOptions.headers['Authorization'] = `Bearer ${token}`;
            } else {
                console.warn('No authentication token available for request to:', url);
                
                // Dispatch auth error on first attempt
                if (attempt === 0) {
                    window.dispatchEvent(new CustomEvent('chores-auth-error', {
                        detail: { message: 'No authentication token available' }
                    }));
                }
            }
            
            const response = await fetch(url, fetchOptions);
            
            // Handle 401 errors
            if (response.status === 401) {
                console.warn(`Authentication failed for ${url} (attempt ${attempt + 1}/${maxRetries + 1})`);
                
                // Clear stored token on 401
                localStorage.removeItem(TOKEN_KEY);
                
                // Try to get a fresh token if we have the helper
                if (window.choreAuth && window.choreAuth.getBestToken && attempt < maxRetries) {
                    console.log('Attempting to refresh authentication...');
                    try {
                        const newToken = await window.choreAuth.getBestToken();
                        if (newToken && newToken !== token) {
                            console.log('Got fresh token, retrying request...');
                            // Exponential backoff before retry
                            const delay = baseDelay * Math.pow(2, attempt);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue; // Retry with new token
                        }
                    } catch (e) {
                        console.error('Failed to refresh token:', e);
                    }
                }
                
                // On final attempt or if refresh failed, dispatch error
                if (attempt === maxRetries) {
                    window.dispatchEvent(new CustomEvent('chores-auth-error', {
                        detail: { message: 'Authentication failed after multiple attempts' }
                    }));
                }
            }
            
            // Return response (even if it's an error, let calling code handle it)
            return response;
            
        } catch (error) {
            console.error(`Fetch error for ${url} (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
            
            // If this is the last attempt, throw the error
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Exponential backoff before retry
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Remove the complex token refresh and management functions - now handled by auth-helper
// Keep only the essential utility functions

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
        case 'Samen': return 'bg-blue-100 border-blue-400';
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

// Debug function to check token status
window.choreUtils.checkTokenStatus = async function() {
    const token = window.choreUtils.getAuthToken();
    const tokenStatus = {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 8) + '...' : 'none'
    };
    
    // Test the token
    if (token) {
        try {
            const response = await fetch('/api/config', {
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

console.log('ChoreUtils initialized with simplified authentication');