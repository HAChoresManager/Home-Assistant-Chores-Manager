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
            const [stats, setStats] = useState({}); // Add stats state
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
                async function initializeAPI() {
                    try {
                        console.log('Initializing Chores Dashboard App');
                        
                        // Check if all dependencies are loaded
                        if (!window.ChoresAPI) {
                            console.error('ChoresAPI not found');
                            return;
                        }
                        
                        // Create API instance
                        const apiInstance = new window.ChoresAPI.API();
                        await apiInstance.initialize();
                        
                        console.log('API initialized successfully');
                        setApi(apiInstance);
                        setError(null);
                        
                    } catch (err) {
                        console.error('Failed to initialize API:', err);
                        setError('Failed to initialize application');
                    }
                }
                
                initializeAPI();
            }, []);
            
            // Load data when API is ready
            useEffect(() => {
                if (api) {
                    loadData();
                }
            }, [api]);
            
            // Apply theme changes
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
                        setStats(sensorData.attributes.stats || {}); // Set stats from sensor data
                        setLastCompletion(sensorData.attributes.last_completion || null);
                        setThemeSettings(sensorData.attributes.theme || { primary: '#1a202c', accent: '#3b82f6' });
                    } else {
                        setChores([]);
                        setAssignees([]);
                        setStats({});
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
            
            // Task completion handler
            const handleMarkDone = useCallback(async (choreId, selectedUser) => {
                if (!api) return;
                
                try {
                    // Set processing state
                    setChores(prevChores => 
                        prevChores.map(chore => 
                            (chore.id === choreId || chore.chore_id === choreId) 
                                ? { ...chore, isProcessing: true }
                                : chore
                        )
                    );
                    
                    await api.chores.markComplete(choreId, selectedUser);
                    await loadData();
                    
                } catch (err) {
                    handleError(err);
                    
                    // Remove processing state on error
                    setChores(prevChores => 
                        prevChores.map(chore => 
                            (chore.id === choreId || chore.chore_id === choreId) 
                                ? { ...chore, isProcessing: false }
                                : chore
                        )
                    );
                }
            }, [api, loadData, handleError]);
            
            // Subtask completion handler
            const handleMarkSubtaskDone = useCallback(async (choreId, subtaskIndex, selectedUser) => {
                if (!api) return;
                
                try {
                    await api.chores.completeSubtask(subtaskIndex, selectedUser);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Task form handlers
            const handleAddTask = useCallback(() => {
                setEditingTask(null);
                setShowTaskForm(true);
            }, []);
            
            const handleEditTask = useCallback((chore) => {
                setEditingTask(chore);
                setShowTaskForm(true);
            }, []);
            
            const handleTaskFormSubmit = useCallback(async (taskData) => {
                if (!api) return;
                
                try {
                    if (editingTask) {
                        await api.chores.update(editingTask.id, taskData);
                    } else {
                        await api.chores.create(taskData);
                    }
                    
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                    
                } catch (err) {
                    handleError(err);
                }
            }, [api, editingTask, loadData, handleError]);
            
            // User management handlers
            const handleAddUser = useCallback(async (userData) => {
                if (!api) return;
                
                try {
                    await api.users.add(userData.id, userData.name, userData.color, userData.avatar);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleDeleteUser = useCallback(async (userId) => {
                if (!api) return;
                
                try {
                    await api.users.delete(userId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Theme settings handler
            const handleThemeChange = useCallback(async (newTheme) => {
                if (!api) return;
                
                try {
                    await api.theme.save(newTheme);
                    setThemeSettings(newTheme);
                    setShowThemeSettings(false);
                } catch (err) {
                    handleError(err);
                }
            }, [api, handleError]);
            
            // Description toggle handler
            const handleToggleDescription = useCallback((choreId, isOpen) => {
                if (isOpen) {
                    const chore = chores.find(c => c.id === choreId || c.chore_id === choreId);
                    setSelectedDescription(chore);
                } else {
                    setSelectedDescription(null);
                }
            }, [chores]);
            
            // Task categorization
            const overdueTasks = chores.filter(chore => {
                if (!chore.last_done || !window.choreUtils.isToday(chore.last_done)) {
                    return window.choreUtils.isDueOrOverdue(chore);
                }
                return false;
            });
            
            const todayTasks = chores.filter(chore => {
                const isCompletedToday = chore.last_done && window.choreUtils.isToday(chore.last_done);
                if (!isCompletedToday) {
                    return window.choreUtils.isDueToday(chore);
                }
                return false;
            });
            
            const upcomingTasks = chores.filter(chore => {
                const isCompletedToday = chore.last_done && window.choreUtils.isToday(chore.last_done);
                const isDueOrOverdue = window.choreUtils.isDueOrOverdue(chore);
                const isDueToday = window.choreUtils.isDueToday(chore);
                return !isCompletedToday && !isDueOrOverdue && !isDueToday;
            });
            
            const completedTasks = chores.filter(chore => 
                chore.last_done && window.choreUtils.isToday(chore.last_done)
            );
            
            // If still loading API, show loading state
            if (!api) {
                return h(Loading, { message: "Loading application..." });
            }
            
            // Main render
            return h('div', { className: 'app-container' },
                // Header
                h('div', { className: 'bg-white shadow-sm border-b mb-6' },
                    h('div', { className: 'container mx-auto px-4 py-4' },
                        h('div', { className: 'flex items-center justify-between' },
                            h('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Taken Dashboard'),
                            h('div', { className: 'flex space-x-2' },
                                h('button', {
                                    className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
                                    onClick: handleAddTask
                                }, 'Nieuwe Taak'),
                                h('button', {
                                    className: 'px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600',
                                    onClick: () => setShowUserManagement(true)
                                }, 'Gebruikers'),
                                h('button', {
                                    className: 'px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600',
                                    onClick: () => setShowThemeSettings(true)
                                }, 'Thema'),
                                h('button', {
                                    className: 'px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600',
                                    onClick: loadData
                                }, 'Vernieuw')
                            )
                        )
                    )
                ),
                
                // Main content
                h('div', { className: 'container mx-auto px-4' },
                    // Error display
                    error && h(ErrorMessage, { 
                        message: error, 
                        onRetry: hasAuthError ? null : loadData 
                    }),
                    
                    // Last completion notification
                    lastCompletion && h(Alert, {
                        type: 'success',
                        message: `${lastCompletion.chore_name} voltooid door ${lastCompletion.done_by}`,
                        onClose: () => setLastCompletion(null)
                    }),
                    
                    // Loading state
                    loading && h(Loading, { message: "Laden..." }),
                    
                    // Content when not loading
                    !loading && h('div', null,
                        // Overview stats
                        h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' },
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
                        
                        // User stats - FIXED SECTION
                        assignees.length > 0 && Object.keys(stats).length > 0 && h('div', { className: 'mb-6' },
                            h('h2', { className: 'text-lg font-semibold mb-4' }, 'Gebruiker Statistieken'),
                            h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' },
                                assignees.map(assignee => {
                                    const assigneeName = assignee.name || assignee.id;
                                    const assigneeStats = stats[assigneeName] || {
                                        tasks_completed: 0,
                                        total_tasks: 0,
                                        time_completed: 0,
                                        total_time: 0,
                                        streak: 0
                                    };
                                    
                                    return h(UserStatsCard, {
                                        key: assignee.id || assignee.name,
                                        assignee: assigneeName,  // Pass as string
                                        stats: assigneeStats,    // Pass actual stats object
                                        assignees: assignees     // Pass full assignees array
                                    });
                                })
                            )
                        ),
                        
                        // Task sections
                        loading ? h(Loading, { message: "Laden..." }) : h('div', { className: 'space-y-6' },
                            // Overdue tasks
                            overdueTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-xl font-semibold mb-4 text-red-600' }, 
                                    `🚨 Achterstallige Taken (${overdueTasks.length})`),
                                h('div', { className: 'grid gap-4' },
                                    overdueTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handleMarkDone,
                                            onEdit: handleEditTask,
                                            onToggleDescription: handleToggleDescription,
                                            assignees: assignees,
                                            onMarkSubtaskDone: handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Today's tasks
                            todayTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-xl font-semibold mb-4 text-orange-600' }, 
                                    `📅 Vandaag (${todayTasks.length})`),
                                h('div', { className: 'grid gap-4' },
                                    todayTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handleMarkDone,
                                            onEdit: handleEditTask,
                                            onToggleDescription: handleToggleDescription,
                                            assignees: assignees,
                                            onMarkSubtaskDone: handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Upcoming tasks
                            upcomingTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-xl font-semibold mb-4 text-blue-600' }, 
                                    `📋 Aankomend (${upcomingTasks.length})`),
                                h('div', { className: 'grid gap-4' },
                                    upcomingTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handleMarkDone,
                                            onEdit: handleEditTask,
                                            onToggleDescription: handleToggleDescription,
                                            assignees: assignees,
                                            onMarkSubtaskDone: handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Completed tasks
                            completedTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-xl font-semibold mb-4 text-green-600' }, 
                                    `✅ Voltooid Vandaag (${completedTasks.length})`),
                                h('div', { className: 'grid gap-4' },
                                    completedTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handleMarkDone,
                                            onEdit: handleEditTask,
                                            onToggleDescription: handleToggleDescription,
                                            assignees: assignees,
                                            onMarkSubtaskDone: handleMarkSubtaskDone
                                        })
                                    )
                                )
                            )
                        )
                    )
                ),
                
                // Modals
                showTaskForm && h(Modal, {
                    isOpen: showTaskForm,
                    onClose: () => setShowTaskForm(false),
                    title: editingTask ? 'Taak Bewerken' : 'Nieuwe Taak'
                },
                    h(TaskForm, {
                        task: editingTask,
                        assignees: assignees,
                        onSubmit: handleTaskFormSubmit,
                        onCancel: () => setShowTaskForm(false)
                    })
                ),
                
                showUserManagement && h(Modal, {
                    isOpen: showUserManagement,
                    onClose: () => setShowUserManagement(false),
                    title: 'Gebruiker Beheer'
                },
                    h(UserManagement, {
                        assignees: assignees,
                        onAddUser: handleAddUser,
                        onDeleteUser: handleDeleteUser,
                        onClose: () => setShowUserManagement(false)
                    })
                ),
                
                showThemeSettings && h(Modal, {
                    isOpen: showThemeSettings,
                    onClose: () => setShowThemeSettings(false),
                    title: 'Thema Instellingen'
                },
                    h(ThemeSettings, {
                        currentTheme: themeSettings,
                        onSave: handleThemeChange,
                        onCancel: () => setShowThemeSettings(false)
                    })
                ),
                
                selectedDescription && h(Modal, {
                    isOpen: !!selectedDescription,
                    onClose: () => setSelectedDescription(null),
                    title: `Beschrijving: ${selectedDescription.name}`
                },
                    h(TaskDescription, {
                        description: selectedDescription.description,
                        onClose: () => setSelectedDescription(null)
                    })
                )
            );
        }
        
        return h(App);
    }
    
    // Export for global access
    window.ChoresApp.ChoresApp = ChoresApp;
    
    console.log('Chores Dashboard App initialized successfully');
})();