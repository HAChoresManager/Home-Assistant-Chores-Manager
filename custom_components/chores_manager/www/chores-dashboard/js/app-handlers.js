/**
 * Event Handlers for Chores Dashboard
 * Contains all business logic and event handling functions
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const { useCallback, useEffect, useRef } = React;
    
    /**
     * Hook that provides all event handlers for the app
     */
    window.ChoresApp.useEventHandlers = function(state) {
        const { core, ui, dialogs, status, helpers } = state;
        
        // Use refs to store the latest versions of functions without causing re-renders
        const loadDataRef = useRef();
        const loadThemeRef = useRef();
        
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
                
                // Call getSensorState without parameters (as defined in base.js)
                const state = await core.api.getSensorState();
                console.log('Loaded state:', state);
                
                if (state && state.attributes) {
                    const { chores = [], assignees = [], stats = {} } = state.attributes;
                    
                    core.setChores(chores);
                    core.setAssignees(assignees);
                    core.setStats(stats);
                    
                    helpers.clearError();
                }
            } catch (err) {
                handleError(err);
            } finally {
                core.setLoading(false);
            }
        }, [core, helpers, handleError]);
        
        // Load theme
        const loadTheme = useCallback(async () => {
            if (!core.api) return;
            
            try {
                const theme = await core.api.theme.get();
                if (theme) {
                    status.setThemeSettings(theme);
                    
                    // Apply theme
                    const root = document.documentElement;
                    root.style.setProperty('--theme-background', theme.backgroundColor);
                    root.style.setProperty('--theme-card', theme.cardColor);
                    root.style.setProperty('--theme-primary-text', theme.primaryTextColor);
                    root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor);
                }
            } catch (err) {
                console.error('Failed to load theme:', err);
                // Don't show error to user for theme loading
            }
        }, [core.api, status.setThemeSettings]);
        
        // Update refs with latest function versions
        useEffect(() => {
            loadDataRef.current = loadData;
            loadThemeRef.current = loadTheme;
        });
        
        // Initial data load and refresh interval - FIXED: No dependencies on functions
        useEffect(() => {
            if (core.api) {
                // Initial load
                loadDataRef.current();
                loadThemeRef.current();
                
                // Set up refresh interval using refs to avoid dependency issues
                const interval = setInterval(() => {
                    loadDataRef.current();
                }, 30000);
                
                return () => clearInterval(interval);
            }
        }, [core.api]); // Only depend on core.api, not the functions
        
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
        }, [core, dialogs, status, handleError, loadData]);
        
        // Completion confirm handler
        const handleCompletionConfirm = useCallback(async (choreId, userId) => {
            dialogs.setSelectedCompletion(null);
            await handleMarkDone(choreId, userId);
        }, [dialogs, handleMarkDone]);
        
        // Subtask completion handlers
        const handleMarkSubtaskDone = useCallback((chore, subtask) => {
            dialogs.setSelectedSubtaskCompletion({
                chore,
                subtask,
                defaultUser: chore.assigned_to || core.assignees[0]?.name || 'Wie kan'
            });
        }, [core.assignees, dialogs]);
        
        const handleSubtaskCompletionConfirm = useCallback(async (selectedSubtasks, completedBy) => {
            if (!core.api || selectedSubtasks.length === 0) return;
            
            dialogs.setSelectedSubtaskCompletion(null);
            
            try {
                // Complete each selected subtask
                for (const subtaskId of selectedSubtasks) {
                    await core.api.chores.completeSubtask(subtaskId, completedBy);
                }
                
                status.setLastCompletion({ 
                    subtaskCount: selectedSubtasks.length, 
                    person: completedBy 
                });
                
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, dialogs, status, handleError, loadData]);
        
        // Task form handlers - FIXED: Use correct API method names
        const handleTaskFormSubmit = useCallback(async (task) => {
            if (!core.api) return;
            
            try {
                // addChore handles both add and update based on whether chore_id exists
                if (ui.editingTask) {
                    // Include the chore_id in the task data for updating
                    const taskData = {
                        ...task,
                        chore_id: ui.editingTask.id || ui.editingTask.chore_id
                    };
                    await core.api.chores.addChore(taskData);
                } else {
                    // For new tasks, just pass the task data without chore_id
                    await core.api.chores.add(task);
                }
                
                ui.setShowTaskForm(false);
                ui.setEditingTask(null);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, ui, handleError, loadData]);
        
        const handleEditTask = useCallback((task) => {
            ui.setEditingTask(task);
            ui.setShowTaskForm(true);
        }, [ui]);
        
        const handleDeleteTask = useCallback(async (choreId) => {
            if (!core.api) return;
            
            dialogs.setConfirmDialogData({
                title: 'Taak verwijderen',
                message: 'Weet je zeker dat je deze taak wilt verwijderen?',
                onConfirm: async () => {
                    try {
                        await core.api.chores.delete(choreId);
                        dialogs.setShowConfirmDialog(false);
                        dialogs.setConfirmDialogData(null);
                        await loadData();
                    } catch (err) {
                        handleError(err);
                    }
                }
            });
            dialogs.setShowConfirmDialog(true);
        }, [core.api, dialogs, handleError, loadData]);
        
        // Reset completion handler - FIXED: Use correct method name
        const handleResetCompletion = useCallback(async (choreId) => {
            if (!core.api) return;
            
            try {
                await core.api.chores.reset(choreId);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, handleError, loadData]);
        
        // User management handlers
        const handleSaveUsers = useCallback(async (users) => {
            if (!core.api) return;
            
            try {
                // Process user updates
                for (const user of users) {
                    if (user.deleted) {
                        await core.api.users.delete(user.id);
                    } else if (user.isNew || user.modified) {
                        await core.api.users.add(user);
                    }
                }
                
                ui.setShowUserManagement(false);
                await loadData();
            } catch (err) {
                handleError(err);
            }
        }, [core.api, ui, handleError, loadData]);
        
        // Theme save handler
        const handleSaveTheme = useCallback(async (theme) => {
            if (!core.api) return;
            
            try {
                await core.api.theme.save(theme);
                
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