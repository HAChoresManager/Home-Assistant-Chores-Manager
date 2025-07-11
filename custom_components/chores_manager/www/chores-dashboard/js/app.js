/**
 * Main App component for the Chores Manager
 * Handles the primary application logic and state management
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React || !window.ReactDOM || !window.choreUtils || !window.choreComponents) {
        console.error('App requires React, ReactDOM, choreUtils, and choreComponents');
        return;
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
            const today = new Date().toDateString();
            const completed = chores.filter(c => 
                c.last_done && new Date(c.last_done).toDateString() === today
            ).length;
            setCompletedToday(completed);

            const overdue = chores.filter(c => 
                window.choreUtils.isDueOrOverdue(c) && 
                (!c.last_done || new Date(c.last_done).toDateString() !== today)
            ).length;
            setOverdueCount(overdue);
        }, [chores]);

        // API functions
        const loadData = async () => {
            try {
                setLoading(true);
                
                // Get sensor state which contains all data
                const sensorData = await window.ChoresAPI.getSensorState();
                
                if (sensorData && sensorData.attributes) {
                    const attrs = sensorData.attributes;
                    
                    // Set chores
                    setChores(attrs.overdue_tasks || []);
                    
                    // Set assignees
                    setAssignees(attrs.assignees || []);
                    
                    // Set stats
                    setStats(attrs.stats || {});
                    
                    // Set completed today count
                    setCompletedToday(attrs.completed_today || 0);
                    
                    // Set theme settings if available
                    if (attrs.theme_settings) {
                        setThemeSettings(attrs.theme_settings);
                        applyTheme(attrs.theme_settings);
                    }
                }
                
                setAuthError(false);
                setError(null);
            } catch (err) {
                console.error('Error loading data:', err);
                handleError(err);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        };

        const loadTheme = async () => {
            try {
                // Check localStorage first
                const savedTheme = localStorage.getItem('choresTheme');
                if (savedTheme) {
                    const theme = JSON.parse(savedTheme);
                    applyTheme(theme);
                }
            } catch (err) {
                console.error('Error loading theme:', err);
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
                setShowForm(false);
                setSelectedChore(null);
            } catch (err) {
                console.error('Error resetting completion:', err);
                handleError(err);
            }
        };

        const undoLastCompletion = async () => {
            try {
                // Find the most recently completed task
                const today = new Date().toDateString();
                const recentlyCompleted = chores
                    .filter(c => c.last_done && new Date(c.last_done).toDateString() === today)
                    .sort((a, b) => new Date(b.last_done) - new Date(a.last_done));
                
                if (recentlyCompleted.length > 0) {
                    await window.ChoresAPI.chores.resetChore(recentlyCompleted[0].chore_id || recentlyCompleted[0].id);
                    await loadData();
                }
            } catch (err) {
                console.error('Error undoing last completion:', err);
                handleError(err);
            }
        };

        const updateDescription = async (choreId, description) => {
            try {
                await window.ChoresAPI.chores.updateDescription(choreId, description);
                await loadData();
            } catch (err) {
                console.error('Error updating description:', err);
                handleError(err);
            }
        };

        const processSubtaskCompletions = async (choreId, subtaskIds, completedBy) => {
            setProcessing(prev => ({ ...prev, [choreId]: true }));
            try {
                await window.ChoresAPI.chores.completeSubtasks(choreId, subtaskIds, completedBy);
                await loadData();
            } catch (err) {
                console.error('Error completing subtask:', err);
                handleError(err);
            } finally {
                setProcessing(prev => ({ ...prev, [choreId]: false }));
            }
        };

        // User management
        const saveUser = async (userData, action = 'add') => {
            try {
                if (action === 'delete') {
                    await window.ChoresAPI.users.deleteUser(userData.id || userData.user_id);
                } else {
                    await window.ChoresAPI.users.addUser(userData);
                }
                await loadData();
            } catch (err) {
                console.error('Error saving user:', err);
                handleError(err);
            }
        };

        // Theme management
        const saveTheme = async (theme) => {
            try {
                // Save to localStorage
                localStorage.setItem('choresTheme', JSON.stringify(theme));
                
                // Apply theme immediately
                applyTheme(theme);
                
                // Save to backend
                await window.ChoresAPI.theme.saveTheme(theme);
                
                setShowThemeSettings(false);
            } catch (err) {
                console.error('Error saving theme:', err);
                handleError(err);
            }
        };

        // Refresh functions
        const handleRefresh = async () => {
            setRefreshing(true);
            try {
                await loadData();
                setError(null);
                setAuthError(false);
            } catch (err) {
                handleError(err);
            }
        };

        const refreshAuth = async () => {
            try {
                if (window.choreAuth && window.choreAuth.initAuth) {
                    await window.choreAuth.initAuth();
                }
                await handleRefresh();
            } catch (err) {
                console.error('Error refreshing auth:', err);
                setAuthError(true);
            }
        };

        // Toggle description expansion
        const handleToggleDescription = (choreId, isExpanded) => {
            setExpandedDescriptions(prev => ({
                ...prev,
                [choreId]: isExpanded
            }));
        };

        // Prepare chores data with processing state
        const choresWithState = chores.map(chore => ({
            ...chore,
            isProcessing: processing[chore.chore_id || chore.id] || false,
            isDescriptionExpanded: expandedDescriptions[chore.chore_id || chore.id] || false
        }));

        // Get today's chores and upcoming chores
        const todayChores = choresWithState.filter(chore => window.choreUtils.isDueToday(chore));
        const upcomingChores = choresWithState.filter(chore => !window.choreUtils.isDueToday(chore));

        // Loading state
        if (loading) {
            return h('div', { className: "flex items-center justify-center h-screen" },
                h('div', { className: "text-center" },
                    h('div', { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" }),
                    h('p', { className: "text-gray-600" }, "Loading dashboard...")
                )
            );
        }

        // Main render
        return h('div', { className: "container mx-auto p-4 max-w-4xl chores-dashboard" },
            // Error banners
            error && h('div', {
                className: "bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded"
            }, error),

            authError && h(AuthErrorBanner, { onRefresh: refreshAuth }),

            // Header
            h('div', { className: "flex justify-between items-center mb-6" },
                h('h1', { className: "text-2xl font-bold" }, "Huishoudelijke Taken"),
                h('div', { className: "flex space-x-2" },
                    h('button', {
                        className: "p-2 rounded hover:bg-gray-200",
                        onClick: handleRefresh,
                        disabled: refreshing,
                        title: "Ververs"
                    }, refreshing ? '⟳' : '↻'),
                    h('button', {
                        className: "p-2 rounded hover:bg-gray-200",
                        onClick: () => setShowThemeSettings(true),
                        title: "Thema"
                    }, '🎨')
                )
            ),

            // Today's tasks
            h('div', { className: "mb-6" },
                h('h2', { className: "text-xl font-semibold mb-3" }, "Taken voor vandaag"),
                todayChores.length === 0
                    ? h('div', { className: "text-center p-8 bg-green-50 rounded-lg border border-green-200" },
                        h('span', { className: "text-green-600 text-lg" }, 
                            "✓ Alle taken zijn voltooid voor vandaag!")
                    )
                    : h('div', { className: "space-y-4" },
                        todayChores.map(chore =>
                            h(window.choreComponents.TaskCard, {
                                key: chore.chore_id || chore.id,
                                chore: chore,
                                onMarkDone: markDone,
                                onEdit: handleEdit,
                                onShowDescription: updateDescription,
                                onToggleDescription: handleToggleDescription,
                                onMarkSubtaskDone: processSubtaskCompletions,
                                assignees: assignees
                            })
                        )
                    )
            ),

            // User stats section
            h('div', { className: "mb-6" },
                h('div', { className: "flex justify-between items-center mb-3" },
                    h('h2', { className: "text-xl font-semibold" }, "Prestaties & Statistieken"),
                    h('button', {
                        className: "px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm",
                        onClick: () => setShowUserManagement(true)
                    }, "Configuratie")
                ),
                h('div', { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" },
                    Object.entries(stats).map(([assignee, userStats]) =>
                        h(window.choreComponents.UserStatsCard, {
                            key: assignee,
                            assignee: assignee,
                            stats: userStats,
                            assignees: assignees
                        })
                    )
                )
            ),

            // Stats cards
            h('div', { className: "grid grid-cols-2 gap-4 mb-6" },
                h(window.choreComponents.StatsCard, {
                    title: "Voltooid Vandaag",
                    value: completedToday,
                    color: "#4ade80",
                    desc: "📅"
                }),
                h(window.choreComponents.StatsCard, {
                    title: "Achterstallig",
                    value: overdueCount,
                    color: "#ef4444",
                    desc: "⚠️"
                })
            ),

            // New task button
            h('button', {
                className: "w-full p-3 border rounded-md flex items-center justify-center bg-gray-100 border-gray-300 hover:bg-gray-200 task-action-button",
                onClick: () => setShowForm(true)
            },
                h('span', { className: "mr-2" }, "+"),
                "Nieuwe Taak"
            ),

            // Section divider
            h('div', { className: "section-divider mb-8" },
                h('span', { className: "section-divider-text" }, "Aankomende Taken")
            ),

            // Upcoming tasks
            upcomingChores.length === 0
                ? h('div', { className: "text-center text-gray-500 mt-8" }, 
                    "Geen aankomende taken")
                : h('div', { className: "space-y-4 mb-12" },
                    upcomingChores.map(chore =>
                        h(window.choreComponents.TaskCard, {
                            key: chore.chore_id || chore.id,
                            chore: chore,
                            onMarkDone: markDone,
                            onEdit: handleEdit,
                            onShowDescription: updateDescription,
                            onToggleDescription: handleToggleDescription,
                            onMarkSubtaskDone: processSubtaskCompletions,
                            assignees: assignees
                        })
                    )
                ),

            // Undo button
            h('div', { className: "mt-8 mb-20" },
                h('button', {
                    className: `w-full p-3 border rounded-md flex items-center justify-center ${
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
})();