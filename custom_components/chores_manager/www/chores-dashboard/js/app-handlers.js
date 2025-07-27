/**
 * Event Handlers for Chores Dashboard
 * Contains all business logic and event handling functions
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const { useCallback, useEffect } = React;
    
    /**
     * Hook that provides all event handlers for the app
     */
    window.ChoresApp.useEventHandlers = function(state) {
        const { core, ui, dialogs, status, helpers } = state;
        
        // Error handler
        const handleError = useCallback((err) => {
            console.error('App error:', err);
            core.setError(err.message || 'Er is een onbekende fout opgetreden');
            
            // Check for auth errors
            if (err.message?.includes('401') || err.message?.includes('authentication')) {
                status.setHasAuthError(true);
            }
        }, [core, status]);
        
        // Initialize API
        useEffect(() => {
            const initializeAPI = async () => {
                try {
                    if (window.ChoresAPI && window.ChoresAPI.initialize) {
                        console.log('Initializing Chores Dashboard App');

                        const apiMethods = Object.keys(window.ChoresAPI);
                        console.log('ChoresAPI available methods:', apiMethods);

                        await window.ChoresAPI.initialize();
                        console.log('API initialized successfully');

                        core.setApi(window.ChoresAPI);
                    } else {
                        throw new Error('ChoresAPI not available');
                    }
                } catch (error) {
                    console.error('Failed to initialize API:', error);
                    handleError(error);
                    core.setLoading(false);
                }
            };

            // Wait for the API ready event to avoid race conditions
            const onApiReady = () => initializeAPI();
            window.addEventListener('chores-api-ready', onApiReady);

            // If the API is already available, initialize immediately
            if (window.ChoresAPI && window.ChoresAPI.initialize) {
                initializeAPI();
            }

            return () => {
                window.removeEventListener('chores-api-ready', onApiReady);
            };
        }, [handleError, core]);
        
        // Load data
        const loadData = useCallback(async () => {
            if (!core.api) return;
            
            try {
                core.setLoading(true);
                console.log('Loading data with API:', core.api);
                
                const state = await core.api.getSensorState('sensor.chores_overview');
                console.log('Loaded state:', state);
                
                if (state && state.attributes) {
                    const { chores = [], assignees = [], stats = {} } = state.attributes;
                    
                    const processedChores = chores.map(chore => ({
                        ...chore,
                        isProcessing: false
                    }));
                    
                    core.setChores(processedChores);
                    core.setAssignees(assignees);
                    core.setStats(stats);
                }
                
            } catch (err) {
                handleError(err);
            } finally {
                core.setLoading(false);
            }
        }, [core, handleError]);
        
        // Theme loading
        const loadTheme = useCallback(async () => {
            if (!core.api || !core.api.theme) return;
            
            try {
                const theme = await core.api.theme.get();
                if (theme) {
                    status.setThemeSettings(theme);
                    
                    // Apply theme
                    const root = document.documentElement;
                    if (theme.backgroundColor) root.style.setProperty('--theme-background', theme.backgroundColor);
                    if (theme.cardColor) root.style.setProperty('--theme-card', theme.cardColor);
                    if (theme.primaryTextColor) root.style.setProperty('--theme-primary-text', theme.primaryTextColor);
                    if (theme.secondaryTextColor) root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor);
                }
            } catch (err) {
                console.error('Theme loading error:', err);
            }
        }, [core.api, status]);
        
        // Initial data load
        useEffect(() => {
            if (core.api) {
                loadData();
                loadTheme();
                
                // Set up refresh interval
                const interval = setInterval(loadData, 30000);
                return () => clearInterval(interval);
            }
        }, [core.api, loadData, loadTheme]);
        
        // Task mark done handler
        const handleMarkDone = useCallback(async (choreId, userId) => {
            if (!core.api) return;
            
            // If userId not provided and multiple assignees, show dialog
            if (!userId && core.assignees.length > 1) {
                dialogs.setSelectedCompletion({ 
                    choreId, 
                    defaultUser: core.assignees[0]?.name || 'Wie kan' 
                });
                return;
            }
            
            // Set processing state
            core.setChores(prevChores => 
                prevChores.map(chore => 
                    (chore.id || chore.chore_id) === choreId 
                        ? { ...chore, isProcessing: true }
                        : chore
                )
            );
            
            try {
                await core.api.chores.markDone(choreId, userId || core.assignees[0]?.name || 'Wie kan');
                status.setLastCompletion({ 
                    choreId, 
                    person: userId || core.assignees[0]?.name || 'Wie kan' 
                });
                await loadData();
            } catch (err) {
                handleError(err);
            } finally {
                // Clear processing state
                core.setChores(prevChores => 
                    prevChores.map(chore => 
                        (chore.id || chore.chore_id) === choreId 
                            ? { ...chore, isProcessing: false }
                            : chore
                    )
                );
            }
        }, [core, dialogs, status, loadData, handleError]);
        
        // Completion confirmation handler
        const handleCompletionConfirm = useCallback(async (selectedUser) => {
            if (dialogs.selectedCompletion) {
                await handleMarkDone(dialogs.selectedCompletion.choreId, selectedUser);
                dialogs.setSelectedCompletion(null);
            }
        }, [dialogs, handleMarkDone]);
        
        // Subtask completion handler
        const handleMarkSubtaskDone = useCallback(async (choreId, subtaskIndex, userId) => {
            if (!core.api) return;
            
            // If no userId provided and multiple assignees, show selection dialog
            if (!userId && core.assignees.length > 1) {
                const chore = core.chores.find(c => (c.id || c.chore_id) === choreId);
                dialogs.setSelectedSubtaskCompletion({ 
                    chore, 
                    subtaskIndex, 
                    defaultUser: core.assignees[0]?.name || 'Wie kan' 
                });
                return;
            }
            
            try {
                await core.api.chores.completeSubtask(subtaskIndex, userId || core.assignees[0]?.name || 'Wie kan');
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core, dialogs, loadData, handleError]);
        
        // Subtask completion confirmation handler
        const handleSubtaskCompletionConfirm = useCallback(async (subtaskIndex, selectedUser) => {
            if (dialogs.selectedSubtaskCompletion) {
                await handleMarkSubtaskDone(
                    dialogs.selectedSubtaskCompletion.chore.id || dialogs.selectedSubtaskCompletion.chore.chore_id,
                    subtaskIndex,
                    selectedUser
                );
                dialogs.setSelectedSubtaskCompletion(null);
            }
        }, [dialogs, handleMarkSubtaskDone]);
        
        // Task form submission
        const handleTaskFormSubmit = useCallback(async (formData) => {
            if (!core.api) return;
            
            try {
                if (ui.editingTask) {
                    await core.api.chores.updateDescription(ui.editingTask.chore_id || ui.editingTask.id, formData);
                } else {
                    await core.api.chores.addChore(formData);
                }
                
                ui.setShowTaskForm(false);
                ui.setEditingTask(null);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, ui, loadData, handleError]);
        
        // Task editing
        const handleEditTask = useCallback((chore) => {
            ui.setEditingTask(chore);
            ui.setShowTaskForm(true);
        }, [ui]);
        
        // Task deletion
        const handleDeleteTask = useCallback(async (choreId) => {
            if (!core.api) return;
            
            try {
                await core.api.chores.deleteChore(choreId);
                ui.setShowTaskForm(false);
                ui.setEditingTask(null);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, ui, loadData, handleError]);
        
        // Completion reset
        const handleResetCompletion = useCallback(async (choreId) => {
            if (!core.api) return;
            
            try {
                await core.api.chores.resetChore(choreId);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, loadData, handleError]);
        
        // User management
        const handleSaveUsers = useCallback(async (users) => {
            try {
                core.setAssignees(users);
                ui.setShowUserManagement(false);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core, ui, loadData, handleError]);
        
        // Theme changes
        const handleSaveTheme = useCallback(async (theme) => {
            if (!core.api) return;
            
            try {
                if (core.api.theme && core.api.theme.save) {
                    await core.api.theme.save(theme.primaryColor, theme.accentColor);
                }
                
                status.setThemeSettings(theme);
                // Apply theme immediately
                const root = document.documentElement;
                root.style.setProperty('--theme-background', theme.backgroundColor);
                root.style.setProperty('--theme-card', theme.cardColor);
                root.style.setProperty('--theme-primary-text', theme.primaryTextColor);
                root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor);
                
                ui.setShowThemeSettings(false);
            } catch (err) {
                handleError(err);
            }
        }, [core.api, status, ui, handleError]);
        
        // Description toggle
        const handleToggleDescription = useCallback((choreId, expanded) => {
            ui.setExpandedDescriptions(prev => ({
                ...prev,
                [choreId]: expanded
            }));
            
            // If expanded, set selected description for modal
            if (expanded) {
                const chore = core.chores.find(c => (c.id || c.chore_id) === choreId);
                if (chore && chore.description) {
                    ui.setSelectedDescription({
                        id: choreId,
                        name: chore.name,
                        description: chore.description
                    });
                }
            }
        }, [core.chores, ui]);
        
        return {
            handleError,
            loadData,
            loadTheme,
            handleMarkDone,
            handleCompletionConfirm,
            handleMarkSubtaskDone,
            handleSubtaskCompletionConfirm,
            handleTaskFormSubmit,
            handleEditTask,
            handleDeleteTask,
            handleResetCompletion,
            handleSaveUsers,
            handleSaveTheme,
            handleToggleDescription
        };
    };
    
    console.log('App event handlers loaded');
})();