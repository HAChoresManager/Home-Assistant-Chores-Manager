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
                        onClick: onRefresh,
                        className: 'ml-auto bg-red-200 hover:bg-red-300 text-red-800 font-bold py-1 px-3 rounded'
                    }, 'Refresh Auth')
                )
            );
        };

        /**
         * Main App component
         */
        const App = function() {
            // Core state
            const [chores, setChores] = useState([]);
            const [completedToday, setCompletedToday] = useState(0);
            const [overdueCount, setOverdueCount] = useState(0);
            const [error, setError] = useState(null);
            const [authError, setAuthError] = useState(false);
            const [loading, setLoading] = useState(true);
            
            // UI state
            const [showForm, setShowForm] = useState(false);
            const [selectedChore, setSelectedChore] = useState(null);
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [assignees, setAssignees] = useState([]);
            const [refreshing, setRefreshing] = useState(false);
            const [processing, setProcessing] = useState({});
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [expandedDescriptions, setExpandedDescriptions] = useState({});
            const [themeSettings, setThemeSettings] = useState({});
            const [stats, setStats] = useState({});

            // Initialize API on mount
            useEffect(() => {
                const initializeApp = async () => {
                    try {
                        // Initialize the API
                        if (window.ChoresAPI && window.ChoresAPI.initialize) {
                            await window.ChoresAPI.initialize();
                        }
                        
                        // Load initial data
                        await loadData();
                        await loadTheme();
                    } catch (err) {
                        console.error('Failed to initialize app:', err);
                        handleError(err);
                    }
                };

                initializeApp();

                // Set up auto-refresh
                const interval = setInterval(loadData, 60000);
                return () => clearInterval(interval);
            }, []);

            // Calculate stats when chores change
            useEffect(() => {
                const newStats = calculateStats(chores);
                setStats(newStats);
                setCompletedToday(newStats.completedToday || 0);
                setOverdueCount(newStats.overdueCount || 0);
            }, [chores]);

            // Data loading functions
            const loadData = async () => {
                try {
                    // Get sensor state directly from ChoresAPI
                    const sensorData = await window.ChoresAPI.chores.getSensorState();
                    
                    if (sensorData && sensorData.attributes) {
                        // The sensor stores all tasks in 'overdue_tasks' (despite the name)
                        const allChores = sensorData.attributes.overdue_tasks || [];
                        
                        setChores(allChores);
                        
                        if (sensorData.attributes.assignees) {
                            setAssignees(sensorData.attributes.assignees);
                        }
                        
                        // Also load theme from sensor data
                        if (sensorData.attributes.theme_settings) {
                            setThemeSettings(sensorData.attributes.theme_settings);
                            applyTheme(sensorData.attributes.theme_settings);
                        }
                    }
                    setLoading(false);
                    setAuthError(false);
                } catch (err) {
                    console.error('Error loading data:', err);
                    setLoading(false);
                    handleError(err);
                }
            };

            const calculateStats = (choresList) => {
                const stats = {
                    completedToday: 0,
                    overdueCount: 0,
                    upcomingCount: 0,
                    totalChores: choresList.length
                };

                const today = new Date().toDateString();
                
                choresList.forEach(chore => {
                    if (chore.last_completed) {
                        const lastCompleted = new Date(chore.last_completed);
                        if (lastCompleted.toDateString() === today) {
                            stats.completedToday++;
                        }
                    }
                    
                    if (chore.is_overdue) {
                        stats.overdueCount++;
                    } else if (chore.due_days !== null && chore.due_days <= 3) {
                        stats.upcomingCount++;
                    }
                });

                return stats;
            };

            const refreshData = async () => {
                setRefreshing(true);
                await loadData();
                setTimeout(() => setRefreshing(false), 500);
            };

            // Theme management
            const loadTheme = async () => {
                try {
                    // Theme comes from sensor data, so we'll get it from there
                    // The loadData function will set the theme from sensor attributes
                    const sensorData = await window.ChoresAPI.chores.getSensorState();
                    
                    if (sensorData && sensorData.attributes && sensorData.attributes.theme_settings) {
                        const theme = sensorData.attributes.theme_settings;
                        setThemeSettings(theme);
                        applyTheme(theme);
                    }
                } catch (err) {
                    console.error('Error loading theme:', err);
                }
            };

            const saveTheme = async (theme) => {
                try {
                    // Use the theme API
                    await window.ChoresAPI.theme.saveTheme(theme);
                    setThemeSettings(theme);
                    applyTheme(theme);
                    // Reload data to get updated sensor state
                    await loadData();
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
                    await window.ChoresAPI.chores.addChore(choreData);
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

            const undoLastCompletion = async () => {
                const choreToUndo = chores.find(chore => {
                    if (!chore.last_completed) return false;
                    const lastCompleted = new Date(chore.last_completed);
                    const today = new Date().toDateString();
                    return lastCompleted.toDateString() === today;
                });

                if (choreToUndo) {
                    await resetCompletion(choreToUndo.id);
                }
            };

            // User management
            const saveUser = async (userData) => {
                try {
                    await window.ChoresAPI.users.addUser(userData);
                    await loadData();
                    setShowUserManagement(false);
                } catch (err) {
                    console.error('Error saving user:', err);
                    handleError(err);
                }
            };

            const refreshAuth = async () => {
                try {
                    window.location.reload();
                } catch (err) {
                    console.error('Error refreshing auth:', err);
                }
            };

            // Render
            if (authError) {
                return h('div', { className: 'container mx-auto p-4' },
                    h(AuthErrorBanner, { onRefresh: refreshAuth })
                );
            }

            if (loading) {
                return h(window.choreComponents.Loading, { 
                    message: 'Taken laden...' 
                });
            }

            return h('div', { className: 'chores-dashboard' },
                // Header with stats
                h('div', { className: 'dashboard-header mb-6' },
                    h('div', { className: 'flex flex-wrap justify-between items-center mb-4' },
                        h('h1', { className: 'text-2xl font-bold task-heading' }, 'Huishoudelijke Taken'),
                        h('div', { className: 'flex space-x-2 mt-2 sm:mt-0' },
                            h('button', {
                                className: `icon-button ${refreshing ? 'animate-spin' : ''}`,
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
                                key: chore.id,
                                chore: chore,
                                onComplete: markDone,
                                onEdit: handleEdit,
                                onForceDue: forceDue,
                                onCompleteSubtasks: completeSubtasks,
                                onDescriptionClick: setSelectedDescription,
                                isProcessing: processing[chore.id] || false,
                                assignees: assignees
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
    if (window.choreComponents && window.React && window.ReactDOM && window.choreUtils) {
        // Components are already loaded, initialize immediately
        initializeAppModule();
    } else {
        // Wait for components to be ready
        window.addEventListener('choreComponentsReady', function() {
            console.log('App.js: Components ready event received');
            initializeAppModule();
        });
        
        // Also listen for a backup manual check from index.html
        window.addEventListener('tryInitializeApp', function() {
            if (window.choreComponents && window.React && window.ReactDOM && window.choreUtils) {
                initializeAppModule();
            }
        });
    }
})();