/**
 * COMPLETELY FIXED Dialog Components for the Chores Manager
 * Includes confirmation dialogs, completion dialogs, and subtask dialogs
 * Enhanced with proper dependency checking and error handling
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Dialog components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useCallback, useEffect } = React;

    /**
     * Basic confirmation dialog component
     */
    const ConfirmDialog = ({ 
        isOpen, 
        title = 'Confirm', 
        message, 
        onConfirm, 
        onCancel,
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        variant = 'danger'
    }) => {
        if (!isOpen) return null;

        const variants = {
            danger: 'bg-red-500 hover:bg-red-600',
            success: 'bg-green-500 hover:bg-green-600',
            warning: 'bg-yellow-500 hover:bg-yellow-600',
            primary: 'bg-blue-500 hover:bg-blue-600'
        };

        // Check if Modal is available
        if (!window.choreComponents?.Modal) {
            return h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-6 rounded-lg max-w-md mx-4" },
                    h('h3', { className: "text-lg font-medium mb-2" }, title),
                    h('p', { className: "text-gray-600 mb-4" }, message),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                            onClick: onCancel
                        }, cancelText),
                        h('button', {
                            className: `px-4 py-2 text-white rounded transition-colors ${variants[variant]}`,
                            onClick: onConfirm
                        }, confirmText)
                    )
                )
            );
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            size: 'small'
        },
            h('div', { className: "space-y-4" },
                h('h3', { className: "text-lg font-medium" }, title),
                h('p', { className: "text-gray-600" }, message),
                h('div', { className: "flex justify-end space-x-2 pt-4" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                        onClick: onCancel
                    }, cancelText),
                    h('button', {
                        className: `px-4 py-2 text-white rounded transition-colors ${variants[variant]}`,
                        onClick: onConfirm
                    }, confirmText)
                )
            )
        );
    };

    /**
     * FIXED Completion confirmation dialog with user selection
     */
    const CompletionConfirmDialog = ({ 
        isOpen, 
        title = 'Complete Task', 
        message, 
        onConfirm, 
        onCancel, 
        assignees = [], 
        defaultUser = 'Wie kan'
    }) => {
        const [selectedUser, setSelectedUser] = useState(defaultUser);
        const [loading, setLoading] = useState(false);

        // Update selected user when default changes
        useEffect(() => {
            setSelectedUser(defaultUser);
        }, [defaultUser]);

        const handleConfirm = useCallback(async () => {
            if (!onConfirm) return;
            
            setLoading(true);
            try {
                await onConfirm(selectedUser);
            } catch (error) {
                console.error('Error in completion confirm:', error);
            } finally {
                setLoading(false);
            }
        }, [onConfirm, selectedUser]);

        if (!isOpen) return null;

        // Fallback modal if Modal component not available
        if (!window.choreComponents?.Modal) {
            return h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-6 rounded-lg max-w-md mx-4" },
                    h('h3', { className: "text-lg font-medium mb-2" }, title),
                    h('p', { className: "text-gray-600 mb-4" }, message),
                    
                    // User selection
                    assignees.length > 0 && h('div', { className: "mb-4" },
                        h('label', { className: "block text-sm font-medium mb-2" }, "Who completed this task?"),
                        h('select', {
                            value: selectedUser,
                            onChange: (e) => setSelectedUser(e.target.value),
                            className: "w-full p-2 border border-gray-300 rounded-md",
                            disabled: loading
                        },
                            h('option', { value: 'Wie kan' }, 'Wie kan'),
                            assignees.map(assignee => 
                                h('option', { 
                                    key: assignee.name || assignee, 
                                    value: assignee.name || assignee 
                                }, assignee.name || assignee)
                            )
                        )
                    ),
                    
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                            onClick: onCancel,
                            disabled: loading
                        }, "Cancel"),
                        h('button', {
                            className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: handleConfirm,
                            disabled: loading
                        }, loading ? 'Completing...' : 'Complete')
                    )
                )
            );
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            title: title,
            size: 'small'
        },
            h('div', { className: "space-y-4" },
                h('p', { className: "text-gray-600" }, message),
                
                // User selection
                assignees.length > 0 && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-2" }, "Who completed this task?"),
                    h('select', {
                        value: selectedUser,
                        onChange: (e) => setSelectedUser(e.target.value),
                        className: "w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        disabled: loading
                    },
                        h('option', { value: 'Wie kan' }, 'Wie kan'),
                        assignees.map(assignee => 
                            h('option', { 
                                key: assignee.name || assignee, 
                                value: assignee.name || assignee 
                            }, assignee.name || assignee)
                        )
                    )
                ),
                
                h('div', { className: "flex justify-end space-x-2 pt-4" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                        onClick: onCancel,
                        disabled: loading
                    }, "Cancel"),
                    h('button', {
                        className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                        onClick: handleConfirm,
                        disabled: loading
                    }, loading ? 'Completing...' : 'Complete')
                )
            )
        );
    };

    /**
     * FIXED Subtask completion dialog with enhanced functionality
     */
    const SubtaskCompletionDialog = ({ 
        isOpen, 
        chore = null,
        subtasks = [],
        users = [], 
        assignees = [],
        defaultUser = 'Wie kan', 
        onComplete, 
        onCancel 
    }) => {
        // Use chore.subtasks if available, fallback to subtasks prop
        const taskSubtasks = chore?.subtasks || subtasks || [];
        const availableUsers = users || assignees || [];
        
        const [selectedSubtasks, setSelectedSubtasks] = useState([]);
        const [selectedUser, setSelectedUser] = useState(defaultUser);
        const [loading, setLoading] = useState(false);

        // Reset state when dialog opens
        useEffect(() => {
            if (isOpen) {
                setSelectedSubtasks([]);
                setSelectedUser(defaultUser);
            }
        }, [isOpen, defaultUser]);

        const toggleSubtask = useCallback((subtaskId) => {
            setSelectedSubtasks(prev => 
                prev.includes(subtaskId) 
                    ? prev.filter(id => id !== subtaskId)
                    : [...prev, subtaskId]
            );
        }, []);

        const handleConfirm = useCallback(async () => {
            if (!onComplete || selectedSubtasks.length === 0) return;
            
            setLoading(true);
            try {
                await onComplete(selectedSubtasks, selectedUser);
            } catch (error) {
                console.error('Error completing subtasks:', error);
            } finally {
                setLoading(false);
            }
        }, [onComplete, selectedSubtasks, selectedUser]);

        if (!isOpen) return null;

        // Fallback modal if Modal component not available
        if (!window.choreComponents?.Modal) {
            return h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-6 rounded-lg max-w-md mx-4 max-h-[80vh] overflow-y-auto" },
                    h('h3', { className: "text-lg font-medium mb-4" }, "Complete Subtasks"),
                    
                    // Subtasks list
                    taskSubtasks.length > 0 ? h('div', { className: "space-y-2 mb-4" },
                        h('p', { className: "text-sm text-gray-600 mb-2" }, "Select subtasks to complete:"),
                        taskSubtasks.map((subtask, index) => {
                            const subtaskId = subtask.id || index;
                            const subtaskName = subtask.name || subtask;
                            const isCompleted = subtask.completed || false;
                            
                            return h('label', { 
                                key: subtaskId, 
                                className: `flex items-center p-2 border rounded hover:bg-gray-50 ${isCompleted ? 'bg-green-50 border-green-200' : ''}`
                            },
                                h('input', {
                                    type: 'checkbox',
                                    checked: selectedSubtasks.includes(subtaskId),
                                    onChange: () => toggleSubtask(subtaskId),
                                    className: 'mr-3',
                                    disabled: isCompleted || loading
                                }),
                                h('span', { 
                                    className: `flex-1 ${isCompleted ? 'text-green-600 line-through' : ''}` 
                                }, subtaskName),
                                isCompleted && h('span', { className: 'text-green-500 text-sm' }, '✓')
                            );
                        })
                    ) : h('p', { className: "text-gray-500 italic mb-4" }, "No subtasks available"),
                    
                    // User selection
                    availableUsers.length > 0 && h('div', { className: "mb-4" },
                        h('label', { className: "block text-sm font-medium mb-2" }, "Completed by:"),
                        h('select', {
                            value: selectedUser,
                            onChange: (e) => setSelectedUser(e.target.value),
                            className: "w-full p-2 border border-gray-300 rounded-md",
                            disabled: loading
                        },
                            h('option', { value: 'Wie kan' }, 'Wie kan'),
                            availableUsers.map(user => 
                                h('option', { 
                                    key: user.name || user, 
                                    value: user.name || user 
                                }, user.name || user)
                            )
                        )
                    ),
                    
                    // Action buttons
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                            onClick: onCancel,
                            disabled: loading
                        }, "Cancel"),
                        h('button', {
                            className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors ${(loading || selectedSubtasks.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: handleConfirm,
                            disabled: loading || selectedSubtasks.length === 0
                        }, loading ? 'Completing...' : `Complete (${selectedSubtasks.length})`)
                    )
                )
            );
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            title: "Complete Subtasks",
            size: 'medium'
        },
            h('div', { className: "space-y-4" },
                // Subtasks list
                taskSubtasks.length > 0 ? h('div', { className: "space-y-2" },
                    h('p', { className: "text-sm text-gray-600 mb-3" }, "Select subtasks to complete:"),
                    h('div', { className: "max-h-60 overflow-y-auto space-y-2" },
                        taskSubtasks.map((subtask, index) => {
                            const subtaskId = subtask.id || index;
                            const subtaskName = subtask.name || subtask;
                            const isCompleted = subtask.completed || false;
                            
                            return h('label', { 
                                key: subtaskId, 
                                className: `flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer transition-colors ${
                                    isCompleted ? 'bg-green-50 border-green-200' : 
                                    selectedSubtasks.includes(subtaskId) ? 'bg-blue-50 border-blue-200' : ''
                                }`
                            },
                                h('input', {
                                    type: 'checkbox',
                                    checked: selectedSubtasks.includes(subtaskId),
                                    onChange: () => toggleSubtask(subtaskId),
                                    className: 'mr-3 h-4 w-4 text-blue-600',
                                    disabled: isCompleted || loading
                                }),
                                h('span', { 
                                    className: `flex-1 ${isCompleted ? 'text-green-600 line-through' : ''}` 
                                }, subtaskName),
                                isCompleted && h('span', { className: 'text-green-500 ml-2' }, '✓')
                            );
                        })
                    )
                ) : h('div', { className: "text-center py-8" },
                    h('p', { className: "text-gray-500 italic" }, "No subtasks available for this task.")
                ),
                
                // User selection
                availableUsers.length > 0 && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-2" }, "Completed by:"),
                    h('select', {
                        value: selectedUser,
                        onChange: (e) => setSelectedUser(e.target.value),
                        className: "w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        disabled: loading
                    },
                        h('option', { value: 'Wie kan' }, 'Wie kan'),
                        availableUsers.map(user => 
                            h('option', { 
                                key: user.name || user, 
                                value: user.name || user 
                            }, user.name || user)
                        )
                    )
                ),
                
                // Action buttons
                h('div', { className: "flex justify-end space-x-2 pt-4 border-t" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                        onClick: onCancel,
                        disabled: loading
                    }, "Cancel"),
                    h('button', {
                        className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors ${(loading || selectedSubtasks.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`,
                        onClick: handleConfirm,
                        disabled: loading || selectedSubtasks.length === 0
                    }, loading ? 'Completing...' : `Complete Selected (${selectedSubtasks.length})`)
                )
            )
        );
    };

    /**
     * Error dialog component
     */
    const ErrorDialog = ({ isOpen, title = 'Error', message, onClose, error }) => {
        if (!isOpen) return null;

        let errorMessage = message;
        if (!errorMessage && error) {
            errorMessage = typeof error === 'string' ? error : error.message || 'An unknown error occurred';
        }

        const modalContent = h('div', { className: "space-y-4" },
            h('div', { className: "flex items-center mb-3" },
                h('span', { className: "text-red-500 text-2xl mr-3" }, "⚠️"),
                h('h3', { className: "text-lg font-medium text-red-800" }, title)
            ),
            h('p', { className: "text-gray-700" }, errorMessage),
            error?.stack && h('details', { className: "mt-3" },
                h('summary', { className: "cursor-pointer text-sm text-gray-600" }, "Technical details"),
                h('pre', { className: "mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto" }, 
                    error.stack.slice(0, 500)
                )
            ),
            h('div', { className: "flex justify-end pt-4" },
                h('button', {
                    className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors",
                    onClick: onClose
                }, "Close")
            )
        );

        if (!window.choreComponents?.Modal) {
            return h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-6 rounded-lg max-w-md mx-4" }, modalContent)
            );
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onClose,
            size: 'medium'
        }, modalContent);
    };

    /**
     * Success dialog component
     */
    const SuccessDialog = ({ isOpen, title = 'Success', message, onClose }) => {
        if (!isOpen) return null;

        const modalContent = h('div', { className: "space-y-4 text-center" },
            h('div', { className: "flex justify-center mb-4" },
                h('span', { className: "text-green-500 text-4xl" }, "✅")
            ),
            h('h3', { className: "text-lg font-medium text-green-800" }, title),
            h('p', { className: "text-gray-700" }, message),
            h('div', { className: "flex justify-center pt-4" },
                h('button', {
                    className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors",
                    onClick: onClose
                }, "OK")
            )
        );

        if (!window.choreComponents?.Modal) {
            return h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-6 rounded-lg max-w-md mx-4" }, modalContent)
            );
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onClose,
            size: 'small'
        }, modalContent);
    };

    // Export all dialog components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        ConfirmDialog,
        CompletionConfirmDialog,
        SubtaskCompletionDialog,
        ErrorDialog,
        SuccessDialog
    });

    console.log('✅ FIXED Dialog components loaded successfully with comprehensive functionality');
})();