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
            // Core State
            const [chores, setChores] = useState([]);
            const [assignees, setAssignees] = useState([]);
            const [stats, setStats] = useState({});
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(null);
            
            // UI State
            const [showTaskForm, setShowTaskForm] = useState(false);
            const [editingTask, setEditingTask] = useState(null);
            const [showUserManagement, setShowUserManagement] = useState(false);
            const [showThemeSettings, setShowThemeSettings] = useState(false);
            const [selectedDescription, setSelectedDescription] = useState(null);
            const [expandedDescriptions, setExpandedDescriptions] = useState({});
            
            // Dialog States - RESTORED: These were missing
            const [selectedCompletion, setSelectedCompletion] = useState(null);
            const [selectedSubtaskCompletion, setSelectedSubtaskCompletion] = useState(null);
            const [showConfirmDialog, setShowConfirmDialog] = useState(false);
            const [confirmDialogData, setConfirmDialogData] = useState(null);
            
            // Success/Error States - RESTORED
            const [lastCompletion, setLastCompletion] = useState(null);
            const [hasAuthError, setHasAuthError] = useState(false);
            
            // Theme State
            const [themeSettings, setThemeSettings] = useState({
                backgroundColor: '#ffffff',
                cardColor: '#f8f8f8', 
                primaryTextColor: '#000000',
                secondaryTextColor: '#333333'
            });
            
            // API State
            const [api, setApi] = useState(null);
            
            // Error handler - RESTORED
            const handleError = useCallback((err) => {
                console.error('App error:', err);
                setError(err.message || 'Er is een onbekende fout opgetreden');
                
                // Check for auth errors
                if (err.message?.includes('401') || err.message?.includes('authentication')) {
                    setHasAuthError(true);
                }
            }, []);
            
            // Initialize API
            useEffect(() => {
                const initializeAPI = async () => {
                    try {
                        if (window.ChoresAPI && window.ChoresAPI.initialize) {
                            console.log('Initializing Chores Dashboard App');
                            
                            // Check what's available in ChoresAPI
                            const apiMethods = Object.keys(window.ChoresAPI);
                            console.log('ChoresAPI available methods:', apiMethods);
                            
                            await window.ChoresAPI.initialize();
                            console.log('API initialized successfully');
                            
                            setApi(window.ChoresAPI);
                        } else {
                            throw new Error('ChoresAPI not available');
                        }
                    } catch (error) {
                        console.error('Failed to initialize API:', error);
                        handleError(error);
                        setLoading(false);
                    }
                };
                
                initializeAPI();
            }, [handleError]);
            
            // Load data - RESTORED: More comprehensive version
            const loadData = useCallback(async () => {
                if (!api) return;
                
                try {
                    setLoading(true);
                    console.log('Loading data with API:', api);
                    console.log('getSensorState type:', typeof api.getSensorState);
                    
                    // Load sensor state
                    const state = await api.getSensorState('sensor.chores_overview');
                    console.log('Loaded state:', state);
                    
                    if (state && state.attributes) {
                        const { chores = [], assignees = [], stats = {} } = state.attributes;
                        
                        // Update chores with processing flags reset
                        const processedChores = chores.map(chore => ({
                            ...chore,
                            isProcessing: false
                        }));
                        
                        setChores(processedChores);
                        setAssignees(assignees);
                        setStats(stats);
                    }
                    
                } catch (err) {
                    handleError(err);
                } finally {
                    setLoading(false);
                }
            }, [api, handleError]);
            
            // Theme loading - RESTORED
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
            
            // Task completion handler - RESTORED: With dialog logic
            const handleMarkDone = useCallback(async (choreId, userId) => {
                if (!api) return;
                
                // If no userId provided and multiple assignees, show selection dialog
                if (!userId && assignees.length > 1) {
                    setSelectedCompletion({ choreId, defaultUser: assignees[0]?.name || 'Wie kan' });
                    return;
                }
                
                // Add processing state to provide immediate feedback
                setChores(chores => 
                    chores.map(chore => 
                        (chore.chore_id === choreId || chore.id === choreId)
                            ? { ...chore, isProcessing: true }
                            : chore
                    )
                );
                
                try {
                    await api.chores.markDone(choreId, userId || assignees[0]?.name || 'Wie kan');
                    setLastCompletion({ 
                        choreId, 
                        person: userId || assignees[0]?.name || 'Wie kan', 
                        time: Date.now() 
                    });
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
            }, [api, assignees, loadData, handleError]);
            
            // Completion confirmation handler - RESTORED
            const handleCompletionConfirm = useCallback(async (selectedUser) => {
                if (selectedCompletion) {
                    await handleMarkDone(selectedCompletion.choreId, selectedUser);
                    setSelectedCompletion(null);
                }
            }, [selectedCompletion, handleMarkDone]);
            
            // Subtask completion handler - RESTORED
            const handleMarkSubtaskDone = useCallback(async (choreId, subtaskIndex, userId) => {
                if (!api) return;
                
                // If no userId provided and multiple assignees, show selection dialog
                if (!userId && assignees.length > 1) {
                    const chore = chores.find(c => (c.id || c.chore_id) === choreId);
                    setSelectedSubtaskCompletion({ 
                        chore, 
                        subtaskIndex, 
                        defaultUser: assignees[0]?.name || 'Wie kan' 
                    });
                    return;
                }
                
                try {
                    await api.chores.completeSubtask(subtaskIndex, userId || assignees[0]?.name || 'Wie kan');
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, assignees, chores, loadData, handleError]);
            
            // Subtask completion confirmation handler - RESTORED
            const handleSubtaskCompletionConfirm = useCallback(async (subtaskIndex, selectedUser) => {
                if (selectedSubtaskCompletion) {
                    await handleMarkSubtaskDone(
                        selectedSubtaskCompletion.chore.id || selectedSubtaskCompletion.chore.chore_id,
                        subtaskIndex,
                        selectedUser
                    );
                    setSelectedSubtaskCompletion(null);
                }
            }, [selectedSubtaskCompletion, handleMarkSubtaskDone]);
            
            // Task form submission - RESTORED
            const handleTaskFormSubmit = useCallback(async (formData) => {
                if (!api) return;
                
                try {
                    if (editingTask) {
                        await api.chores.updateDescription(editingTask.chore_id || editingTask.id, formData);
                    } else {
                        await api.chores.addChore(formData);
                    }
                    
                    setShowTaskForm(false);
                    setEditingTask(null);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, editingTask, loadData, handleError]);
            
            // Task editing - RESTORED
            const handleEditTask = useCallback((chore) => {
                setEditingTask(chore);
                setShowTaskForm(true);
            }, []);
            
            // Task deletion - RESTORED
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
            
            // Completion reset - RESTORED
            const handleResetCompletion = useCallback(async (choreId) => {
                if (!api) return;
                
                try {
                    await api.chores.resetChore(choreId);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [api, loadData, handleError]);
            
            // User management - RESTORED
            const handleSaveUsers = useCallback(async (users) => {
                try {
                    setAssignees(users);
                    setShowUserManagement(false);
                    await loadData();
                } catch (err) {
                    handleError(err);
                }
            }, [loadData, handleError]);
            
            // Theme changes - RESTORED
            const handleSaveTheme = useCallback(async (theme) => {
                if (!api) return;
                
                try {
                    if (api.theme && api.theme.save) {
                        await api.theme.save(theme.primaryColor, theme.accentColor);
                    }
                    
                    setThemeSettings(theme);
                    // Apply theme immediately
                    const root = document.documentElement;
                    root.style.setProperty('--theme-background', theme.backgroundColor);
                    root.style.setProperty('--theme-card', theme.cardColor);
                    root.style.setProperty('--theme-primary-text', theme.primaryTextColor);
                    root.style.setProperty('--theme-secondary-text', theme.secondaryTextColor);
                    
                    setShowThemeSettings(false);
                } catch (err) {
                    handleError(err);
                }
            }, [api, handleError]);
            
            // Description toggle - RESTORED
            const handleToggleDescription = useCallback((choreId, expanded) => {
                setExpandedDescriptions(prev => ({
                    ...prev,
                    [choreId]: expanded
                }));
                
                // If expanded, set selected description for modal
                if (expanded) {
                    const chore = chores.find(c => (c.id || c.chore_id) === choreId);
                    if (chore && chore.description) {
                        setSelectedDescription({
                            id: choreId,
                            name: chore.name,
                            description: chore.description
                        });
                    }
                }
            }, [chores]);
            
            // Clear error - RESTORED
            const clearError = useCallback(() => {
                setError(null);
                setHasAuthError(false);
            }, []);
            
            // Clear success message - RESTORED
            const clearLastCompletion = useCallback(() => {
                setLastCompletion(null);
            }, []);
            
            // Cancel dialogs - RESTORED
            const cancelCompletionDialog = useCallback(() => {
                setSelectedCompletion(null);
            }, []);
            
            const cancelSubtaskDialog = useCallback(() => {
                setSelectedSubtaskCompletion(null);
            }, []);
            
            // Separate tasks by completion status
            const pendingTasks = chores.filter(chore => !chore.completed_today);
            const completedTasks = chores.filter(chore => chore.completed_today);
            
            // Available assignees for dialogs - RESTORED
            const availableAssignees = assignees.length > 0
                ? assignees.filter(a => a.name !== "Wie kan").map(a => a.name)
                : ["Laura", "Martijn", "Samen"];
            
            // Error boundary component - RESTORED
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
                        return h('div', { className: 'error-container p-4' },
                            h('h2', { className: 'text-xl font-semibold text-red-600' }, 'Er is een fout opgetreden'),
                            h('p', { className: 'text-gray-600 mt-2' }, this.state.error?.message || 'Er is een onverwachte fout opgetreden'),
                            h('button', {
                                className: 'mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
                                onClick: () => window.location.reload()
                            }, 'Pagina herladen')
                        );
                    }
                    
                    return this.props.children;
                }
            }
            
            return h(ErrorBoundary, null,
                h('div', { 
                    className: "min-h-screen bg-gray-100 font-sans",
                    style: { 
                        backgroundColor: themeSettings.backgroundColor || '#f3f4f6',
                        color: themeSettings.primaryTextColor || '#111827'
                    }
                },
                    // Header
                    h('header', { className: "bg-white shadow-sm border-b" },
                        h('div', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" },
                            h('div', { className: "flex justify-between items-center py-4" },
                                h('div', { className: "flex items-center space-x-4" },
                                    h('h1', { className: "text-2xl font-bold text-gray-900" }, "🏠 Klusjes Dashboard"),
                                    hasAuthError && h('span', { className: "text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded" }, 
                                        "Auth issue - check config")
                                ),
                                h('div', { className: "flex space-x-2" },
                                    h('button', {
                                        className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                                        onClick: () => setShowTaskForm(true)
                                    }, "Nieuwe Taak"),
                                    h('button', {
                                        className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                                        onClick: () => setShowUserManagement(true)
                                    }, "Gebruikers"),
                                    h('button', {
                                        className: "px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600",
                                        onClick: () => setShowThemeSettings(true)
                                    }, "Thema"),
                                    h('button', {
                                        className: "px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600",
                                        onClick: loadData
                                    }, "↻")
                                )
                            )
                        )
                    ),
                    
                    // Main content
                    h('main', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" },
                        // Loading state
                        loading && h(Loading, { message: "Taken laden..." }),
                        
                        // Error state
                        error && h(ErrorMessage, { 
                            message: error, 
                            onRetry: loadData,
                            onDismiss: clearError
                        }),
                        
                        // Success message for completed tasks - RESTORED
                        lastCompletion && h(Alert, {
                            type: "success",
                            message: `Taak voltooid door ${lastCompletion.person}! 🎉`,
                            onDismiss: clearLastCompletion
                        }),
                        
                        // Statistics
                        !loading && !error && stats && Object.keys(stats).length > 0 && h('div', { className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" },
                            h(StatsCard, {
                                title: "Vandaag Voltooid",
                                value: stats.completed_today || 0,
                                icon: "✅",
                                color: "green"
                            }),
                            h(StatsCard, {
                                title: "Nog Te Doen",
                                value: stats.pending_today || 0,
                                icon: "⏰",
                                color: "orange"
                            }),
                            h(StatsCard, {
                                title: "Deze Week",
                                value: stats.completed_this_week || 0,
                                icon: "📅",
                                color: "blue"
                            })
                        ),
                        
                        // User stats - RESTORED
                        !loading && !error && assignees.length > 0 && h('div', { className: "mb-8" },
                            h('h2', { className: "text-xl font-semibold mb-4" }, "Statistieken per Gebruiker"),
                            h('div', { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" },
                                assignees.filter(assignee => assignee !== 'Wie kan').map(assignee =>
                                    h(UserStatsCard, {
                                        key: assignee,
                                        user: assignee,
                                        stats: stats.user_stats?.[assignee] || {},
                                        color: themeSettings.primaryColor || '#3B82F6'
                                    })
                                )
                            )
                        ),
                        
                        // Tasks
                        !loading && !error && h('div', { className: "space-y-8" },
                            // Pending tasks
                            pendingTasks.length > 0 && h('div', null,
                                h('h2', { className: 'text-xl font-semibold mb-4' }, 
                                    `📋 Te Doen Vandaag (${pendingTasks.length})`),
                                h('div', { className: 'grid gap-4' },
                                    pendingTasks.map(chore =>
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
                            users: assignees,
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
                        isOpen: true,
                        onClose: () => setSelectedDescription(null),
                        title: `Beschrijving: ${selectedDescription.name}`
                    },
                        h(TaskDescription, {
                            description: selectedDescription.description,
                            onClose: () => setSelectedDescription(null)
                        })
                    ),
                    
                    // Completion confirmation dialog - RESTORED
                    selectedCompletion && h(CompletionConfirmDialog, {
                        isOpen: true,
                        title: "Taak voltooien",
                        message: "Wie heeft deze taak voltooid?",
                        onConfirm: handleCompletionConfirm,
                        onCancel: cancelCompletionDialog,
                        assignees: availableAssignees,
                        defaultUser: selectedCompletion.defaultUser
                    }),
                    
                    // Subtask completion dialog - RESTORED
                    selectedSubtaskCompletion && h(SubtaskCompletionDialog, {
                        isOpen: true,
                        chore: selectedSubtaskCompletion.chore,
                        onComplete: handleSubtaskCompletionConfirm,
                        onCancel: cancelSubtaskDialog,
                        assignees: availableAssignees,
                        defaultUser: selectedSubtaskCompletion.defaultUser
                    }),
                    
                    // Confirm dialog - RESTORED
                    showConfirmDialog && confirmDialogData && h(ConfirmDialog, {
                        isOpen: showConfirmDialog,
                        title: confirmDialogData.title,
                        message: confirmDialogData.message,
                        onConfirm: () => {
                            confirmDialogData.onConfirm();
                            setShowConfirmDialog(false);
                            setConfirmDialogData(null);
                        },
                        onCancel: () => {
                            setShowConfirmDialog(false);
                            setConfirmDialogData(null);
                        }
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
     * RESTORED: Complete initialization function
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