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
                    console.log('Initializing Chores Dashboard App');
                    
                    try {
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
                        
                        // Get available APIs
                        const availableMethods = Object.keys(window.ChoresAPI);
                        console.log('ChoresAPI available methods:', availableMethods);
                        
                        // The API is already initialized by api/index.js
                        // Get the instances that were created
                        const apiObject = {
                            chores: window.ChoresAPI.chores,
                            users: window.ChoresAPI.users,
                            theme: window.ChoresAPI.theme,
                            sensor: window.ChoresAPI.sensor,
                            getSensorState: window.ChoresAPI.getSensorState,
                            getAuthToken: window.ChoresAPI.getAuthToken
                        };
                        
                        // If instances aren't available, create them
                        if (!apiObject.chores && window.ChoresAPI.ChoresAPI) {
                            apiObject.chores = new window.ChoresAPI.ChoresAPI();
                        }
                        if (!apiObject.users && window.ChoresAPI.UsersAPI) {
                            apiObject.users = new window.ChoresAPI.UsersAPI();
                        }
                        if (!apiObject.theme && window.ChoresAPI.ThemeAPI) {
                            apiObject.theme = new window.ChoresAPI.ThemeAPI();
                        }
                        
                        // Verify critical methods exist
                        if (typeof apiObject.getSensorState !== 'function') {
                            throw new Error('getSensorState method not available');
                        }
                        
                        console.log('API initialized successfully');
                        setApi(apiObject);
                        
                    } catch (err) {
                        console.error('Failed to initialize API:', err);
                        setError(err.message);
                    }
                }
                
                initializeAPI();
            }, []);
            
            // Error handler
            const handleError = useCallback((err) => {
                console.error('App error:', err);
                if (err.message && err.message.includes('401')) {
                    setHasAuthError(true);
                }
                setError(err.message || 'Er is een fout opgetreden');
            }, []);
            
            // Data loading
            const loadData = useCallback(async () => {
                if (!api || !api.getSensorState) return;
                
                console.log('Loading data with API:', api);
                console.log('getSensorState type:', typeof api.getSensorState);
                
                setLoading(true);
                setError(null);
                
                try {
                    const state = await api.getSensorState();
                    console.log('Loaded state:', state);
                    
                    if (state) {
                        setChores(state.chores || []);
                        setStats(state.stats || {});
                        
                        // Extract unique assignees from state
                        const uniqueAssignees = new Set();
                        
                        // Add assignees from stats
                        Object.keys(state.stats || {}).forEach(name => {
                            if (name !== 'Wie kan') {
                                uniqueAssignees.add(name);
                            }
                        });
                        
                        // Add assignees from chores
                        (state.chores || []).forEach(chore => {
                            if (chore.assigned_to && chore.assigned_to !== 'Wie kan') {
                                uniqueAssignees.add(chore.assigned_to);
                            }
                        });
                        
                        // Convert to array format
                        const assigneesList = Array.from(uniqueAssignees).map(name => ({
                            name,
                            color: state.stats[name]?.color || '#cccccc'
                        }));
                        
                        setAssignees(assigneesList);
                    }
                } catch (err) {
                    handleError(err);
                } finally {
                    setLoading(false);
                }
            }, [api, handleError]);
            
            // Theme loading
            const loadTheme = useCallback(async () => {
                if (!api?.theme) return;
                
                try {
                    const settings = await api.theme.get();
                    if (settings) {
                        setThemeSettings(settings);
                        // Apply theme to CSS variables
                        const root = document.documentElement;
                        root.style.setProperty('--theme-background', settings.backgroundColor);
                        root.style.setProperty('--theme-card', settings.cardColor);
                        root.style.setProperty('--theme-primary-text', settings.primaryTextColor);
                        root.style.setProperty('--theme-secondary-text', settings.secondaryTextColor);
                    }
                } catch (err) {
                    console.error('Failed to load theme:', err);
                }
            }, [api]);
            
            // Load data when API is ready
            useEffect(() => {
                if (api) {
                    loadData();
                    loadTheme();
                }
            }, [api, loadData, loadTheme]);
            
            // Task completion handler
            const handleMarkDone = useCallback(async (choreId, userId) => {
                if (!api) return;
                
                // Add processing state to provide immediate feedback
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
                    // Note: subtaskIndex might actually be the subtask_id
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
                        // For now, we can only update the name/description via API
                        if (taskData.name !== editingTask.name) {
                            await api.chores.updateDescription(editingTask.chore_id, taskData.name);
                        }
                        // Full update would require updating the chore completely
                        // So we'll do a delete and re-add for now
                        await api.chores.deleteChore(editingTask.chore_id);
                        
                        // Add as new with same ID
                        const updateData = {
                            ...taskData,
                            chore_id: editingTask.chore_id
                        };
                        await api.chores.addChore(updateData);
                    } else {
                        // Add new task - generate unique ID
                        const newChoreId = `chore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        
                        // Map form data to API expected format
                        const choreData = {
                            chore_id: newChoreId,
                            name: taskData.name,
                            description: taskData.description || '',
                            frequency_type: taskData.frequency_type || 'Wekelijks',
                            frequency_days: taskData.frequency_days || 7,
                            frequency_times: taskData.frequency_times || 1,
                            assigned_to: taskData.assigned_to || 'Wie kan',
                            priority: taskData.priority || 'Middel',
                            duration: taskData.duration || 15,
                            icon: taskData.icon || '📋',
                            use_alternating: taskData.use_alternating || false,
                            alternate_with: taskData.alternate_with || '',
                            weekday: taskData.weekday !== undefined ? taskData.weekday : -1,
                            monthday: taskData.monthday || -1,
                            active_days: taskData.active_days || null,
                            active_monthdays: taskData.active_monthdays || null,
                            selected_weekdays: taskData.selected_weekdays || null,
                            has_subtasks: taskData.has_subtasks || false,
                            subtasks: taskData.has_subtasks ? taskData.subtasks : null
                        };
                        
                        await api.chores.addChore(choreData);
                    }
                    
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, editingTask, loadData, handleError]);
            
            const handleDeleteTask = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.deleteChore(choreId);
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            const handleResetCompletion = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.resetChore(choreId);
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // User management handlers
            const handleSaveUsers = useCallback(async (users) => {
                // This is called after UserManagement handles add/delete internally
                // We just need to reload data
                await loadData();
            }, [loadData]);
            
            // Theme handler
            const handleSaveTheme = useCallback(async (themeData) => {
                if (!api) return;
                
                try {
                    await api.theme.save(themeData);
                    setThemeSettings(themeData);
                    
                    // Apply theme immediately
                    const root = document.documentElement;
                    root.style.setProperty('--theme-background', themeData.backgroundColor);
                    root.style.setProperty('--theme-card', themeData.cardColor);
                    root.style.setProperty('--theme-primary-text', themeData.primaryTextColor);
                    root.style.setProperty('--theme-secondary-text', themeData.secondaryTextColor);
                    
                    setShowThemeSettings(false);
                } catch (err) {
                    handleError(err);
                }
            }, [api, handleError]);
            
            // Description toggle handler
            const handleToggleDescription = useCallback((choreId, isExpanded) => {
                setExpandedDescriptions(prev => ({
                    ...prev,
                    [choreId]: isExpanded
                }));
            }, []);
            
            // Chore filtering
            const overdueTasks = chores.filter(c => c.is_overdue && (!c.last_done || !window.choreUtils.isToday(c.last_done)));
            const todayTasks = chores.filter(c => c.is_due_today && !c.is_overdue && (!c.last_done || !window.choreUtils.isToday(c.last_done)));
            const upcomingTasks = chores.filter(c => !c.is_due_today && !c.is_overdue && (!c.last_done || !window.choreUtils.isToday(c.last_done)));
            const completedTasks = chores.filter(c => c.last_done && window.choreUtils.isToday(c.last_done));
            
            // Render
            return h('div', { className: 'chores-app' },
                // Header
                h('header', { className: 'app-header' },
                    h('div', { className: 'header-content' },
                        h('h1', { className: 'app-title' }, 'Huishoudelijke Taken'),
                        h('div', { className: 'header-actions' },
                            h('button', {
                                onClick: loadData,
                                className: 'btn-refresh',
                                disabled: loading
                            }, loading ? 'Laden...' : '↻ Vernieuwen'),
                            h('button', {
                                onClick: handleAddTask,
                                className: 'btn-primary'
                            }, '+ Nieuwe Taak'),
                            h('button', {
                                onClick: () => setShowUserManagement(true),
                                className: 'btn-secondary'
                            }, '👥 Gebruikers'),
                            h('button', {
                                onClick: () => setShowThemeSettings(true),
                                className: 'btn-secondary'
                            }, '🎨 Thema')
                        )
                    )
                ),
                
                // Error display
                error && h(Alert, {
                    type: 'error',
                    message: error,
                    onClose: () => setError(null)
                }),
                
                // Auth error
                hasAuthError && h('div', { className: 'auth-error' },
                    h('p', null, 'Authentication error. Please refresh the page to re-authenticate.')
                ),
                
                // Statistics overview cards
                !loading && h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' },
                    h(StatsCard, {
                        title: 'Achterstallig',
                        value: overdueTasks.length,
                        color: '#ef4444',
                        desc: '🚨'
                    }),
                    h(StatsCard, {
                        title: 'Vandaag',
                        value: todayTasks.length,
                        color: '#f59e0b',
                        desc: '📅'
                    }),
                    h(StatsCard, {
                        title: 'Aankomend',
                        value: upcomingTasks.length,
                        color: '#10b981',
                        desc: '📋'
                    }),
                    h(StatsCard, {
                        title: 'Voltooid',
                        value: completedTasks.length,
                        color: '#3b82f6',
                        desc: '✅'
                    })
                ),
                
                // User statistics section
                !loading && Object.keys(stats).length > 0 && h('section', { className: 'stats-section mb-6' },
                    h('h2', { className: 'text-xl font-semibold mb-4' }, 'Gebruiker Statistieken'),
                    h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' },
                        Object.entries(stats).map(([user, userStats]) =>
                            h(UserStatsCard, {
                                key: user,
                                assignee: user,  // Changed from userName to assignee
                                stats: userStats,
                                assignees: assignees
                            })
                        )
                    )
                ),
                
                // Tasks section
                h('section', { className: 'tasks-section' },
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
                        onSubmit: handleTaskFormSubmit,
                        onDelete: handleDeleteTask,
                        onCancel: () => {
                            setShowTaskForm(false);
                            setEditingTask(null);
                        },
                        onResetCompletion: handleResetCompletion,
                        initialData: editingTask,
                        assignees: assignees
                    })
                ),
                
                showUserManagement && h(Modal, {
                    isOpen: true,
                    onClose: () => setShowUserManagement(false),
                    title: 'Gebruikers Beheren'
                },
                    h(UserManagement, {
                        users: assignees,
                        onSave: handleSaveUsers,
                        onClose: () => setShowUserManagement(false)
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
                    isOpen: true,  // Fixed: was !selectedDescription
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
                        console.error('React Error Boundary caught:', error, errorInfo);
                    }
                    
                    render() {
                        if (this.state.hasError) {
                            return React.createElement('div', {
                                style: {
                                    padding: '20px',
                                    background: '#fee',
                                    border: '1px solid #fcc',
                                    borderRadius: '4px',
                                    margin: '20px'
                                }
                            },
                                React.createElement('h2', null, 'Er is een fout opgetreden'),
                                React.createElement('p', null, this.state.error?.message || 'Onbekende fout'),
                                React.createElement('button', {
                                    onClick: () => window.location.reload(),
                                    style: {
                                        padding: '10px 20px',
                                        background: '#007bff',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }
                                }, 'Pagina herladen')
                            );
                        }
                        
                        return this.props.children;
                    }
                },
                null,
                React.createElement(window.ChoresApp.ChoresApp)
            );
            
            // Check React version and use appropriate API
            const reactVersion = React.version;
            console.log('Using React ' + reactVersion);
            
            if (reactVersion && reactVersion.startsWith('18')) {
                // React 18 with createRoot
                console.log('Using React 18 createRoot API...');
                if (window.ReactDOM.createRoot) {
                    const root = window.ReactDOM.createRoot(rootElement);
                    root.render(AppWithErrorBoundary);
                    console.log('Chores Dashboard initialized successfully');
                } else {
                    // Fallback if createRoot is not available
                    window.ReactDOM.render(AppWithErrorBoundary, rootElement);
                    console.log('Chores Dashboard initialized successfully (fallback mode)');
                }
            } else {
                // React 17 or older
                window.ReactDOM.render(AppWithErrorBoundary, rootElement);
                console.log('Chores Dashboard initialized successfully');
            }
            
        } catch (error) {
            console.error('Failed to initialize Chores Dashboard:', error);
            document.getElementById('root').innerHTML = `
                <div style="padding: 20px; background: #fee; border: 1px solid #fcc; border-radius: 4px; margin: 20px;">
                    <h2>Initialization Error</h2>
                    <p>${error.message}</p>
                    <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Reload Page
                    </button>
                </div>
            `;
        }
    };
    
    console.log('Chores Dashboard App initialized successfully');
})();