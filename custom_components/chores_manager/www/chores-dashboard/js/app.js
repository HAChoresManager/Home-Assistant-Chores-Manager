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
            SubtaskCompletionDialog,
            TaskDescription
        } = window.choreComponents;
        
        const h = React.createElement;
        
        // Main app component
        function App() {
            // State management
            const [chores, setChores] = useState([]);
            const [assignees, setAssignees] = useState([]);
            const [stats, setStats] = useState({});
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            const [showTaskForm, setShowTaskForm] = useState(false);
            const [editingTask, setEditingTask] = useState(null);
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [lastCompletion, setLastCompletion] = useState(null);
            const [themeSettings, setThemeSettings] = useState({
                backgroundColor: '#ffffff',
                cardColor: '#f8f8f8', 
                primaryTextColor: '#000000',
                secondaryTextColor: '#333333'
            });
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [hasAuthError, setHasAuthError] = useState(false);
            const [expandedDescriptions, setExpandedDescriptions] = useState({});
            
            // API instances
            const [api, setApi] = useState(null);
            
            // Initialize API on component mount
            useEffect(() => {
                async function initializeAPI() {
                    try {
                        console.log('Initializing Chores Dashboard App');
                        
                        // Wait for ChoresAPI to be ready
                        let attempts = 0;
                        while (!window.ChoresAPI || !window.ChoresAPI.getSensorState) {
                            if (attempts > 20) { // 2 seconds timeout
                                throw new Error('ChoresAPI not properly initialized after timeout');
                            }
                            console.log('Waiting for ChoresAPI to be ready...');
                            await new Promise(resolve => setTimeout(resolve, 100));
                            attempts++;
                        }
                        
                        // Check if all dependencies are loaded
                        if (!window.ChoresAPI) {
                            console.error('ChoresAPI not found');
                            return;
                        }
                        
                        // Log what's available on ChoresAPI
                        console.log('ChoresAPI available methods:', Object.keys(window.ChoresAPI).filter(key => typeof window.ChoresAPI[key] === 'function'));
                        
                        // Use the API instance directly (it's already initialized)
                        const apiInstance = window.ChoresAPI;
                        
                        // Verify critical methods exist
                        if (typeof apiInstance.getSensorState !== 'function') {
                            console.error('getSensorState method not found on ChoresAPI');
                            console.log('Available ChoresAPI properties:', Object.keys(apiInstance));
                            throw new Error('API method getSensorState not available');
                        }
                        
                        // Initialize if it has an initialize method
                        if (typeof apiInstance.initialize === 'function') {
                            await apiInstance.initialize();
                        }
                        
                        console.log('API initialized successfully');
                        setApi(apiInstance);
                        setError(null);
                        
                    } catch (err) {
                        console.error('Failed to initialize API:', err);
                        setError('Failed to initialize application: ' + err.message);
                    }
                }
                
                initializeAPI();
            }, []);
            
            // Load data when API is ready
            useEffect(() => {
                if (api) {
                    loadData();
                    // Set up auto-refresh every 30 seconds
                    const interval = setInterval(loadData, 30000);
                    return () => clearInterval(interval);
                }
            }, [api]);
            
            // Apply theme changes
            useEffect(() => {
                if (themeSettings) {
                    // Apply theme CSS variables
                    const root = document.documentElement;
                    root.style.setProperty('--theme-background', themeSettings.backgroundColor || '#ffffff');
                    root.style.setProperty('--theme-card-color', themeSettings.cardColor || '#f8f8f8');
                    root.style.setProperty('--theme-primary-text', themeSettings.primaryTextColor || '#000000');
                    root.style.setProperty('--theme-secondary-text', themeSettings.secondaryTextColor || '#333333');
                    
                    // Apply to body for immediate effect
                    document.body.style.backgroundColor = themeSettings.backgroundColor || '#ffffff';
                    document.body.style.color = themeSettings.primaryTextColor || '#000000';
                }
            }, [themeSettings]);
            
            // Data loading function
            const loadData = useCallback(async () => {
                if (!api) return;
                
                try {
                    setLoading(true);
                    
                    // Debug log
                    console.log('Loading data with API:', api);
                    console.log('getSensorState type:', typeof api.getSensorState);
                    
                    // Call the API method
                    const sensorData = await api.getSensorState();
                    
                    if (sensorData && sensorData.attributes) {
                        setChores(sensorData.attributes.overdue_tasks || []);
                        setAssignees(sensorData.attributes.assignees || []);
                        setStats(sensorData.attributes.stats || {});
                        setLastCompletion(sensorData.attributes.last_completion || null);
                        setThemeSettings(sensorData.attributes.theme_settings || { 
                            backgroundColor: '#ffffff',
                            cardColor: '#f8f8f8',
                            primaryTextColor: '#000000',
                            secondaryTextColor: '#333333'
                        });
                    } else {
                        console.warn('No attributes in sensor data:', sensorData);
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
                        setError('Failed to load data: ' + err.message);
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
            const handleTaskComplete = useCallback(async (choreId, userId, subtaskIndex = null) => {
                try {
                    if (subtaskIndex !== null && subtaskIndex !== undefined) {
                        await api.chores.completeSubtask(choreId, subtaskIndex);
                    } else {
                        await api.chores.markDone(choreId, userId);
                    }
                    setLastCompletion({
                        choreId,
                        userId,
                        timestamp: new Date().toISOString()
                    });
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Mark done handler
            const handleMarkDone = useCallback(async (choreId, userId) => {
                if (!api) return;
                
                // Mark chore as processing
                setChores(chores => 
                    chores.map(chore => 
                        (chore.chore_id === choreId || chore.id === choreId)
                            ? { ...chore, isProcessing: true }
                            : chore
                    )
                );
                
                try {
                    await api.chores.markDone(choreId, userId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                } finally {
                    // Remove processing state
                    setChores(chores => 
                        chores.map(chore => 
                            (chore.chore_id === choreId || chore.id === choreId)
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
                        // Update existing task
                        if (taskData.name !== editingTask.name) {
                            await api.chores.updateDescription(editingTask.chore_id, taskData.name);
                        }
                        // Note: Other updates would need additional API methods
                    } else {
                        // Add new task
                        await api.chores.addChore(
                            taskData.name,
                            taskData.description,
                            taskData.frequency,
                            taskData.frequency_unit,
                            taskData.assignee,
                            taskData.priority,
                            taskData.duration,
                            taskData.icon
                        );
                    }
                    
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                    
                } catch (err) {
                    handleError(err);
                }
            }, [api, editingTask, loadData, handleError]);
            
            // Task deletion handler
            const handleDeleteTask = useCallback(async (choreId) => {
                try {
                    await api.chores.deleteChore(choreId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Toggle description handler
            const handleToggleDescription = useCallback((choreId, isExpanded) => {
                setExpandedDescriptions(prev => ({
                    ...prev,
                    [choreId]: isExpanded
                }));
            }, []);
            
            // User management handlers
            const handleAddUser = useCallback(async (userId, name, color, avatar) => {
                try {
                    await api.users.addUser(userId, name, color, avatar);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleDeleteUser = useCallback(async (userId) => {
                try {
                    await api.users.deleteUser(userId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Theme save handler
            const handleSaveTheme = useCallback(async (colors) => {
                try {
                    await api.theme.saveTheme(colors);
                    setThemeSettings(colors);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // Filter tasks by status
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
            
            // Render error state
            if (error && !chores.length && !loading) {
                return h('div', { className: 'max-w-4xl mx-auto p-4' },
                    h(ErrorMessage, { 
                        message: error,
                        onRetry: hasAuthError ? null : loadData
                    })
                );
            }
            
            // Main render
            return h('div', { className: 'app-container' },
                // Header
                h('div', { className: 'bg-white shadow-sm border-b mb-6' },
                    h('div', { className: 'container mx-auto px-4 py-4' },
                        h('div', { className: 'flex items-center justify-between' },
                            h('h1', { className: 'text-2xl font-bold' }, 'Huishoudelijke Taken'),
                            h('div', { className: 'flex items-center space-x-2' },
                                h('button', {
                                    onClick: () => setShowThemeSettings(true),
                                    className: 'p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors',
                                    title: 'Thema Instellingen'
                                }, '🎨'),
                                h('button', {
                                    onClick: () => setShowUserManagement(true),
                                    className: 'p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors',
                                    title: 'Gebruikers Beheren'
                                }, '👥'),
                                h('button', {
                                    onClick: handleAddTask,
                                    className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2'
                                },
                                    h('span', null, '+'),
                                    h('span', null, 'Nieuwe Taak')
                                )
                            )
                        )
                    )
                ),
                
                // Main content
                h('div', { className: 'container mx-auto px-4' },
                    // Error banner
                    error && h('div', { className: 'mb-6' },
                        h(Alert, { 
                            type: 'error',
                            message: error,
                            onDismiss: () => setError(null)
                        })
                    ),
                    
                    // Stats overview
                    h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' },
                        h(StatsCard, {
                            title: 'Achterstallig',
                            value: overdueTasks.length,
                            color: 'red',
                            icon: '🚨'
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
                        }),
                        h(StatsCard, {
                            title: 'Voltooid',
                            value: completedTasks.length,
                            color: 'blue',
                            icon: '✅'
                        })
                    ),
                    
                    // User stats
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
                                    assignee: assigneeName,
                                    stats: assigneeStats,
                                    assignees: assignees
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
                        ),
                        
                        // Empty state
                        chores.length === 0 && !loading && h('div', { 
                            className: 'text-center py-12 bg-white rounded-lg shadow-sm' 
                        },
                            h('p', { className: 'text-gray-500' }, 
                                'Geen taken gevonden. Klik op "Nieuwe Taak" om te beginnen.'
                            )
                        )
                    )
                ),
                
                // Modals
                showTaskForm && h(Modal, {
                    isOpen: showTaskForm,
                    onClose: () => {
                        setShowTaskForm(false);
                        setEditingTask(null);
                    },
                    title: editingTask ? 'Taak Bewerken' : 'Nieuwe Taak'
                },
                    h(TaskForm, {
                        task: editingTask,
                        users: assignees,
                        onSave: handleTaskFormSubmit,
                        onCancel: () => {
                            setShowTaskForm(false);
                            setEditingTask(null);
                        }
                    })
                ),
                
                showUserManagement && h(Modal, {
                    isOpen: true,
                    onClose: () => setShowUserManagement(false),
                    title: 'Gebruikers Beheren'
                },
                    h(UserManagement, {
                        users: assignees,
                        onAddUser: handleAddUser,
                        onDeleteUser: handleDeleteUser,
                        onClose: () => setShowUserManagement(false),
                        api: api
                    })
                ),
                
                showThemeSettings && h(Modal, {
                    isOpen: true,
                    onClose: () => setShowThemeSettings(false),
                    title: 'Thema Instellingen'
                },
                    h(ThemeSettings, {
                        currentTheme: themeSettings,
                        onSave: handleSaveTheme,
                        onClose: () => setShowThemeSettings(false)
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
    
    /**
     * Initialize the React application
     * FIXED VERSION - Only this function updated to fix React Error #130
     */
    window.ChoresApp.initApp = function() {
        console.log('Initializing Chores Dashboard React App...');
        
        try {
            // Get the root element
            const rootElement = document.getElementById('root');
            if (!rootElement) {
                throw new Error('Root element not found');
            }
            
            // Check if ReactDOM is available
            if (!window.ReactDOM) {
                throw new Error('ReactDOM not available');
            }
            
            // Create and render the app with error boundary
            const AppWithErrorBoundary = React.createElement(
                class ErrorBoundary extends React.Component {
                    constructor(props) {
                        super(props);
                        this.state = { hasError: false, error: null };
                    }
                    
                    static getDerivedStateFromError(error) {
                        return { hasError: true, error };
                    }
                    
                    componentDidCatch(error, errorInfo) {
                        console.error('React Error Boundary caught an error:', error, errorInfo);
                    }
                    
                    render() {
                        if (this.state.hasError) {
                            return React.createElement('div', { className: 'error-container', style: { padding: '20px', textAlign: 'center' } },
                                React.createElement('h2', null, 'Dashboard Error'),
                                React.createElement('p', null, `Error: ${this.state.error?.message || 'Unknown error'}`),
                                React.createElement('pre', { style: { textAlign: 'left', background: '#f5f5f5', padding: '10px', borderRadius: '4px' } }, this.state.error?.stack || ''),
                                React.createElement('button', {
                                    onClick: () => window.location.reload(),
                                    style: { marginTop: '10px', padding: '5px 10px' }
                                }, 'Reload Page')
                            );
                        }
                        return React.createElement(ChoresApp);
                    }
                }
            );
            
            // Clear any existing content
            rootElement.innerHTML = '';
            
            // Use React 18 createRoot if available, otherwise fallback to React 17
            if (window.ReactDOM.createRoot) {
                console.log('Using React 18 createRoot API...');
                const root = window.ReactDOM.createRoot(rootElement);
                root.render(AppWithErrorBoundary);
            } else {
                console.log('Using React 17 render API...');
                window.ReactDOM.render(AppWithErrorBoundary, rootElement);
            }
            
            console.log('Chores Dashboard initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize React app:', error);
            
            // Show error in the root element as fallback
            const rootElement = document.getElementById('root');
            if (rootElement) {
                rootElement.innerHTML = `
                    <div class="error-container" style="padding: 20px; text-align: center;">
                        <h2>Initialization Error</h2>
                        <p>Failed to initialize the React application: ${error.message}</p>
                        <pre style="text-align: left; background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">${error.stack || ''}</pre>
                        <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px;">
                            Reload Page
                        </button>
                    </div>
                `;
            }
            
            throw error;
        }
    };
    
    console.log('Chores Dashboard App initialized successfully');
})();