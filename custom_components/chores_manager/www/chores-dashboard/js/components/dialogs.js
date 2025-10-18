/**
 * PROPERLY FIXED Dialog Components
 * Fallback modals now use non-nested structure like the main Modal component
 */

(function() {
    'use strict';

    if (!window.React) {
        console.error('Dialog components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useCallback, useEffect } = React;

    /**
     * Fallback modal renderer - non-nested structure
     */
    const renderFallbackModal = (content, maxWidth = 'max-w-md') => {
        return h('div', {
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999
            }
        },
            // Background
            h('div', {
                style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)'
                }
            }),
            // Content
            h('div', {
                style: {
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    maxHeight: '90vh',
                    maxWidth: '90vw',
                    overflowY: 'auto'
                },
                className: `bg-white p-6 rounded-lg ${maxWidth} w-full mx-4`
            }, content)
        );
    };

    /**
     * Confirmation dialog
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

        const content = h('div', null,
            h('h3', { className: 'text-lg font-medium mb-2' }, title),
            h('p', { className: 'text-gray-600 mb-4' }, message),
            h('div', { className: 'flex justify-end space-x-2' },
                h('button', {
                    className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                    onClick: onCancel
                }, cancelText),
                h('button', {
                    className: `px-4 py-2 text-white rounded ${variants[variant]}`,
                    onClick: onConfirm
                }, confirmText)
            )
        );

        if (!window.choreComponents?.Modal) {
            return renderFallbackModal(content);
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            title: title,
            size: 'small'
        }, content);
    };

    /**
     * Completion confirmation dialog
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

        useEffect(() => {
            setSelectedUser(defaultUser);
        }, [defaultUser]);

        const handleConfirm = useCallback(async () => {
            if (!onConfirm) return;
            setLoading(true);
            try {
                await onConfirm(selectedUser);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        }, [onConfirm, selectedUser]);

        if (!isOpen) return null;

        const content = h('div', null,
            h('p', { className: 'text-gray-600 mb-4' }, message),
            assignees.length > 0 && h('div', { className: 'mb-6' },
                h('label', { className: 'block text-sm font-medium mb-2' }, 'Who completed this task?'),
                h('select', {
                    value: selectedUser,
                    onChange: (e) => setSelectedUser(e.target.value),
                    className: 'w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500',
                    disabled: loading
                },
                    h('option', { value: 'Wie kan' }, 'Wie kan'),
                    assignees.map(user => 
                        h('option', { 
                            key: user.name || user, 
                            value: user.name || user 
                        }, user.name || user)
                    )
                )
            ),
            h('div', { className: 'flex justify-end space-x-2 pt-4 border-t' },
                h('button', {
                    className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                    onClick: onCancel,
                    disabled: loading
                }, 'Cancel'),
                h('button', {
                    className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                    onClick: handleConfirm,
                    disabled: loading
                }, loading ? 'Completing...' : 'Complete')
            )
        );

        if (!window.choreComponents?.Modal) {
            return renderFallbackModal(content);
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            title: title,
            size: 'small'
        }, content);
    };

    /**
     * Subtask completion dialog
     */
    const SubtaskCompletionDialog = ({ 
        isOpen, 
        title = 'Complete Subtasks', 
        subtasks = [], 
        onConfirm, 
        onCancel,
        availableUsers = [],
        defaultUser = 'Wie kan'
    }) => {
        const [selectedSubtasks, setSelectedSubtasks] = useState(new Set());
        const [selectedUser, setSelectedUser] = useState(defaultUser);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (isOpen) {
                const incomplete = new Set(subtasks.filter(st => !st.completed).map(st => st.id));
                setSelectedSubtasks(incomplete);
                setSelectedUser(defaultUser);
            }
        }, [isOpen, subtasks, defaultUser]);

        const toggleSubtask = useCallback((id) => {
            setSelectedSubtasks(prev => {
                const next = new Set(prev);
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
                return next;
            });
        }, []);

        const handleConfirm = useCallback(async () => {
            if (!onConfirm || selectedSubtasks.size === 0) return;
            setLoading(true);
            try {
                await onConfirm(Array.from(selectedSubtasks), selectedUser);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        }, [onConfirm, selectedSubtasks, selectedUser]);

        if (!isOpen) return null;

        const content = h('div', null,
            subtasks.length > 0 ? h('div', { className: 'space-y-2 mb-4' },
                subtasks.map(st => {
                    const id = st.id || st.name;
                    const isCompleted = st.completed;
                    const isSelected = selectedSubtasks.has(id);

                    return h('label', {
                        key: id,
                        className: `flex items-center p-3 border rounded cursor-pointer ${
                            isCompleted ? 'bg-green-50 border-green-300 cursor-not-allowed' : 
                            isSelected ? 'bg-blue-50 border-blue-300' : ''}`
                    },
                        h('input', {
                            type: 'checkbox',
                            checked: isSelected,
                            onChange: () => toggleSubtask(id),
                            disabled: isCompleted || loading,
                            className: 'mr-3'
                        }),
                        h('span', { 
                            className: `flex-1 ${isCompleted ? 'text-green-600 line-through' : ''}` 
                        }, st.name),
                        isCompleted && h('span', { className: 'text-green-500 ml-2' }, '✓')
                    );
                })
            ) : h('div', { className: 'text-center py-8' },
                h('p', { className: 'text-gray-500 italic' }, 'No subtasks available')
            ),
            availableUsers.length > 0 && h('div', null,
                h('label', { className: 'block text-sm font-medium mb-2' }, 'Completed by:'),
                h('select', {
                    value: selectedUser,
                    onChange: (e) => setSelectedUser(e.target.value),
                    className: 'w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500',
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
            h('div', { className: 'flex justify-end space-x-2 pt-4 border-t' },
                h('button', {
                    className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                    onClick: onCancel,
                    disabled: loading
                }, 'Cancel'),
                h('button', {
                    className: `px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ${(loading || selectedSubtasks.size === 0) ? 'opacity-50 cursor-not-allowed' : ''}`,
                    onClick: handleConfirm,
                    disabled: loading || selectedSubtasks.size === 0
                }, loading ? 'Completing...' : `Complete ${selectedSubtasks.size} subtask${selectedSubtasks.size !== 1 ? 's' : ''}`)
            )
        );

        if (!window.choreComponents?.Modal) {
            return renderFallbackModal(content, 'max-w-md');
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onCancel,
            title: title,
            size: 'medium'
        }, content);
    };

    /**
     * Error dialog
     */
    const ErrorDialog = ({ isOpen, title = 'Error', message, details, onClose }) => {
        if (!isOpen) return null;

        const content = h('div', null,
            h('div', { className: 'flex items-start mb-4' },
                h('div', { className: 'text-red-600 text-4xl mr-4' }, '⚠️'),
                h('div', { className: 'flex-1' },
                    h('p', { className: 'text-gray-700 mb-2' }, message),
                    details && h('pre', { 
                        className: 'mt-3 p-3 bg-gray-100 rounded text-xs overflow-x-auto text-red-600' 
                    }, details)
                )
            ),
            h('div', { className: 'flex justify-end' },
                h('button', {
                    className: 'px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600',
                    onClick: onClose
                }, 'Close')
            )
        );

        if (!window.choreComponents?.Modal) {
            return renderFallbackModal(content);
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onClose,
            title: title,
            size: 'medium'
        }, content);
    };

    /**
     * Success dialog
     */
    const SuccessDialog = ({ isOpen, title = 'Success', message, onClose }) => {
        if (!isOpen) return null;

        const content = h('div', null,
            h('div', { className: 'flex items-start mb-6' },
                h('div', { className: 'text-green-600 text-4xl mr-4' }, '✓'),
                h('div', { className: 'flex-1' },
                    h('p', { className: 'text-gray-700' }, message)
                )
            ),
            h('div', { className: 'flex justify-end' },
                h('button', {
                    className: 'px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600',
                    onClick: onClose
                }, 'OK')
            )
        );

        if (!window.choreComponents?.Modal) {
            return renderFallbackModal(content);
        }

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: onClose,
            size: 'small'
        }, content);
    };

    // Export
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        ConfirmDialog,
        CompletionConfirmDialog,
        SubtaskCompletionDialog,
        ErrorDialog,
        SuccessDialog
    });

    console.log('✅ FIXED Dialog components - non-nested structure');
})();