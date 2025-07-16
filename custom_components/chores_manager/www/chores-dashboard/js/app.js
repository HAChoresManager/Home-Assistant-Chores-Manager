/**
 * Main App component for the Chores Manager
 * Handles the primary application logic and state management
 */

(function() {
    'use strict';

    // Function to initialize the app when all dependencies are ready
    function initializeAppModule() {
        // Check dependencies
        if (!window.React || !window.ReactDOM || !window.choreUtils || !window.choreComponents) {
            console.error('App requires React, ReactDOM, choreUtils, and choreComponents');
            return false;
        }

        const h = React.createElement;
        const { useState, useEffect, useCallback, useRef } = React;

        /**
         * Auth error banner component
         */
        const AuthErrorBanner = function({ onRefresh }) {
            return h('div', {
                className: 'auth-error-banner bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded'
            }, 
                h('div', { className: 'flex items-center' },
                    h('div', { className: 'mr-2' }, '⚠️'),
                    h('div', null, 'Authentication error. Please refresh your session.'),
                    h('button', {
                        className: 'ml-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700',
                        onClick: onRefresh
                    }, 'Refresh Page')
                )
            );
        };

        /**
         * Main App component
         */
        const App = function() {
            // State management
            const [isLoading, setIsLoading] = useState(true);
            const [chores, setChores] = useState([]);
            const [assignees, setAssignees] = useState([]);
            const [stats, setStats] = useState({});
            const [error, setError] = useState(null);
            const [authError, setAuthError] = useState(false);
            const [showForm, setShowForm] = useState(false);
            const [selectedChore, setSelectedChore] = useState(null);
            const [processing, setProcessing] = useState({});
            const [lastRefresh, setLastRefresh] = useState(Date.now());
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [themeSettings, setThemeSettings] = useState({});
            const [isRefreshing, setIsRefreshing] = useState(false);

            // Track task description states
            const [taskDescriptionStates, setTaskDescriptionStates] = useState({});

            // Ref for auto-refresh interval
            const refreshIntervalRef = useRef(null);

            // Load initial data
            useEffect(() => {
                loadData();
                setupAutoRefresh();
                return () => {
                    if (refreshIntervalRef.current) {
                        clearInterval(refreshIntervalRef.current);
                    }
                };
            }, []);

            // Setup auto-refresh
            const setupAutoRefresh = () => {
                if (refreshIntervalRef.current) {
                    clearInterval(refreshIntervalRef.current);
                }
                // Refresh every 2 minutes
                refreshIntervalRef.current = setInterval(() => {
                    loadData();
                }, 120000);
            };

            // Load all data
            const loadData = async () => {
                try {
                    // Get all data from the sensor state
                    const sensorData = await window.ChoresAPI.getSensorState();
                    
                    // Extract data from sensor attributes
                    const attributes = sensorData.attributes || {};
                    const choresData = attributes.overdue_tasks || [];
                    const assigneesData = attributes.assignees || [];
                    const statsData = attributes.stats || {};
                    const themeData = attributes.theme_settings || {};
                    
                    // Calculate additional stats
                    const completedToday = attributes.completed_today || 0;
                    const overdueCount = choresData.filter(c => 
                        (c.is_overdue || c.is_due_today) && (!c.last_done || !window.choreUtils.isToday(c.last_done))
                    ).length;
                    const upcomingCount = choresData.filter(c => 
                        c.days_until_due > 0 && c.days_until_due <= 7
                    ).length;
                    
                    const enrichedStats = {
                        ...statsData,
                        completedToday,
                        overdueCount,
                        upcomingCount,
                        totalChores: choresData.length
                    };

                    setChores(choresData);
                    setAssignees(assigneesData);
                    setStats(enrichedStats);
                    
                    if (themeData) {
                        setThemeSettings(themeData);
                        applyTheme(themeData);
                    }
                    
                    setIsLoading(false);
                    setAuthError(false);
                    setError(null);
                    setLastRefresh(Date.now());
                } catch (err) {
                    console.error('Error loading data:', err);
                    setIsLoading(false);
                    handleError(err);
                }
            };

            // Refresh data
            const refreshData = async () => {
                setIsRefreshing(true);
                await loadData();
                setIsRefreshing(false);
            };

            // Save user settings
            const saveUser = async (usersData) => {
                try {
                    // Save each user individually
                    for (const user of usersData) {
                        await window.ChoresAPI.users.addUser(user);
                    }
                    await loadData();
                    setShowUserManagement(false);
                } catch (err) {
                    console.error('Error saving users:', err);
                    handleError(err);
                }
            };

            // Save theme settings
            const saveTheme = async (theme) => {
                try {
                    await window.ChoresAPI.theme.saveTheme(theme);
                    setThemeSettings(theme);
                    applyTheme(theme);
                    setShowThemeSettings(false);
                } catch (err) {
                    console.error('Error saving theme:', err);
                    handleError(err);
                }
            };

            const applyTheme = (theme) => {
                if (theme && typeof theme === 'object') {
                    const root = document.documentElement;
                    root.style.setProperty('--theme-background', theme.backgroundColor || '#ffffff');
                    root.style.setProperty('--theme-card-color', theme.cardColor || '#f8f8f8');
                    root.style.setProperty('--theme-primary-text', theme.primaryTextColor || '#000000');
                    root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor || '#333333');
                }
            };

            // Error handling
            const handleError = (error) => {
                const errorMessage = error.message || 'An error occurred';
                if (errorMessage.includes('401') || errorMessage.includes('Authentication')) {
                    setAuthError(true);
                } else {
                    setError(errorMessage);
                    setTimeout(() => setError(null), 5000);
                }
            };

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

            const forceDue = async (choreId) => {
                try {
                    await window.ChoresAPI.chores.forceDue(choreId);
                    await loadData();
                } catch (err) {
                    console.error('Error forcing chore due:', err);
                    handleError(err);
                }
            };

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

            const completeSubtasks = async (subtaskIds, person) => {
                try {
                    const results = await window.ChoresAPI.chores.completeSubtasks(subtaskIds, person);
                    await loadData();
                    return results;
                } catch (err) {
                    console.error('Error completing subtasks:', err);
                    handleError(err);
                    throw err;
                }
            };

            const markSubtaskDone = async (choreId, subtaskIndex, completedBy) => {
                try {
                    const chore = chores.find(c => (c.chore_id || c.id) === choreId);
                    if (chore && chore.subtasks && chore.subtasks[subtaskIndex]) {
                        const subtaskId = chore.subtasks[subtaskIndex].id;
                        await completeSubtasks([subtaskId], completedBy);
                    }
                } catch (err) {
                    console.error('Error marking subtask as done:', err);
                    handleError(err);
                }
            };

            // Undo last completion
            const undoLastCompletion = async () => {
                try {
                    const completedChores = chores.filter(c => 
                        c.last_done && window.choreUtils.isToday(c.last_done)
                    ).sort((a, b) => new Date(b.last_done) - new Date(a.last_done));
                    
                    if (completedChores.length > 0) {
                        await resetCompletion(completedChores[0].chore_id || completedChores[0].id);
                    }
                } catch (err) {
                    console.error('Error undoing completion:', err);
                    handleError(err);
                }
            };

            // Toggle task description
            const toggleTaskDescription = (choreId, isOpen) => {
                setTaskDescriptionStates(prev => ({
                    ...prev,
                    [choreId]: isOpen
                }));
            };

            // Calculate statistics
            const completedToday = chores.filter(c => 
                c.last_done && window.choreUtils.isToday(c.last_done)
            ).length;
            const overdueCount = chores.filter(c => 
                window.choreUtils.isDueOrOverdue(c) && (!c.last_done || !window.choreUtils.isToday(c.last_done))
            ).length;

            // Render loading state
            if (isLoading) {
                return h(window.choreComponents.Loading, { message: 'Dashboard laden...' });
            }

            // Render auth error
            if (authError) {
                return h(AuthErrorBanner, { onRefresh: () => window.location.reload() });
            }

            // Main render
            return h('div', { className: 'app-container min-h-screen' },
                // Header
                h('div', { className: 'header-container' },
                    h('div', { className: 'header' },
                        h('h1', { className: 'text-2xl font-bold' }, 'Huishoudelijke Taken'),
                        h('div', { className: 'header-actions' },
                            h('button', {
                                className: `icon-button ${isRefreshing ? 'animate-spin' : ''}`,
                                onClick: refreshData,
                                title: 'Vernieuwen'
                            }, '↻'),
                            h('button', {
                                className: 'icon-button',
                                onClick: () => setShowThemeSettings(true),
                                title: 'Thema-instellingen'
                            }, '🎨'),
                            h('button', {
                                className: 'icon-button',
                                onClick: () => setShowUserManagement(true),
                                title: 'Gebruikers beheren'
                            }, '👥'),
                            h('button', {
                                className: 'icon-button',
                                onClick: () => {
                                    setSelectedChore(null);
                                    setShowForm(true);
                                },
                                title: 'Nieuwe taak'
                            }, '+')
                        )
                    ),

                    // Stats cards
                    h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6' },
                        h(window.choreComponents.StatsCard, {
                            label: 'Vandaag voltooid',
                            value: completedToday,
                            color: 'green'
                        }),
                        h(window.choreComponents.StatsCard, {
                            label: 'Achterstallig',
                            value: overdueCount,
                            color: 'red'
                        }),
                        h(window.choreComponents.StatsCard, {
                            label: 'Binnenkort',
                            value: stats.upcomingCount || 0,
                            color: 'yellow'
                        }),
                        h(window.choreComponents.StatsCard, {
                            label: 'Totaal taken',
                            value: stats.totalChores || 0,
                            color: 'blue'
                        })
                    )
                ),

                // Error display
                error && h(window.choreComponents.ErrorMessage, {
                    message: error,
                    onDismiss: () => setError(null)
                }),

                // Task list
                h('div', { className: 'task-list grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3' },
                    chores.length === 0 
                        ? h(window.choreComponents.EmptyState, {
                            message: 'Geen taken gevonden',
                            subMessage: 'Klik op + om een nieuwe taak toe te voegen'
                        })
                        : chores.map(chore => 
                            h(window.choreComponents.TaskCard, {
                                key: chore.chore_id || chore.id,
                                chore: chore,
                                onMarkDone: markDone,  // Fixed prop name
                                onEdit: handleEdit,
                                onShowDescription: setSelectedDescription,
                                onToggleDescription: toggleTaskDescription,
                                assignees: assignees,
                                onMarkSubtaskDone: markSubtaskDone  // Fixed prop name
                            })
                        )
                ),

                // Undo button
                completedToday > 0 && h('div', { className: 'mt-6 text-center' },
                    h('button', {
                        className: `rounded px-4 py-2 border transition-colors ${
                            completedToday > 0 
                                ? "bg-gray-100 border-gray-300 hover:bg-gray-200 task-action-button" 
                                : "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed task-action-button"
                        }`,
                        onClick: completedToday > 0 ? undoLastCompletion : undefined,
                        disabled: completedToday === 0
                    },
                        h('span', { className: "mr-2" }, "↶"),
                        "Laatste voltooiing ongedaan maken"
                    )
                ),

                // Modals
                showForm && h(window.choreComponents.TaskForm, {
                    onSubmit: saveChore,
                    onDelete: deleteChore,
                    onCancel: () => {
                        setShowForm(false);
                        setSelectedChore(null);
                    },
                    onResetCompletion: resetCompletion,
                    initialData: selectedChore,
                    assignees: assignees
                }),

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
               window.ChoresAPI && 
               window.ChoresAPI.chores && 
               window.ChoresAPI.users && 
               window.ChoresAPI.stats && 
               window.ChoresAPI.settings;
    }

    if (checkIfReady()) {
        // Everything is already loaded, initialize immediately
        initializeAppModule();
    } else {
        // Track what we're waiting for
        let componentsReady = false;
        let apiReady = false;
        
        function tryInitialize() {
            if (componentsReady && apiReady) {
                initializeAppModule();
            }
        }
        
        // Wait for components to be ready
        window.addEventListener('choreComponentsReady', function() {
            console.log('App.js: Components ready event received');
            componentsReady = true;
            tryInitialize();
        });
        
        // Wait for API to be ready
        window.addEventListener('chores-api-ready', function() {
            console.log('App.js: API ready event received');
            apiReady = true;
            tryInitialize();
        });
        
        // Also check periodically in case events were missed
        const checkInterval = setInterval(function() {
            if (checkIfReady()) {
                clearInterval(checkInterval);
                console.log('App.js: All dependencies detected via polling');
                initializeAppModule();
            }
        }, 100);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
    }
})();