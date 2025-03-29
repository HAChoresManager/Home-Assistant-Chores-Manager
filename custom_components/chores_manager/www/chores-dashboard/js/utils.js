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
    if (!chore.last_done) return false; // Changed: if no last_done, it's not overdue but due today
    
    const nextDue = window.choreUtils.calculateNextDueDate(chore);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Only consider tasks overdue if they were due BEFORE today
    return nextDue < today;
};

window.choreUtils.isDueToday = function(chore) {
    if (!chore || !chore.chore_id || !chore.name || chore.name.trim() === '') return false;
    
    // Never completed tasks are due today (not overdue)
    if (!chore.last_done) return true;
    
    const nextDue = window.choreUtils.calculateNextDueDate(chore);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    return nextDue >= today && nextDue < tomorrow;
};

window.choreUtils.getBackgroundColor = function(assignedTo, assigneesList = []) {
    // First try to find the user in the assignees list to get custom color
    const assignee = assigneesList.find(a => a.name === assignedTo);
    if (assignee && assignee.color) {
        // Convert hex to light background with matching border
        const hexColor = assignee.color;
        
        // Create lighter version for background (20% opacity)
        const bgColor = hexColor + "33"; // 33 is 20% opacity in hex
        
        // Create border version (50% opacity)
        const borderColor = hexColor + "88"; // 88 is 50% opacity in hex
        
        return `border border-solid bg-white`; 
        // Custom style will be applied separately
    }
    
    // Fallback to default colors
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

// Authentication helper function with enhanced authentication methods
window.choreUtils.fetchWithAuth = async function(url, options = {}) {
    // Clone options to avoid modifying the original
    const fetchOptions = { 
        ...options,
        credentials: 'include' // Changed from 'same-origin' to 'include'
    };
    
    try {
        // APPROACH 1: Try to extract token from Home Assistant frontend
        if (window.parent) {
            try {
                // Check if hassConnection exists (newer versions of HA)
                if (window.parent.hassConnection && 
                    window.parent.hassConnection.auth && 
                    window.parent.hassConnection.auth.data && 
                    window.parent.hassConnection.auth.data.access_token) {
                    
                    fetchOptions.headers = {
                        ...fetchOptions.headers,
                        Authorization: `Bearer ${window.parent.hassConnection.auth.data.access_token}`
                    };
                    
                    const resp = await fetch(url, fetchOptions);
                    if (resp.ok) return resp;
                }
                
                // Try accessing 'hass' object directly (alternate method)
                if (window.parent.hass && window.parent.hass.auth) {
                    fetchOptions.headers = {
                        ...fetchOptions.headers,
                        Authorization: `Bearer ${window.parent.hass.auth.access_token}`
                    };
                    
                    const resp = await fetch(url, fetchOptions);
                    if (resp.ok) return resp;
                }
            } catch (e) {
                console.log('Error accessing auth from parent:', e);
            }
        }
        
        // APPROACH 2: Simple credentials-based auth
        const resp = await fetch(url, fetchOptions);
        return resp;
    } catch (e) {
        console.error("Fetch error:", e);
        throw e;
    }
};