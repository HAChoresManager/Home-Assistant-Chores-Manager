/**
 * State Management for Chores Dashboard
 * Manages all application state and provides hooks for state access
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const { useState, useCallback } = React;
    
    /**
     * Custom hook for managing all application state
     * Returns state values and setters organized by category
     */
    window.ChoresApp.useAppState = function() {
        // Core State
        const [chores, setChores] = useState([]);
        const [assignees, setAssignees] = useState([]);
        const [stats, setStats] = useState({});
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [api, setApi] = useState(null); // Add API to state
        
        // UI State
        const [showTaskForm, setShowTaskForm] = useState(false);
        const [editingTask, setEditingTask] = useState(null);
        const [showUserManagement, setShowUserManagement] = useState(false);
        const [showThemeSettings, setShowThemeSettings] = useState(false);
        const [selectedDescription, setSelectedDescription] = useState(null);
        const [expandedDescriptions, setExpandedDescriptions] = useState({});
        
        // Dialog States
        const [selectedCompletion, setSelectedCompletion] = useState(null);
        const [selectedSubtaskCompletion, setSelectedSubtaskCompletion] = useState(null);
        const [showConfirmDialog, setShowConfirmDialog] = useState(false);
        const [confirmDialogData, setConfirmDialogData] = useState(null);
        
        // Success/Error States
        const [lastCompletion, setLastCompletion] = useState(null);
        const [hasAuthError, setHasAuthError] = useState(false);
        const [themeSettings, setThemeSettings] = useState(null);
        
        // Helper functions
        const clearError = useCallback(() => setError(null), []);
        const clearLastCompletion = useCallback(() => setLastCompletion(null), []);
        const cancelCompletionDialog = useCallback(() => setSelectedCompletion(null), []);
        const cancelSubtaskDialog = useCallback(() => setSelectedSubtaskCompletion(null), []);
        
        // Return organized state
        return {
            // Core state
            core: {
                chores, setChores,
                assignees, setAssignees,
                stats, setStats,
                loading, setLoading,
                error, setError,
                api, setApi  // Include api in core state
            },
            
            // UI state
            ui: {
                showTaskForm, setShowTaskForm,
                editingTask, setEditingTask,
                showUserManagement, setShowUserManagement,
                showThemeSettings, setShowThemeSettings,
                selectedDescription, setSelectedDescription,
                expandedDescriptions, setExpandedDescriptions
            },
            
            // Dialog state
            dialogs: {
                selectedCompletion, setSelectedCompletion,
                selectedSubtaskCompletion, setSelectedSubtaskCompletion,
                showConfirmDialog, setShowConfirmDialog,
                confirmDialogData, setConfirmDialogData
            },
            
            // Status state
            status: {
                lastCompletion, setLastCompletion,
                hasAuthError, setHasAuthError,
                themeSettings, setThemeSettings
            },
            
            // Helper functions
            helpers: {
                clearError,
                clearLastCompletion,
                cancelCompletionDialog,
                cancelSubtaskDialog
            }
        };
    };
    
    /**
     * Computed values based on state
     */
    window.ChoresApp.useComputedValues = function(chores, assignees) {
        // Separate tasks by completion status
        const pendingTasks = chores.filter(chore => !chore.completed_today);
        const completedTasks = chores.filter(chore => chore.completed_today);
        
        // Further categorize pending tasks
        const overdueTasks = pendingTasks.filter(c => c.overdue_days > 0);
        const todayTasks = pendingTasks.filter(c => 
            (c.is_due || c.status === 'due') && c.overdue_days === 0
        );
        const upcomingTasks = pendingTasks.filter(c => 
            !(c.is_due || c.status === 'due')
        );
        
        // Available assignees for dialogs
        const availableAssignees = assignees.length > 0
            ? assignees.filter(a => a.name !== "Wie kan").map(a => a.name)
            : ["Laura", "Martijn", "Samen"];
        
        return {
            pendingTasks,
            completedTasks,
            overdueTasks,
            todayTasks,
            upcomingTasks,
            availableAssignees
        };
    };
    
    console.log('App state management loaded');
})();