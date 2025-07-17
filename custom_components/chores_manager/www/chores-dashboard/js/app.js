/**
 * Main App Component for Chores Dashboard
 * This is the root component that manages the entire application state
 * Part of the modular architecture - depends on all component modules
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const { useState, useEffect, useCallback } = React;
    
    /**
     * ChoresApp - Main application component
     * Manages all state and business logic for the dashboard
     */
    function ChoresApp() {
        // Check dependencies
        if (!window.choreComponents) {
            return h('div', { className: 'error-container' },
                h('h2', null, 'Loading Error'),
                h('p', null, 'Components not loaded. Please refresh the page.')
            );
        }
        
        // Get all components
        const {
            Loading,
            ErrorMessage,
            Alert,
            Modal,
            TaskCard,
            TaskForm,
            UserManagement,
            StatsCard,
            UserStatsCard,
            ThemeSettings,
            ConfirmDialog,
            CompletionConfirmDialog,
            SubtaskCompletionDialog
        } = window.choreComponents;
        
        const h = React.createElement;
        
        // Main app component
        function App() {
            // State management
            const [chores, setChores] = useState([]);
            const [assignees, setAssignees] = useState([]);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            const [showTaskForm, setShowTaskForm] = useState(false);
            const [editingTask, setEditingTask] = useState(null);
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [lastCompletion, setLastCompletion] = useState(null);
            const [themeSettings, setThemeSettings] = useState({ primary: '#1a202c', accent: '#3b82f6' });
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [hasAuthError, setHasAuthError] = useState(false);
            
            // API instances
            const [api, setApi] = useState(null);
            
            // Initialize API on component mount
            useEffect(() => {
                const initApi = async () => {
                    try {
                        // Wait for ChoresAPI to be available and initialized
                        const checkInterval = setInterval(() => {
                            if (window.ChoresAPI && window.ChoresAPI._initialized) {
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
                    const sensorData = await api.getSensorState();  // Fixed: was api.sensor.getState()
                    
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
            
            // Task operations
            const handleAddTask = useCallback(async (taskData) => {
                if (!api) return;
                
                try {
                    await api.chores.addChore(taskData);
                    await loadData();
                    setShowTaskForm(false);
                    setEditingTask(null);
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleMarkDone = useCallback(async (choreId, assignee) => {
                if (!api) return;
                
                try {
                    await api.chores.markDone(choreId, assignee);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleResetTask = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.resetChore(choreId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleDeleteTask = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.deleteChore(choreId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleForceDue = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.forceDue(choreId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleUpdateDescription = useCallback(async (choreId, description) => {
                if (!api) return;
                
                try {
                    await api.chores.updateDescription(choreId, description);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Subtask operations
            const handleCompleteSubtask = useCallback(async (choreId, subtaskName, assignee) => {
                if (!api) return;
                
                try {
                    await api.chores.completeSubtask(choreId, subtaskName, assignee);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleAddSubtask = useCallback(async (choreId, subtaskName) => {
                if (!api) return;
                
                try {
                    await api.chores.addSubtask(choreId, subtaskName);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleDeleteSubtask = useCallback(async (choreId, subtaskName) => {
                if (!api) return;
                
                try {
                    await api.chores.deleteSubtask(choreId, subtaskName);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // User operations
            const handleAddUser = useCallback(async (userData) => {
                if (!api) return;
                
                try {
                    await api.users.addUser(userData);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleDeleteUser = useCallback(async (userId) => {
                if (!api) return;
                
                try {
                    await api.users.deleteUser(userId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleGetHAUsers = useCallback(async () => {
                if (!api) return [];
                
                try {
                    const users = await api.users.getHAUsers();
                    return users;
                } catch (err) {
                    handleError(err);
                    return [];
                }
            }, [api, handleError]);
            
            // Theme operations
            const handleSaveTheme = useCallback(async (theme) => {
                if (!api) return;
                
                try {
                    await api.theme.saveTheme(theme);
                    setThemeSettings(theme);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Filter overdue tasks
            const overdueTasks = chores.filter(chore => chore.is_overdue);
            const todayTasks = chores.filter(chore => chore.due_today && !chore.is_overdue);
            const upcomingTasks = chores.filter(chore => !chore.is_overdue && !chore.due_today);
            
            // Render
            if (loading && !api) {
                return h(Loading);
            }
            
            if (hasAuthError) {
                return h('div', { className: 'min-h-screen bg-gray-50 p-4' },
                    h('div', { className: 'max-w-2xl mx-auto' },
                        h(ErrorMessage, {
                            title: 'Authentication Error',
                            message: 'Unable to connect to Home Assistant. Please check your authentication token.',
                            onRetry: loadData
                        })
                    )
                );
            }
            
            return h('div', { className: 'min-h-screen bg-gray-50' },
                // Header
                h('header', { className: 'bg-white shadow-sm' },
                    h('div', { className: 'px-4 py-4 sm:px-6 lg:px-8' },
                        h('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4' },
                            h('div', { className: 'flex items-center gap-3' },
                                h('div', { className: 'w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center' },
                                    h('svg', { className: 'w-6 h-6 text-white', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' },
                                        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' })
                                    )
                                ),
                                h('div', null,
                                    h('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Taken Dashboard'),
                                    lastCompletion && h('p', { className: 'text-sm text-gray-500' }, 
                                        `Laatste taak: ${lastCompletion.chore_name} door ${lastCompletion.assigned_to}`
                                    )
                                )
                            ),
                            h('div', { className: 'flex gap-2' },
                                h('button', {
                                    onClick: () => setShowThemeSettings(true),
                                    className: 'px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
                                }, '🎨 Thema'),
                                h('button', {
                                    onClick: () => setShowUserManagement(true),
                                    className: 'px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
                                }, '👥 Gebruikers'),
                                h('button', {
                                    onClick: () => { setShowTaskForm(true); setEditingTask(null); },
                                    className: 'px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors'
                                }, '+ Nieuwe Taak')
                            )
                        )
                    )
                ),
                
                // Error message
                error && h('div', { className: 'px-4 py-2' },
                    h(Alert, { type: 'error', onClose: () => setError(null) }, error)
                ),
                
                // Main content
                h('main', { className: 'px-4 py-6 sm:px-6 lg:px-8' },
                    h('div', { className: 'max-w-7xl mx-auto' },
                        // Stats cards
                        h('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-6' },
                            h(StatsCard, {
                                title: 'Achterstallig',
                                value: overdueTasks.length,
                                color: 'red',
                                icon: '⚠️'
                            }),
                            h(StatsCard, {
                                title: 'Vandaag',
                                value: todayTasks.length,
                                color: 'yellow',
                                icon: '📅'
                            }),
                            h(StatsCard, {
                                title: 'Aankomend',
                                value: upcomingTasks.length,
                                color: 'green',
                                icon: '📋'
                            })
                        ),
                        
                        // User stats
                        assignees.length > 0 && h('div', { className: 'mb-6' },
                            h('h2', { className: 'text-lg font-semibold mb-4' }, 'Gebruiker Statistieken'),
                            h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' },
                                assignees.map(assignee => 
                                    h(UserStatsCard, {
                                        key: assignee.id,
                                        assignee: assignee,
                                        chores: chores
                                    })
                                )
                            )
                        ),
                        
                        // Task sections
                        loading ? h(Loading) : h('div', { className: 'space-y-6' },
                            // Overdue tasks
                            overdueTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-lg font-semibold mb-4 text-red-600' }, 'Achterstallige Taken'),
                                h('div', { className: 'grid gap-4' },
                                    overdueTasks.map(chore => 
                                        h(TaskCard, {
                                            key: chore.id,
                                            chore: chore,
                                            assignees: assignees,
                                            onMarkDone: handleMarkDone,
                                            onEdit: (task) => { setEditingTask(task); setShowTaskForm(true); },
                                            onDelete: handleDeleteTask,
                                            onReset: handleResetTask,
                                            onForceDue: handleForceDue,
                                            onViewDescription: setSelectedDescription,
                                            onUpdateDescription: handleUpdateDescription,
                                            onCompleteSubtask: handleCompleteSubtask,
                                            onAddSubtask: handleAddSubtask,
                                            onDeleteSubtask: handleDeleteSubtask
                                        })
                                    )
                                )
                            ),
                            
                            // Today's tasks
                            todayTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-lg font-semibold mb-4 text-yellow-600' }, 'Vandaag Te Doen'),
                                h('div', { className: 'grid gap-4' },
                                    todayTasks.map(chore => 
                                        h(TaskCard, {
                                            key: chore.id,
                                            chore: chore,
                                            assignees: assignees,
                                            onMarkDone: handleMarkDone,
                                            onEdit: (task) => { setEditingTask(task); setShowTaskForm(true); },
                                            onDelete: handleDeleteTask,
                                            onReset: handleResetTask,
                                            onForceDue: handleForceDue,
                                            onViewDescription: setSelectedDescription,
                                            onUpdateDescription: handleUpdateDescription,
                                            onCompleteSubtask: handleCompleteSubtask,
                                            onAddSubtask: handleAddSubtask,
                                            onDeleteSubtask: handleDeleteSubtask
                                        })
                                    )
                                )
                            ),
                            
                            // Upcoming tasks
                            upcomingTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-lg font-semibold mb-4 text-green-600' }, 'Aankomende Taken'),
                                h('div', { className: 'grid gap-4' },
                                    upcomingTasks.map(chore => 
                                        h(TaskCard, {
                                            key: chore.id,
                                            chore: chore,
                                            assignees: assignees,
                                            onMarkDone: handleMarkDone,
                                            onEdit: (task) => { setEditingTask(task); setShowTaskForm(true); },
                                            onDelete: handleDeleteTask,
                                            onReset: handleResetTask,
                                            onForceDue: handleForceDue,
                                            onViewDescription: setSelectedDescription,
                                            onUpdateDescription: handleUpdateDescription,
                                            onCompleteSubtask: handleCompleteSubtask,
                                            onAddSubtask: handleAddSubtask,
                                            onDeleteSubtask: handleDeleteSubtask
                                        })
                                    )
                                )
                            ),
                            
                            // No tasks
                            chores.length === 0 && !loading && h('div', { className: 'text-center py-12' },
                                h('p', { className: 'text-gray-500' }, 'Geen taken gevonden. Klik op "Nieuwe Taak" om te beginnen.')
                            )
                        )
                    )
                ),
                
                // Modals
                showTaskForm && h(Modal, { onClose: () => { setShowTaskForm(false); setEditingTask(null); } },
                    h(TaskForm, {
                        task: editingTask,
                        assignees: assignees,
                        onSave: handleAddTask,
                        onCancel: () => { setShowTaskForm(false); setEditingTask(null); }
                    })
                ),
                
                showUserManagement && h(Modal, { onClose: () => setShowUserManagement(false) },
                    h(UserManagement, {
                        assignees: assignees,
                        onAddUser: handleAddUser,
                        onDeleteUser: handleDeleteUser,
                        onGetHAUsers: handleGetHAUsers,
                        onClose: () => setShowUserManagement(false)
                    })
                ),
                
                showThemeSettings && h(Modal, { onClose: () => setShowThemeSettings(false) },
                    h(ThemeSettings, {
                        currentTheme: themeSettings,
                        onSave: handleSaveTheme,
                        onClose: () => setShowThemeSettings(false)
                    })
                ),
                
                selectedDescription && h(Modal, { onClose: () => setSelectedDescription(null) },
                    h('div', { className: 'p-6' },
                        h('h3', { className: 'text-lg font-semibold mb-4' }, 'Taak Beschrijving'),
                        h('div', { className: 'prose max-w-none' },
                            h('p', { className: 'whitespace-pre-wrap' }, selectedDescription.description || 'Geen beschrijving beschikbaar')
                        ),
                        h('button', {
                            onClick: () => setSelectedDescription(null),
                            className: 'mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
                        }, 'Sluiten')
                    )
                )
            );
        }
        
        return App;
    }
    
    // Initialize the app
    function initApp() {
        console.log('Initializing Chores Dashboard App');
        
        // Check dependencies
        if (!window.React || !window.ReactDOM) {
            console.error('React not loaded');
            return;
        }
        
        if (!window.choreComponents) {
            console.error('Components not loaded');
            return;
        }
        
        // Get root element
        const root = document.getElementById('root');
        if (!root) {
            console.error('Root element not found');
            return;
        }
        
        // Create React root and render app
        const reactRoot = ReactDOM.createRoot(root);
        const App = ChoresApp();
        reactRoot.render(React.createElement(App));
        
        console.log('Chores Dashboard App initialized successfully');
    }
    
    // Export
    window.ChoresApp = {
        ChoresApp: ChoresApp,
        initApp: initApp
    };
    
    console.log('App component loaded successfully');
    
    // Auto-initialize if dependencies are ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => {
            if (window.choreComponents && window.React && window.ReactDOM) {
                console.log('App loaded successfully (on event)');
            }
        }, 100);
    }
})();