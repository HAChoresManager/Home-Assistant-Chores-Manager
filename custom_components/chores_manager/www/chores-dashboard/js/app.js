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
    const { useState, useEffect, useCallback } = React;

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
        const [config, setConfig] = useState(null);
        const [chores, setChores] = useState([]);
        const [completedToday, setCompletedToday] = useState(0);
        const [overdueCount, setOverdueCount] = useState(0);
        const [error, setError] = useState(null);
        const [authError, setAuthError] = useState(false);
        
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

        // Load configuration and data on mount
        useEffect(() => {
            loadConfig();
            loadData();
            loadAssignees();
            loadTheme();
            
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
        const loadConfig = async () => {
            try {
                const data = await window.choreUtils.fetchData('/api/panel_custom/chores/config');
                setConfig(data);
            } catch (err) {
                console.error('Error loading config:', err);
                handleError(err);
            }
        };

        const loadData = async () => {
            try {
                const data = await window.choreUtils.fetchData('/api/panel_custom/chores/chores');
                setChores(data);
                setAuthError(false);
            } catch (err) {
                console.error('Error loading chores:', err);
                handleError(err);
            }
        };

        const loadAssignees = async () => {
            try {
                const data = await window.choreUtils.fetchData('/api/panel_custom/chores/assignees');
                setAssignees(data);
            } catch (err) {
                console.error('Error loading assignees:', err);
            }
        };

        const loadTheme = () => {
            const savedTheme = localStorage.getItem('choresTheme');
            if (savedTheme) {
                try {
                    const theme = JSON.parse(savedTheme);
                    window.ThemeIntegration.applyCustomTheme(theme);
                } catch (err) {
                    console.error('Error loading theme:', err);
                }
            }
        };

        // Error handling
        const handleError = (error) => {
            if (error.message && error.message.includes('401')) {
                setAuthError(true);
            } else {
                setError(error.message || 'An error occurred');
                setTimeout(() => setError(null), 5000);
            }
        };

        // Chore management functions
        const markDone = async (choreId, completedBy) => {
            setProcessing(prev => ({ ...prev, [choreId]: true }));
            try {
                await window.choreUtils.postData('/api/panel_custom/chores/complete', {
                    chore_id: choreId,
                    done_by: completedBy
                });
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
                if (choreData.chore_id) {
                    await window.choreUtils.postData('/api/panel_custom/chores/update', choreData);
                } else {
                    await window.choreUtils.postData('/api/panel_custom/chores/add', choreData);
                }
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
                await window.choreUtils.postData('/api/panel_custom/chores/delete', { chore_id: choreId });
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
                await window.choreUtils.postData('/api/panel_custom/chores/reset', { chore_id: choreId });
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
                const data = await window.choreUtils.fetchData('/api/panel_custom/chores/last_completed');
                if (data && data.chore_id) {
                    await window.choreUtils.postData('/api/panel_custom/chores/undo', { 
                        chore_id: data.chore_id 
                    });
                    await loadData();
                }
            } catch (err) {
                console.error('Error undoing last completion:', err);
                handleError(err);
            }
        };

        const updateDescription = async (choreId, description) => {
            const chore = chores.find(c => (c.chore_id || c.id) === choreId);
            if (chore) {
                await saveChore({ ...chore, description });
            }
        };

        const processSubtaskCompletions = async (choreId, subtaskIndex, completedBy) => {
            setProcessing(prev => ({ ...prev, [choreId]: true }));
            try {
                await window.choreUtils.postData('/api/panel_custom/chores/subtask/complete', {
                    chore_id: choreId,
                    subtask_index: subtaskIndex,
                    completed_by: completedBy
                });
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
                const endpoint = action === 'delete' 
                    ? '/api/panel_custom/chores/assignee/delete'
                    : action === 'update'
                    ? '/api/panel_custom/chores/assignee/update'
                    : '/api/panel_custom/chores/assignee/add';
                    
                await window.choreUtils.postData(endpoint, userData);
                await loadAssignees();
            } catch (err) {
                console.error('Error saving user:', err);
                handleError(err);
            }
        };

        // Theme management
        const saveTheme = (theme) => {
            localStorage.setItem('choresTheme', JSON.stringify(theme));
            window.ThemeIntegration.applyCustomTheme(theme);
            setShowThemeSettings(false);
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
            } finally {
                setRefreshing(false);
            }
        };

        const refreshAuth = async () => {
            try {
                await window.AuthHelper.refreshAuth();
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
        const { todayChores, upcomingChores } = window.choreUtils.categorizeCChores(choresWithState);

        // Calculate user statistics
        const userStats = window.choreUtils.calculateUserStats(chores);
        const orderedStats = window.choreUtils.orderStatsByAssignees(userStats, assignees);

        // Loading state
        if (!config) {
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
                                key: chore.chore_id,
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
                    Object.entries(orderedStats).map(([assignee, stats]) =>
                        h(window.choreComponents.UserStatsCard, {
                            key: assignee,
                            assignee: assignee,
                            stats: stats,
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
                            key: chore.chore_id,
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
                        currentTheme: JSON.parse(localStorage.getItem('choresTheme') || '{}')
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