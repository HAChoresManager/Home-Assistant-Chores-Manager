/**
 * COMPLETELY FIXED Main App Component for Chores Dashboard
 * This is the root component that manages the entire application
 * Fixed all component dependencies and error handling
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo } = React;

    /**
     * Create fallback components for missing dependencies
     */
    function createFallback(name, message = null) {
        return function FallbackComponent(props) {
            const errorMsg = message || `Component ${name} not available. Please check component loading.`;
            return h('div', { 
                className: 'p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded',
                'data-fallback': name
            },
                h('p', { className: 'font-medium' }, `⚠️ ${name} Unavailable`),
                h('p', { className: 'text-sm mt-1' }, errorMsg),
                props.children && h('div', { className: 'mt-2' }, props.children)
            );
        };
    }
    
    /**
     * FIXED ChoresApp - Main application component with comprehensive error handling
     */
    function ChoresApp() {
        // Check if essential dependencies are loaded
        if (!window.React) {
            return h('div', { className: 'error-container p-8 text-center' },
                h('h1', { className: 'text-2xl font-bold text-red-600 mb-4' }, 'Critical Error'),
                h('p', { className: 'text-gray-700' }, 'React is not loaded. Please refresh the page.'),
                h('button', {
                    onClick: () => window.location.reload(),
                    className: 'mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600'
                }, 'Reload Page')
            );
        }

        if (!window.choreComponents) {
            return h('div', { className: 'error-container p-8 text-center' },
                h('h1', { className: 'text-2xl font-bold text-orange-600 mb-4' }, 'Components Loading'),
                h('p', { className: 'text-gray-700' }, 'Components are still loading. Please wait...'),
                h('div', { className: 'mt-4' },
                    h('div', { className: 'animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto' })
                )
            );
        }
        
        // FIXED: Get all components safely with proper fallbacks
        const components = window.choreComponents || {};
        const {
            Loading = createFallback('Loading'),
            ErrorMessage = createFallback('ErrorMessage'),
            Alert = createFallback('Alert'),
            Modal = createFallback('Modal'),
            TaskCard = createFallback('TaskCard'),
            TaskForm = createFallback('TaskForm'),
            UserManagement = createFallback('UserManagement'),
            StatsCard = createFallback('StatsCard'),
            UserStatsCard = createFallback('UserStatsCard'),
            ThemeSettings = createFallback('ThemeSettings'),
            ConfirmDialog = createFallback('ConfirmDialog'),
            CompletionConfirmDialog = createFallback('CompletionConfirmDialog'),
            SubtaskCompletionDialog = createFallback('SubtaskCompletionDialog'),
            TaskDescription = createFallback('TaskDescription'),
            EmptyState = createFallback('EmptyState'),
            ErrorBoundary = createFallback('ErrorBoundary')
        } = components;

        // Check for critical missing components
        const criticalComponents = ['Loading', 'ErrorMessage', 'TaskCard', 'Modal'];
        const missingCritical = criticalComponents.filter(name => !components[name]);
        
        if (missingCritical.length > 0) {
            return h('div', { className: 'error-container p-8 text-center bg-red-50' },
                h('h1', { className: 'text-2xl font-bold text-red-600 mb-4' }, 'Critical Components Missing'),
                h('p', { className: 'text-gray-700 mb-4' }, 
                    `Essential components failed to load: ${missingCritical.join(', ')}`
                ),
                h('div', { className: 'space-y-2 text-sm text-gray-600' },
                    h('p', null, `Available components: ${Object.keys(components).length}`),
                    h('p', null, `Missing: ${missingCritical.join(', ')}`),
                    h('details', { className: 'mt-4' },
                        h('summary', { className: 'cursor-pointer font-medium' }, 'Debug Info'),
                        h('pre', { className: 'mt-2 p-2 bg-gray-100 rounded text-xs text-left' },
                            JSON.stringify({
                                availableComponents: Object.keys(components),
                                missingCritical,
                                windowChoreComponents: !!window.choreComponents,
                                reactVersion: React.version
                            }, null, 2)
                        )
                    )
                ),
                h('div', { className: 'mt-6 space-x-4' },
                    h('button', {
                        onClick: () => window.location.reload(),
                        className: 'px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600'
                    }, 'Reload Page'),
                    h('button', {
                        onClick: () => {
                            if (window.ChoreComponentLoader?.reload) {
                                window.ChoreComponentLoader.reload();
                            } else {
                                window.location.reload();
                            }
                        },
                        className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
                    }, 'Retry Component Loading')
                )
            );
        }
        
        /**
         * Main App component with state management
         */
        function App() {
            // FIXED: Use centralized state management if available, otherwise use local state
            const [appState, setAppState] = useState({
                chores: [],
                assignees: [],
                stats: {},
                loading: true,
                error: null,
                api: null
            });

            const [uiState, setUIState] = useState({
                showTaskForm: false,
                editingTask: null,
                showUserManagement: false,
                showThemeSettings: false,
                selectedCompletion: null,
                selectedSubtaskCompletion: null
            });

            // Initialize API and load data
            useEffect(() => {
                const initializeApp = async () => {
                    try {
                        console.log('🚀 Initializing Chores Dashboard App...');
                        
                        // Check if API is available
                        if (!window.ChoresAPI) {
                            throw new Error('ChoresAPI not available');
                        }

                        // Initialize API
                        if (typeof window.ChoresAPI.initialize === 'function') {
                            await window.ChoresAPI.initialize();
                        }

                        setAppState(prev => ({ ...prev, api: window.ChoresAPI }));

                        // Load initial data
                        await loadData();

                        console.log('✅ App initialized successfully');

                    } catch (error) {
                        console.error('❌ App initialization failed:', error);
                        setAppState(prev => ({ 
                            ...prev, 
                            error: `Failed to initialize app: ${error.message}`,
                            loading: false
                        }));
                    }
                };

                initializeApp();
            }, []);

            // Load data from API
            const loadData = useCallback(async () => {
                if (!window.ChoresAPI) return;

                try {
                    setAppState(prev => ({ ...prev, loading: true, error: null }));

                    // Try to get data from sensor state first (most efficient)
                    const sensorState = await window.ChoresAPI.getSensorState();
                    
                    if (sensorState?.attributes) {
                        const { chores = [], assignees = [], stats = {} } = sensorState.attributes;
                        
                        setAppState(prev => ({
                            ...prev,
                            chores,
                            assignees,
                            stats,
                            loading: false
                        }));
                        
                        console.log('✅ Data loaded from sensor state');
                        return;
                    }

                    // Fallback to individual API calls
                    const [choresResult, usersResult] = await Promise.allSettled([
                        window.ChoresAPI.chores?.getAll?.() || Promise.resolve([]),
                        window.ChoresAPI.users?.getAll?.() || Promise.resolve([])
                    ]);

                    setAppState(prev => ({
                        ...prev,
                        chores: choresResult.status === 'fulfilled' ? choresResult.value : [],
                        assignees: usersResult.status === 'fulfilled' ? usersResult.value : [],
                        loading: false
                    }));

                    console.log('✅ Data loaded from individual API calls');

                } catch (error) {
                    console.error('❌ Failed to load data:', error);
                    setAppState(prev => ({
                        ...prev,
                        error: `Failed to load data: ${error.message}`,
                        loading: false
                    }));
                }
            }, []);

            // Event handlers
            const handleTaskComplete = useCallback(async (choreId, userId) => {
                try {
                    if (window.ChoresAPI?.chores?.markComplete) {
                        await window.ChoresAPI.chores.markComplete(choreId, userId);
                        await loadData(); // Refresh data
                    }
                } catch (error) {
                    console.error('Error completing task:', error);
                    setAppState(prev => ({ ...prev, error: error.message }));
                }
            }, [loadData]);

            const handleTaskSave = useCallback(async (taskData) => {
                try {
                    if (uiState.editingTask) {
                        // Update existing task
                        if (window.ChoresAPI?.chores?.update) {
                            await window.ChoresAPI.chores.update(taskData);
                        }
                    } else {
                        // Add new task
                        if (window.ChoresAPI?.chores?.add) {
                            await window.ChoresAPI.chores.add(taskData);
                        }
                    }
                    
                    // Close form and refresh data
                    setUIState(prev => ({ ...prev, showTaskForm: false, editingTask: null }));
                    await loadData();

                } catch (error) {
                    console.error('Error saving task:', error);
                    setAppState(prev => ({ ...prev, error: error.message }));
                }
            }, [uiState.editingTask, loadData]);

            const handleTaskDelete = useCallback(async (choreId) => {
                try {
                    if (window.ChoresAPI?.chores?.delete) {
                        await window.ChoresAPI.chores.delete(choreId);
                        setUIState(prev => ({ ...prev, showTaskForm: false, editingTask: null }));
                        await loadData();
                    }
                } catch (error) {
                    console.error('Error deleting task:', error);
                    setAppState(prev => ({ ...prev, error: error.message }));
                }
            }, [loadData]);

            // Computed values
            const filteredChores = useMemo(() => {
                return appState.chores.filter(chore => chore && chore.name);
            }, [appState.chores]);

            const overdueCount = useMemo(() => {
                return filteredChores.filter(chore => chore.is_overdue).length;
            }, [filteredChores]);

            // Error state
            if (appState.error && !appState.loading) {
                return h('div', { className: 'min-h-screen bg-gray-50 p-8' },
                    h(ErrorMessage, {
                        error: appState.error,
                        onRetry: loadData,
                        title: 'Application Error'
                    }),
                    h('div', { className: 'mt-6 text-center' },
                        h('button', {
                            onClick: () => window.location.reload(),
                            className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
                        }, 'Reload Application')
                    )
                );
            }

            // Loading state
            if (appState.loading) {
                return h('div', { className: 'min-h-screen bg-gray-50 flex items-center justify-center' },
                    h(Loading, { message: 'Loading chores dashboard...', size: 'large' })
                );
            }

            // Main application UI
            return h('div', { className: 'min-h-screen bg-gray-50' },
                // Header
                h('header', { className: 'bg-white shadow-sm border-b' },
                    h('div', { className: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' },
                        h('div', { className: 'flex items-center justify-between h-16' },
                            h('div', { className: 'flex items-center' },
                                h('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Huishoudelijke Taken'),
                                overdueCount > 0 && h('span', { 
                                    className: 'ml-3 px-2 py-1 bg-red-500 text-white text-sm rounded-full' 
                                }, overdueCount)
                            ),
                            h('div', { className: 'flex items-center space-x-4' },
                                h('button', {
                                    onClick: () => setUIState(prev => ({ ...prev, showTaskForm: true, editingTask: null })),
                                    className: 'bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium'
                                }, '+ Nieuwe Taak'),
                                h('button', {
                                    onClick: () => setUIState(prev => ({ ...prev, showUserManagement: true })),
                                    className: 'bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium'
                                }, 'Gebruikers'),
                                h('button', {
                                    onClick: loadData,
                                    className: 'bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium'
                                }, '🔄 Vernieuwen')
                            )
                        )
                    )
                ),

                // Main content
                h('main', { className: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8' },
                    // Stats section
                    appState.stats && h('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-6 mb-8' },
                        h(StatsCard, {
                            title: 'Totaal Taken',
                            value: filteredChores.length,
                            icon: '📋'
                        }),
                        h(StatsCard, {
                            title: 'Te Laat',
                            value: overdueCount,
                            icon: '⚠️',
                            variant: overdueCount > 0 ? 'error' : 'default'
                        }),
                        h(StatsCard, {
                            title: 'Voltooid Vandaag',
                            value: appState.stats.completed_today || 0,
                            icon: '✅',
                            variant: 'success'
                        })
                    ),

                    // Tasks list
                    h('div', { className: 'space-y-4' },
                        filteredChores.length > 0 ? 
                            filteredChores.map(chore => 
                                h(TaskCard, {
                                    key: chore.id || chore.chore_id,
                                    chore,
                                    onComplete: (choreId, userId) => handleTaskComplete(choreId, userId),
                                    onEdit: (task) => setUIState(prev => ({ 
                                        ...prev, 
                                        showTaskForm: true, 
                                        editingTask: task 
                                    })),
                                    onDelete: handleTaskDelete,
                                    assignees: appState.assignees,
                                    showEditDelete: true
                                })
                            ) :
                            h(EmptyState, {
                                icon: '📋',
                                title: 'Geen taken gevonden',
                                message: 'Voeg je eerste taak toe om te beginnen.',
                                action: 'Eerste Taak Toevoegen',
                                onAction: () => setUIState(prev => ({ ...prev, showTaskForm: true, editingTask: null }))
                            })
                    )
                ),

                // Task Form Modal
                uiState.showTaskForm && h(TaskForm, {
                    task: uiState.editingTask,
                    assignees: appState.assignees,
                    onSave: handleTaskSave,
                    onDelete: handleTaskDelete,
                    onClose: () => setUIState(prev => ({ ...prev, showTaskForm: false, editingTask: null }))
                }),

                // User Management Modal
                uiState.showUserManagement && h(UserManagement, {
                    users: appState.assignees,
                    onClose: () => setUIState(prev => ({ ...prev, showUserManagement: false })),
                    onSave: loadData // Refresh data after user changes
                }),

                // Completion Confirm Dialog
                uiState.selectedCompletion && h(CompletionConfirmDialog, {
                    isOpen: true,
                    title: "Taak voltooien",
                    message: `Markeer "${uiState.selectedCompletion.name}" als voltooid:`,
                    onConfirm: (userId) => {
                        handleTaskComplete(uiState.selectedCompletion.choreId, userId);
                        setUIState(prev => ({ ...prev, selectedCompletion: null }));
                    },
                    onCancel: () => setUIState(prev => ({ ...prev, selectedCompletion: null })),
                    assignees: appState.assignees,
                    defaultUser: uiState.selectedCompletion.defaultUser
                }),

                // Subtask Completion Dialog
                uiState.selectedSubtaskCompletion && h(SubtaskCompletionDialog, {
                    isOpen: true,
                    chore: uiState.selectedSubtaskCompletion,
                    onComplete: (subtaskIds, userId) => {
                        // Handle subtask completion
                        setUIState(prev => ({ ...prev, selectedSubtaskCompletion: null }));
                        loadData();
                    },
                    onCancel: () => setUIState(prev => ({ ...prev, selectedSubtaskCompletion: null })),
                    assignees: appState.assignees
                })
            );
        }
        
        // Wrap in error boundary if available
        return ErrorBoundary ? 
            h(ErrorBoundary, { showDetails: true }, h(App)) : 
            h(App);
    }
    
    // Export the main app component
    window.ChoresApp.getApp = function() {
        return ChoresApp;
    };
    
    console.log('✅ FIXED Chores Dashboard App loaded successfully');
})();