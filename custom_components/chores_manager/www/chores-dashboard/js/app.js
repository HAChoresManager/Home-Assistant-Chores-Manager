/**
 * Main App Component for Chores Dashboard
 * This is the root component that manages the entire application
 * Refactored to use modular architecture with separate state and handler files
 */

window.ChoresApp = window.ChoresApp || {};

(function() {
    'use strict';
    
    const h = React.createElement;
    
    /**
     * ChoresApp - Main application component
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
        
        // Main app component
        function App() {
            // Use centralized state management
            const state = window.ChoresApp.useAppState();
            const { core, ui, dialogs, status, helpers } = state;
            
            // Use event handlers
            const handlers = window.ChoresApp.useEventHandlers(state);
            
            // Use computed values
            const computed = window.ChoresApp.useComputedValues(core.chores, core.assignees);
            
            // Inner Error Boundary for app content
            class AppErrorBoundary extends React.Component {
                constructor(props) {
                    super(props);
                    this.state = { hasError: false, error: null };
                }
                
                static getDerivedStateFromError(error) {
                    return { hasError: true, error };
                }
                
                componentDidCatch(error, errorInfo) {
                    console.error('App Error Boundary caught:', error, errorInfo);
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
            
            // Render the app
            return h(AppErrorBoundary, null,
                h('div', { 
                    className: "min-h-screen bg-gray-100 font-sans",
                    style: { 
                        backgroundColor: status.themeSettings.backgroundColor || '#f3f4f6',
                        color: status.themeSettings.primaryTextColor || '#111827'
                    }
                },
                    // Header
                    h('header', { className: "bg-white shadow-sm border-b" },
                        h('div', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" },
                            h('div', { className: "flex justify-between items-center py-4" },
                                h('div', { className: "flex items-center space-x-4" },
                                    h('h1', { className: "text-2xl font-bold text-gray-900" }, "🏠 Klusjes Dashboard"),
                                    status.hasAuthError && h('span', { className: "text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded" }, 
                                        "Auth issue - check config")
                                ),
                                h('div', { className: "flex space-x-2" },
                                    h('button', {
                                        className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                                        onClick: () => ui.setShowTaskForm(true)
                                    }, "Nieuwe Taak"),
                                    h('button', {
                                        className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                                        onClick: () => ui.setShowUserManagement(true)
                                    }, "Gebruikers"),
                                    h('button', {
                                        className: "px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600",
                                        onClick: () => ui.setShowThemeSettings(true)
                                    }, "Thema"),
                                    h('button', {
                                        className: "px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600",
                                        onClick: handlers.loadData
                                    }, "↻")
                                )
                            )
                        )
                    ),
                    
                    // Main content
                    h('main', { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" },
                        // Loading state
                        core.loading && h(Loading, { message: "Taken laden..." }),
                        
                        // Error state
                        core.error && h(ErrorMessage, { 
                            message: core.error, 
                            onRetry: handlers.loadData,
                            onDismiss: helpers.clearError
                        }),
                        
                        // Success message for completed tasks
                        status.lastCompletion && h(Alert, {
                            type: "success",
                            message: `Taak voltooid door ${status.lastCompletion.person}!`,
                            onDismiss: helpers.clearLastCompletion
                        }),
                        
                        // Statistics
                        !core.loading && !core.error && h('div', { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" },
                            h(StatsCard, {
                                title: "Vandaag te doen",
                                value: computed.pendingTasks.filter(c => c.is_due || c.status === 'due').length,
                                icon: "📅",
                                color: "blue"
                            }),
                            h(StatsCard, {
                                title: "Voltooid vandaag",
                                value: computed.completedTasks.length,
                                icon: "✅",
                                color: "green"
                            }),
                            h(StatsCard, {
                                title: "Totaal taken",
                                value: core.chores.length,
                                icon: "📊",
                                color: "purple"
                            })
                        ),
                        
                        // Task sections
                        !core.loading && !core.error && h('div', { className: "space-y-8" },
                            // Overdue tasks
                            computed.overdueTasks.length > 0 && h('div', null,
                                h('h2', { className: "text-xl font-semibold mb-4 text-red-600" }, 
                                    `⚠️ Achterstallig (${computed.overdueTasks.length})`),
                                h('div', { className: "grid gap-4 mb-8" },
                                    computed.overdueTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handlers.handleMarkDone,
                                            onEdit: handlers.handleEditTask,
                                            onToggleDescription: handlers.handleToggleDescription,
                                            isExpanded: ui.expandedDescriptions[chore.id || chore.chore_id],
                                            assignees: core.assignees,
                                            onMarkSubtaskDone: handlers.handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Today's tasks
                            h('div', null,
                                h('h2', { className: "text-xl font-semibold mb-4" }, 
                                    `📋 Vandaag (${computed.todayTasks.length})`),
                                h('div', { className: "grid gap-4 mb-8" },
                                    computed.todayTasks.length > 0 ? computed.todayTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handlers.handleMarkDone,
                                            onEdit: handlers.handleEditTask,
                                            onToggleDescription: handlers.handleToggleDescription,
                                            isExpanded: ui.expandedDescriptions[chore.id || chore.chore_id],
                                            assignees: core.assignees,
                                            onMarkSubtaskDone: handlers.handleMarkSubtaskDone
                                        })
                                    ) : h('p', { className: "text-gray-500 text-center py-4" }, 
                                        "Geen taken voor vandaag! 🎉")
                                )
                            ),
                            
                            // Upcoming tasks
                            computed.upcomingTasks.length > 0 && h('div', null,
                                h('h2', { className: "text-xl font-semibold mb-4" }, 
                                    `📅 Komende taken (${computed.upcomingTasks.length})`),
                                h('div', { className: "grid gap-4 mb-8" },
                                    computed.upcomingTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handlers.handleMarkDone,
                                            onEdit: handlers.handleEditTask,
                                            onToggleDescription: handlers.handleToggleDescription,
                                            isExpanded: ui.expandedDescriptions[chore.id || chore.chore_id],
                                            assignees: core.assignees,
                                            onMarkSubtaskDone: handlers.handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Completed tasks
                            computed.completedTasks.length > 0 && h('div', null,
                                h('h2', { className: "text-xl font-semibold mb-4 text-green-600" }, 
                                    `✅ Voltooid vandaag (${computed.completedTasks.length})`),
                                h('div', { className: "grid gap-4" },
                                    computed.completedTasks.map(chore =>
                                        h(TaskCard, {
                                            key: chore.id || chore.chore_id,
                                            chore: chore,
                                            onMarkDone: handlers.handleMarkDone,
                                            onEdit: handlers.handleEditTask,
                                            onToggleDescription: handlers.handleToggleDescription,
                                            isExpanded: ui.expandedDescriptions[chore.id || chore.chore_id],
                                            assignees: core.assignees,
                                            onMarkSubtaskDone: handlers.handleMarkSubtaskDone
                                        })
                                    )
                                )
                            ),
                            
                            // Empty state
                            core.chores.length === 0 && !core.loading && h('div', { 
                                className: "text-center py-12 bg-white rounded-lg shadow-sm"
                            },
                                h('p', { className: "text-gray-500 text-lg" }, 
                                    "Geen taken gevonden. Klik op 'Nieuwe Taak' om te beginnen."
                                )
                            )
                        )
                    ),
                    
                    // Modals
                    ui.showTaskForm && h(Modal, {
                        isOpen: ui.showTaskForm,
                        onClose: () => {
                            ui.setShowTaskForm(false);
                            ui.setEditingTask(null);
                        },
                        title: ui.editingTask ? 'Taak Bewerken' : 'Nieuwe Taak'
                    },
                        h(TaskForm, {
                            task: ui.editingTask,
                            onSave: handlers.handleTaskFormSubmit,
                            onDelete: handlers.handleDeleteTask,
                            onClose: () => {
                                ui.setShowTaskForm(false);
                                ui.setEditingTask(null);
                            },
                            onResetCompletion: handlers.handleResetCompletion,
                            users: core.assignees,
                            assignees: core.assignees
                        })
                    ),
                    
                    ui.showUserManagement && h(Modal, {
                        isOpen: true,
                        onClose: () => ui.setShowUserManagement(false),
                        title: 'Gebruikers Beheren'
                    },
                        h(UserManagement, {
                            users: core.assignees,
                            onSave: handlers.handleSaveUsers,
                            onClose: () => ui.setShowUserManagement(false)
                        })
                    ),
                    
                    ui.showThemeSettings && h(Modal, {
                        isOpen: true,
                        onClose: () => ui.setShowThemeSettings(false),
                        title: 'Thema Instellingen'
                    },
                        h(ThemeSettings, {
                            currentTheme: status.themeSettings,
                            onSave: handlers.handleSaveTheme,
                            onClose: () => ui.setShowThemeSettings(false)
                        })
                    ),
                    
                    ui.selectedDescription && h(Modal, {
                        isOpen: true,
                        onClose: () => ui.setSelectedDescription(null),
                        title: `Beschrijving: ${ui.selectedDescription.name}`
                    },
                        h(TaskDescription, {
                            description: ui.selectedDescription.description,
                            onClose: () => ui.setSelectedDescription(null)
                        })
                    ),
                    
                    // Completion confirmation dialog
                    dialogs.selectedCompletion && h(CompletionConfirmDialog, {
                        isOpen: true,
                        title: "Taak voltooien",
                        message: "Wie heeft deze taak voltooid?",
                        onConfirm: handlers.handleCompletionConfirm,
                        onCancel: helpers.cancelCompletionDialog,
                        assignees: computed.availableAssignees,
                        defaultUser: dialogs.selectedCompletion.defaultUser
                    }),
                    
                    // Subtask completion dialog
                    dialogs.selectedSubtaskCompletion && h(SubtaskCompletionDialog, {
                        isOpen: true,
                        chore: dialogs.selectedSubtaskCompletion.chore,
                        onComplete: handlers.handleSubtaskCompletionConfirm,
                        onCancel: helpers.cancelSubtaskDialog,
                        assignees: computed.availableAssignees,
                        defaultUser: dialogs.selectedSubtaskCompletion.defaultUser
                    }),
                    
                    // Confirm dialog
                    dialogs.showConfirmDialog && dialogs.confirmDialogData && h(ConfirmDialog, {
                        isOpen: dialogs.showConfirmDialog,
                        title: dialogs.confirmDialogData.title,
                        message: dialogs.confirmDialogData.message,
                        onConfirm: () => {
                            dialogs.confirmDialogData.onConfirm();
                            dialogs.setShowConfirmDialog(false);
                            dialogs.setConfirmDialogData(null);
                        },
                        onCancel: () => {
                            dialogs.setShowConfirmDialog(false);
                            dialogs.setConfirmDialogData(null);
                        }
                    })
                )
            );
        }
        
        return h(App);
    }
    
    // Export for global access
    window.ChoresApp.ChoresApp = ChoresApp;
    
    console.log('Chores Dashboard App loaded successfully');
})();