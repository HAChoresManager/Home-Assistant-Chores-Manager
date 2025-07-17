// app.js - Main application component with all business logic
// Part of the modular architecture - uses all component modules

(function(window) {
    'use strict';
    
    // Function to initialize the app when all dependencies are ready
    function initializeAppModule() {
        // Check dependencies
        if (!window.React || !window.ReactDOM || !window.choreUtils || !window.choreComponents) {
            console.error('App requires React, ReactDOM, choreUtils, and choreComponents');
            return false;
        }
        
        const h = window.React.createElement;
        const { useState, useEffect, useCallback } = window.React;
        
        /**
         * Main App Component
         */
        const App = function() {
            // State management
            const [chores, setChores] = useState([]);
            const [assignees, setAssignees] = useState([]);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            const [showForm, setShowForm] = useState(false);
            const [selectedChore, setSelectedChore] = useState(null);
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [showStats, setShowStats] = useState(false);
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [themeSettings, setThemeSettings] = useState({ primary: '#1a202c', accent: '#3b82f6' });
            const [processing, setProcessing] = useState({});
            const [lastCompletion, setLastCompletion] = useState(null);
            const [choreDescriptions, setChoreDescriptions] = useState({});
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [hasAuthError, setHasAuthError] = useState(false);
            
            // API instances
            const [api, setApi] = useState(null);
            
            // Initialize API on component mount
            useEffect(() => {
                const initApi = async () => {
                    try {
                        // Wait for ChoresAPI to be available
                        const checkInterval = setInterval(() => {
                            if (window.ChoresAPI && window.ChoresAPI.chores) {
                                clearInterval(checkInterval);
                                setApi(window.ChoresAPI);
                                console.log('API initialized successfully');
                            }
                        }, 100);
                        
                        // Timeout after 5 seconds
                        setTimeout(() => {
                            clearInterval(checkInterval);
                            if (!api) {
                                setError('Failed to initialize API');
                            }
                        }, 5000);
                    } catch (err) {
                        console.error('Error initializing API:', err);
                        setError('Failed to initialize API');
                    }
                };
                
                initApi();
            }, []);
            
            // Load data when API is ready
            useEffect(() => {
                if (api) {
                    loadData();
                    // Set up periodic refresh
                    const refreshInterval = setInterval(loadData, 30000);
                    return () => clearInterval(refreshInterval);
                }
            }, [api]);
            
            // Apply theme settings
            useEffect(() => {
                if (themeSettings) {
                    document.documentElement.style.setProperty('--theme-primary-color', themeSettings.primary);
                    document.documentElement.style.setProperty('--theme-accent-color', themeSettings.accent);
                }
            }, [themeSettings]);
            
            // Data loading function
            const loadData = useCallback(async () => {
                if (!api) return;
                
                try {
                    setLoading(true);
                    const sensorData = await api.sensor.getState();
                    
                    if (sensorData.attributes) {
                        setChores(sensorData.attributes.chores || []);
                        setAssignees(sensorData.attributes.assignees || []);
                        setLastCompletion(sensorData.attributes.last_completion || null);
                        setThemeSettings(sensorData.attributes.theme || { primary: '#1a202c', accent: '#3b82f6' });
                    } else {
                        setChores([]);
                        setAssignees([]);
                    }
                    
                    setError(null);
                    setHasAuthError(false);
                } catch (err) {
                    console.error('Error loading data:', err);
                    
                    if (err.message && err.message.includes('401')) {
                        setHasAuthError(true);
                        setError('Authentication error. Please check your Home Assistant token.');
                    } else {
                        setError('Failed to load data');
                    }
                } finally {
                    setLoading(false);
                }
            }, [api]);
            
            // Error handler
            const handleError = useCallback((err) => {
                console.error('Operation error:', err);
                if (err.message && err.message.includes('401')) {
                    setHasAuthError(true);
                    setError('Authentication error. Please check your Home Assistant token.');
                } else {
                    setError(err.message || 'An error occurred');
                }
            }, []);
            
            // Chore management functions
            const markDone = async (choreId, completedBy) => {
                setProcessing(prev => ({ ...prev, [choreId]: true }));
                try {
                    await window.ChoresAPI.chores.markDone(choreId, completedBy);
                    await loadData();
                } catch (err) {
                    console.error('Error marking chore as done:', err);
                    handleError(err);
                } finally {
                    setProcessing(prev => ({ ...prev, [choreId]: false }));
                }
            };

            const handleEdit = (chore) => {
                setSelectedChore(chore);
                setShowForm(true);
            };

            const saveChore = async (choreData) => {
                try {
                    // Ensure required fields are present
                    const normalizedData = {
                        ...choreData,
                        frequency_days: choreData.frequency_days || 7,
                        priority: choreData.priority || 'Middel',
                        duration: choreData.duration || 15,
                        assigned_to: choreData.assigned_to || assignees[0]?.name || 'Wie kan'
                    };

                    // If updating, include the chore_id
                    if (selectedChore && (selectedChore.chore_id || selectedChore.id)) {
                        normalizedData.chore_id = selectedChore.chore_id || selectedChore.id;
                    }

                    // The addChore API handles both add and update
                    await window.ChoresAPI.chores.addChore(normalizedData);
                    
                    await loadData();
                    setShowForm(false);
                    setSelectedChore(null);
                } catch (err) {
                    console.error('Error saving chore:', err);
                    handleError(err);
                }
            };

            const deleteChore = async (choreId) => {
                try {
                    await window.ChoresAPI.chores.deleteChore(choreId);
                    await loadData();
                    setShowForm(false);
                    setSelectedChore(null);
                } catch (err) {
                    console.error('Error deleting chore:', err);
                    handleError(err);
                }
            };

            const resetCompletion = async (choreId) => {
                try {
                    await window.ChoresAPI.chores.resetChore(choreId);
                    await loadData();
                } catch (err) {
                    console.error('Error resetting chore:', err);
                    handleError(err);
                }
            };

            const undoLastCompletion = async () => {
                if (!lastCompletion) return;
                
                try {
                    await window.ChoresAPI.chores.resetChore(lastCompletion.chore_id);
                    await loadData();
                } catch (err) {
                    console.error('Error undoing completion:', err);
                    handleError(err);
                }
            };
            
            // User management
            const saveUser = async (userId, name, color) => {
                try {
                    await window.ChoresAPI.chores.addUser(userId, name, color);
                    await loadData();
                    setShowUserManagement(false);
                } catch (err) {
                    console.error('Error saving user:', err);
                    handleError(err);
                }
            };
            
            // Theme management
            const saveTheme = async (primary, accent) => {
                try {
                    await window.ChoresAPI.chores.saveTheme(primary, accent);
                    setThemeSettings({ primary, accent });
                    await loadData();
                    setShowThemeSettings(false);
                } catch (err) {
                    console.error('Error saving theme:', err);
                    handleError(err);
                }
            };
            
            // Description management
            const updateDescription = async (choreId, description) => {
                try {
                    await window.ChoresAPI.chores.updateDescription(choreId, description);
                    await loadData();
                    setSelectedDescription(null);
                } catch (err) {
                    console.error('Error updating description:', err);
                    handleError(err);
                }
            };
            
            const toggleTaskDescription = (choreId, show) => {
                setChoreDescriptions(prev => ({
                    ...prev,
                    [choreId]: show
                }));
            };
            
            // Subtask management
            const markSubtaskDone = async (choreId, subtaskIndex, completedBy) => {
                try {
                    const chore = chores.find(c => (c.chore_id || c.id) === choreId);
                    if (!chore || !chore.subtasks || !chore.subtasks[subtaskIndex]) return;
                    
                    const subtask = chore.subtasks[subtaskIndex];
                    if (subtask.id) {
                        await window.ChoresAPI.chores.completeSubtask(subtask.id, completedBy);
                        await loadData();
                    }
                } catch (err) {
                    console.error('Error completing subtask:', err);
                    handleError(err);
                }
            };
            
            // Calculate stats
            const completedToday = chores.filter(c => c.completed_today).length;
            
            // Render
            if (loading && chores.length === 0) {
                return h('div', { className: 'flex justify-center items-center min-h-screen' },
                    h(window.choreComponents.Loading, { message: 'Taken laden...' })
                );
            }
            
            return h('div', null,
                // Header
                h('div', { className: 'flex justify-between items-center mb-6' },
                    h('h1', { className: 'text-2xl font-bold' }, 'Taken Dashboard'),
                    h('div', { className: 'flex space-x-2' },
                        h('button', {
                            onClick: () => setShowStats(!showStats),
                            className: `rounded-full p-2 ${showStats ? 'bg-blue-500 text-white' : 'bg-gray-200'}`
                        }, '📊'),
                        h('button', {
                            onClick: () => setShowUserManagement(true),
                            className: 'rounded-full p-2 bg-gray-200 hover:bg-gray-300'
                        }, '👥'),
                        h('button', {
                            onClick: () => setShowThemeSettings(true),
                            className: 'rounded-full p-2 bg-gray-200 hover:bg-gray-300'
                        }, '🎨'),
                        h('button', {
                            onClick: () => {
                                setSelectedChore(null);
                                setShowForm(true);
                            },
                            className: 'rounded-full p-2 bg-blue-500 text-white hover:bg-blue-600'
                        }, '+')
                    )
                ),
                
                // Auth error banner
                hasAuthError && h('div', { className: 'auth-error-banner' },
                    h('span', null, '⚠️ Authentication error. Please check your Home Assistant token in the URL.'),
                    h('button', {
                        onClick: () => setHasAuthError(false)
                    }, '✕')
                ),
                
                // Error display
                error && !hasAuthError && h(window.choreComponents.ErrorMessage, {
                    message: error,
                    onRetry: loadData,
                    onDismiss: () => setError(null)
                }),
                
                // Stats view
                showStats && h(window.choreComponents.StatsCard, {
                    chores: chores,
                    assignees: assignees
                }),
                
                // Main content
                !showStats && h('div', null,
                    chores.length === 0 
                        ? h(window.choreComponents.EmptyState, {
                            message: 'Geen taken gevonden',
                            subMessage: 'Klik op + om een nieuwe taak toe te voegen'
                        })
                        : chores.map(chore => 
                            h(window.choreComponents.TaskCard, {
                                key: chore.chore_id || chore.id,
                                chore: chore,
                                onMarkDone: markDone,
                                onEdit: handleEdit,
                                onShowDescription: setSelectedDescription,
                                onToggleDescription: toggleTaskDescription,
                                assignees: assignees,
                                onMarkSubtaskDone: markSubtaskDone,
                                isProcessing: processing[chore.chore_id || chore.id] || false,
                                showDescription: choreDescriptions[chore.chore_id || chore.id] || false
                            })
                        )
                ),

                // Undo button - only show if there are completed tasks
                completedToday > 0 && h('div', { className: 'mt-6 text-center' },
                    h('button', {
                        className: "bg-gray-100 border border-gray-300 hover:bg-gray-200 task-action-button rounded px-4 py-2 transition-colors",
                        onClick: undoLastCompletion
                    },
                        h('span', { className: "mr-2" }, "↶"),
                        "Laatste voltooiing ongedaan maken"
                    )
                ),

                // FIXED: Modals with proper wrapper for TaskForm
                showForm && h('div', {
                    className: "modal-container",
                    onClick: () => {
                        setShowForm(false);
                        setSelectedChore(null);
                    }
                },
                    h('div', {
                        className: "modal-content",
                        onClick: (e) => e.stopPropagation()
                    },
                        h(window.choreComponents.TaskForm, {
                            onSubmit: saveChore,
                            onDelete: deleteChore,
                            onCancel: () => {
                                setShowForm(false);
                                setSelectedChore(null);
                            },
                            onResetCompletion: resetCompletion,
                            initialData: selectedChore,
                            assignees: assignees
                        })
                    )
                ),

                showUserManagement && h(window.choreComponents.UserManagement, {
                    users: assignees,
                    onSave: saveUser,
                    onClose: () => setShowUserManagement(false)
                }),

                showThemeSettings && h('div', {
                    className: "modal-container",
                    onClick: () => setShowThemeSettings(false)
                },
                    h('div', {
                        className: "modal-content max-w-lg",
                        onClick: (e) => e.stopPropagation()
                    },
                        h(window.choreComponents.ThemeSettings, {
                            onSave: saveTheme,
                            currentTheme: themeSettings
                        })
                    )
                ),

                selectedDescription && h('div', {
                    className: "modal-container",
                    onClick: () => setSelectedDescription(null)
                },
                    h('div', {
                        className: "modal-content max-w-lg",
                        onClick: (e) => e.stopPropagation()
                    },
                        h(window.choreComponents.TaskDescription, {
                            description: selectedDescription.description,
                            choreId: selectedDescription.id,
                            onSave: updateDescription,
                            onClose: () => setSelectedDescription(null),
                            inTaskCard: false
                        })
                    )
                )
            );
        };

        // Initialize the app
        function initApp() {
            const root = document.getElementById('root');
            if (!root) {
                console.error('Root element not found');
                return;
            }

            const rootElement = ReactDOM.createRoot(root);
            rootElement.render(h(App));
            console.log('Chores Dashboard App initialized successfully');
        }

        // Export to global scope
        window.ChoresApp = {
            App,
            initApp
        };

        console.log('App component loaded successfully');
        return true;
    }

    // Wait for choreComponentsReady event or check if components are already loaded
    function checkIfReady() {
        return window.choreComponents && 
               window.React && 
               window.ReactDOM &&
               window.choreUtils &&
               window.ChoresAPI;
    }

    // Try to initialize immediately if everything is ready
    if (checkIfReady()) {
        if (initializeAppModule()) {
            console.log('App loaded successfully (immediate)');
        }
    } else {
        // Otherwise wait for the ready event
        window.addEventListener('choreComponentsReady', function() {
            if (initializeAppModule()) {
                console.log('App loaded successfully (on event)');
            }
        });

        // Also listen for API ready event
        window.addEventListener('choreAPIReady', function() {
            if (checkIfReady() && initializeAppModule()) {
                console.log('App loaded successfully (on API ready)');
            }
        });
    }

})(window);