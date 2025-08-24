/**
 * Dialog components for the Chores Manager
 * Includes confirmation dialogs, completion dialogs, and subtask dialogs
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Dialog components require React');
        return;
    }

    const h = React.createElement;

    /**
     * Basic confirmation dialog component
     */
    const ConfirmDialog = function({ isOpen, title, message, onConfirm, onCancel }) {
        if (!isOpen) return null;

        return h('div', { className: "modal-container" },
            h('div', { className: "modal-content max-w-md" },
                h('h3', { className: "text-lg font-medium mb-2" }, title),
                h('p', { className: "text-gray-600 mb-4" }, message),
                h('div', { className: "flex justify-end space-x-2" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                        onClick: onCancel
                    }, "Annuleren"),
                    h('button', {
                        className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600",
                        onClick: onConfirm
                    }, "Bevestigen")
                )
            )
        );
    };

    /**
     * Completion confirmation dialog with user selection
     */
    const CompletionConfirmDialog = function({ 
        isOpen, 
        title, 
        message, 
        onConfirm, 
        onCancel, 
        assignees = [], 
        defaultUser 
    }) {
        const [selectedUser, setSelectedUser] = React.useState(defaultUser);

        // Update selected user when default changes
        React.useEffect(() => {
            setSelectedUser(defaultUser);
        }, [defaultUser]);

        if (!isOpen) return null;

        const handleConfirm = () => {
            onConfirm(selectedUser);
        };

        return h('div', { className: "modal-container" },
            h('div', { className: "modal-content max-w-md" },
                h('h3', { className: "text-lg font-medium mb-2" }, title),
                h('p', { className: "text-gray-600 mb-4" }, message),
                
                // User selection
                h('div', { className: "mb-4" },
                    h('label', { className: "block text-sm font-medium mb-2" }, "Wie heeft de taak voltooid?"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: selectedUser,
                        onChange: (e) => setSelectedUser(e.target.value)
                    },
                        assignees.map(assignee =>
                            h('option', { key: assignee, value: assignee }, assignee)
                        )
                    )
                ),
                
                // Action buttons
                h('div', { className: "flex justify-end space-x-2" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                        onClick: onCancel
                    }, "Annuleren"),
                    h('button', {
                        className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                        onClick: handleConfirm
                    }, "Voltooien")
                )
            )
        );
    };

    /**
     * Subtask completion dialog
     */
    const SubtaskCompletionDialog = function({ 
        isOpen, 
        chore, 
        onComplete, 
        onCancel, 
        assignees = [], 
        defaultUser 
    }) {
        const [selectedUser, setSelectedUser] = React.useState(defaultUser);
        const [selectedSubtasks, setSelectedSubtasks] = React.useState([]);

        // Reset state when dialog opens
        React.useEffect(() => {
            if (isOpen) {
                setSelectedUser(defaultUser);
                setSelectedSubtasks([]);
            }
        }, [isOpen, defaultUser]);

        if (!isOpen || !chore.subtasks) return null;

        const incompleteSubtasks = chore.subtasks
            .map((st, idx) => ({ ...st, index: idx }))
            .filter(st => !st.completed);

        const handleToggleSubtask = (index) => {
            setSelectedSubtasks(prev => {
                if (prev.includes(index)) {
                    return prev.filter(i => i !== index);
                } else {
                    return [...prev, index];
                }
            });
        };

        const handleConfirm = () => {
            if (selectedSubtasks.length > 0) {
                // Complete each selected subtask
                selectedSubtasks.forEach(index => {
                    onComplete(index, selectedUser);
                });
            }
        };

        return h('div', { className: "modal-container" },
            h('div', { className: "modal-content max-w-md" },
                h('h3', { className: "text-lg font-medium mb-4" }, "Subtaken voltooien"),
                
                // User selection
                h('div', { className: "mb-4" },
                    h('label', { className: "block text-sm font-medium mb-2" }, "Wie heeft de subtaken voltooid?"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: selectedUser,
                        onChange: (e) => setSelectedUser(e.target.value)
                    },
                        assignees.map(assignee =>
                            h('option', { key: assignee, value: assignee }, assignee)
                        )
                    )
                ),

                // Subtask selection
                h('div', { className: "mb-4" },
                    h('p', { className: "text-sm font-medium mb-2" }, "Selecteer voltooide subtaken:"),
                    h('div', { className: "space-y-2 max-h-60 overflow-y-auto" },
                        incompleteSubtasks.map(subtask =>
                            h('label', {
                                key: subtask.index,
                                className: "flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                            },
                                h('input', {
                                    type: "checkbox",
                                    checked: selectedSubtasks.includes(subtask.index),
                                    onChange: () => handleToggleSubtask(subtask.index),
                                    className: "mr-3"
                                }),
                                h('span', { className: "flex-1" }, subtask.name)
                            )
                        )
                    )
                ),

                // Action buttons
                h('div', { className: "flex justify-end space-x-2" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                        onClick: onCancel
                    }, "Annuleren"),
                    h('button', {
                        className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                        onClick: handleConfirm,
                        disabled: selectedSubtasks.length === 0
                    }, `Voltooien (${selectedSubtasks.length})`)
                )
            )
        );
    };

    /**
     * Error dialog component
     */
    const ErrorDialog = function({ isOpen, title, message, onClose }) {
        if (!isOpen) return null;

        return h('div', { className: "modal-container" },
            h('div', { className: "modal-content max-w-md" },
                h('div', { className: "flex items-center mb-3" },
                    h('span', { className: "text-red-500 text-2xl mr-2" }, "⚠️"),
                    h('h3', { className: "text-lg font-medium" }, title || "Error")
                ),
                h('p', { className: "text-gray-600 mb-4" }, message),
                h('div', { className: "flex justify-end" },
                    h('button', {
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                        onClick: onClose
                    }, "OK")
                )
            )
        );
    };

    /**
     * Success dialog component
     */
    const SuccessDialog = function({ isOpen, title, message, onClose, autoClose = 3000 }) {
        React.useEffect(() => {
            if (isOpen && autoClose) {
                const timer = setTimeout(onClose, autoClose);
                return () => clearTimeout(timer);
            }
        }, [isOpen, autoClose, onClose]);

        if (!isOpen) return null;

        return h('div', { className: "modal-container" },
            h('div', { className: "modal-content max-w-md" },
                h('div', { className: "flex items-center mb-3" },
                    h('span', { className: "text-green-500 text-2xl mr-2" }, "✓"),
                    h('h3', { className: "text-lg font-medium" }, title || "Success")
                ),
                h('p', { className: "text-gray-600 mb-4" }, message),
                h('div', { className: "flex justify-end" },
                    h('button', {
                        className: "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600",
                        onClick: onClose
                    }, "OK")
                )
            )
        );
    };

    // Export components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        ConfirmDialog,
        CompletionConfirmDialog,
        SubtaskCompletionDialog,
        ErrorDialog,
        SuccessDialog
    });

    console.log('Dialog components loaded successfully');
})();