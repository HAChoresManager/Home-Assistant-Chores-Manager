/**
 * COMPLETELY FIXED Form Components for the Chores Manager
 * Fixed modal positioning with inline styles to prevent CSS interference
 */

(function() {
    'use strict';

    if (!window.React) {
        console.error('Form components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useCallback, useEffect, useRef } = React;

    // CRITICAL: Overlay style for proper viewport-fixed positioning
    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        padding: '1rem',
        overflowY: 'auto'
    };

    const modalContentStyle = {
        maxHeight: '90vh',
        overflow: 'hidden',
        margin: 'auto'
    };

    /**
     * Icon selector component
     */
    const IconSelector = ({ value = '📋', onChange }) => {
        const [showPicker, setShowPicker] = useState(false);
        const pickerRef = useRef(null);

        const icons = [
            '📋', '🧹', '🧽', '🚿', '🛏️', '👕', '🍽️', '🗑️', '🌱', '🚗',
            '🔧', '💡', '🎯', '📚', '💻', '🏠', '🔒', '💰', '📊', '🎨',
            '🍳', '🛒', '🧺', '🔌', '🪟', '🚪', '🛋️', '📦', '🧴', '🪴'
        ];

        useEffect(() => {
            const handleClickOutside = (event) => {
                if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                    setShowPicker(false);
                }
            };

            if (showPicker) {
                document.addEventListener('mousedown', handleClickOutside);
                return () => document.removeEventListener('mousedown', handleClickOutside);
            }
        }, [showPicker]);

        return h('div', { className: 'relative' },
            h('label', { className: 'block text-sm font-medium mb-1' }, 'Icoon'),
            h('button', {
                type: 'button',
                className: 'w-full p-2 border rounded flex items-center justify-between bg-white hover:bg-gray-50',
                onClick: () => setShowPicker(!showPicker)
            },
                h('span', { className: 'flex items-center' },
                    h('span', { className: 'text-2xl mr-2' }, value),
                    h('span', null, 'Kies icoon')
                ),
                h('span', { className: 'text-gray-400' }, showPicker ? '▲' : '▼')
            ),
            
            showPicker && h('div', {
                ref: pickerRef,
                className: 'absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto'
            },
                h('div', { className: 'grid grid-cols-6 gap-1 p-2' },
                    icons.map(icon => 
                        h('button', {
                            key: icon,
                            type: 'button',
                            className: `p-2 text-xl hover:bg-gray-100 rounded ${value === icon ? 'bg-blue-100 border-2 border-blue-500' : ''}`,
                            onClick: () => {
                                onChange(icon);
                                setShowPicker(false);
                            }
                        }, icon)
                    )
                )
            )
        );
    };

    /**
     * Week day picker component
     */
    const WeekDayPicker = ({ value = [], onChange }) => {
        const weekdays = [
            { key: 'monday', label: 'Ma' },
            { key: 'tuesday', label: 'Di' },
            { key: 'wednesday', label: 'Wo' },
            { key: 'thursday', label: 'Do' },
            { key: 'friday', label: 'Vr' },
            { key: 'saturday', label: 'Za' },
            { key: 'sunday', label: 'Zo' }
        ];

        const toggleDay = (day) => {
            const newValue = value.includes(day) 
                ? value.filter(d => d !== day)
                : [...value, day];
            onChange(newValue);
        };

        return h('div', { className: 'space-y-2' },
            h('label', { className: 'block text-sm font-medium' }, 'Weekdagen'),
            h('div', { className: 'flex flex-wrap gap-2' },
                weekdays.map(({ key, label }) =>
                    h('button', {
                        key,
                        type: 'button',
                        className: `px-3 py-1 rounded text-sm transition-colors ${
                            value.includes(key)
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-gray-300 hover:border-gray-400 bg-white'
                        }`,
                        onClick: () => toggleDay(key)
                    }, label)
                )
            )
        );
    };

    /**
     * Month day picker component
     */
    const MonthDayPicker = ({ value = [], onChange }) => {
        const days = Array.from({ length: 31 }, (_, i) => i + 1);

        const toggleDay = (day) => {
            const newValue = value.includes(day) 
                ? value.filter(d => d !== day)
                : [...value, day];
            onChange(newValue);
        };

        return h('div', { className: 'space-y-2' },
            h('label', { className: 'block text-sm font-medium' }, 'Dagen van de maand'),
            h('div', { className: 'grid grid-cols-7 gap-1 max-h-32 overflow-y-auto' },
                days.map(day =>
                    h('button', {
                        key: day,
                        type: 'button',
                        className: `p-1 text-xs rounded transition-colors ${
                            value.includes(day)
                                ? 'bg-blue-500 text-white'
                                : 'border hover:bg-gray-100'
                        }`,
                        onClick: () => toggleDay(day)
                    }, day)
                )
            )
        );
    };

    /**
     * User management component
     */
    const UserManagement = ({ 
        users = [], 
        onSave = null, 
        onUpdate = null, 
        onDelete = null, 
        onClose = null 
    }) => {
        const [newUser, setNewUser] = useState({ name: '', color: '#3b82f6' });
        const [editingUser, setEditingUser] = useState(null);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);

        const saveHandler = onSave || onUpdate;

        const handleAddUser = useCallback(async (e) => {
            e.preventDefault();
            if (!newUser.name.trim()) return;

            setLoading(true);
            setError(null);

            try {
                if (saveHandler) {
                    await saveHandler({ ...newUser, name: newUser.name.trim() });
                } else if (window.ChoresAPI?.users?.add) {
                    await window.ChoresAPI.users.add(newUser.name.trim(), newUser.color);
                }
                setNewUser({ name: '', color: '#3b82f6' });
            } catch (err) {
                setError(`Failed to add user: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [newUser, saveHandler]);

        const handleUpdateColor = useCallback(async (user) => {
            setLoading(true);
            setError(null);

            try {
                if (saveHandler) {
                    await saveHandler(user);
                } else if (window.ChoresAPI?.users?.update) {
                    await window.ChoresAPI.users.update(user.name, user.color);
                }
                setEditingUser(null);
            } catch (err) {
                setError(`Failed to update color: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [saveHandler]);

        const handleDeleteUser = useCallback(async (userName) => {
            if (!window.confirm(`Weet je zeker dat je ${userName} wilt verwijderen?`)) return;

            setLoading(true);
            setError(null);

            try {
                if (onDelete) {
                    await onDelete(userName);
                } else if (window.ChoresAPI?.users?.delete) {
                    await window.ChoresAPI.users.delete(userName);
                }
            } catch (err) {
                setError(`Failed to delete user: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [onDelete]);

        return h('div', { className: 'space-y-6' },
            error && h('div', { className: 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded' }, error),

            h('form', { onSubmit: handleAddUser, className: 'space-y-4' },
                h('h3', { className: 'text-lg font-medium' }, 'Nieuwe gebruiker toevoegen'),
                h('div', { className: 'grid grid-cols-2 gap-4' },
                    h('input', {
                        type: 'text',
                        placeholder: 'Naam',
                        value: newUser.name,
                        onChange: (e) => setNewUser({ ...newUser, name: e.target.value }),
                        className: 'p-2 border rounded',
                        disabled: loading
                    }),
                    h('input', {
                        type: 'color',
                        value: newUser.color,
                        onChange: (e) => setNewUser({ ...newUser, color: e.target.value }),
                        className: 'p-2 border rounded h-full',
                        disabled: loading
                    })
                ),
                h('button', {
                    type: 'submit',
                    className: `px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                    disabled: loading || !newUser.name.trim()
                }, loading ? 'Toevoegen...' : 'Toevoegen')
            ),

            h('div', { className: 'space-y-2' },
                h('h3', { className: 'text-lg font-medium' }, 'Huidige gebruikers'),
                users.length === 0 
                    ? h('p', { className: 'text-gray-500' }, 'Geen gebruikers')
                    : users.map(user => 
                        h('div', { 
                            key: user.name || user,
                            className: 'flex items-center justify-between p-3 bg-gray-50 rounded'
                        },
                            h('div', { className: 'flex items-center space-x-3' },
                                h('div', {
                                    className: 'w-8 h-8 rounded-full',
                                    style: { backgroundColor: user.color || '#3b82f6' }
                                }),
                                h('span', { className: 'font-medium' }, user.name || user)
                            ),
                            h('div', { className: 'flex space-x-2' },
                                h('button', {
                                    className: 'px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600',
                                    onClick: () => setEditingUser(user),
                                    disabled: loading
                                }, 'Kleur'),
                                h('button', {
                                    className: 'px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600',
                                    onClick: () => handleDeleteUser(user.name || user),
                                    disabled: loading
                                }, 'Verwijder')
                            )
                        )
                    )
            ),

            onClose && h('button', {
                className: 'w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                onClick: onClose
            }, 'Sluiten'),

            // FIXED: Edit user color dialog with inline styles
            editingUser && h('div', { style: overlayStyle },
                h('div', { className: 'bg-white p-6 rounded-lg max-w-md w-full mx-4', style: modalContentStyle },
                    h('h3', { className: 'text-lg font-medium mb-4' }, 'Kleur bewerken'),
                    h('input', {
                        type: 'color',
                        value: editingUser.color || '#3b82f6',
                        onChange: (e) => setEditingUser({ ...editingUser, color: e.target.value }),
                        className: 'w-full h-12 border rounded mb-4'
                    }),
                    h('div', { className: 'flex justify-end space-x-2' },
                        h('button', {
                            className: 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600',
                            onClick: () => handleUpdateColor(editingUser),
                            disabled: loading
                        }, loading ? 'Opslaan...' : 'Opslaan'),
                        h('button', {
                            className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                            onClick: () => setEditingUser(null)
                        }, 'Annuleren')
                    )
                )
            )
        );
    };

    /**
     * COMPLETELY FIXED TaskForm component with inline styled overlays
     */
    const TaskForm = ({ 
        task = null, 
        chore = null,
        users = null, 
        assignees = null,
        onSave = null, 
        onSubmit = null,
        onUpdate = null,
        onDelete = null, 
        onClose = null,
        onCancel = null,
        onResetCompletion = null 
    }) => {
        const taskData = task || chore;
        const availableUsers = users || assignees || [];
        const saveHandler = onSave || onSubmit || onUpdate;
        const closeHandler = onClose || onCancel;

        const defaultFormData = {
            name: '',
            description: '',
            frequency_type: 'Wekelijks',
            frequency_days: 7,
            frequency_times: 1,
            selected_weekdays: [],
            monthday: -1,
            active_monthdays: [],
            assigned_to: 'Wie kan',
            priority: 'Middel',
            duration: 15,
            icon: '📋',
            use_alternating: false,
            alternate_with: '',
            notify_when_due: false,
            has_subtasks: false,
            subtasks: []
        };

        const [formData, setFormData] = useState(() => {
            if (taskData) {
                return {
                    ...defaultFormData,
                    ...taskData,
                    chore_id: taskData.chore_id || taskData.id,
                    selected_weekdays: taskData.selected_weekdays || [],
                    active_monthdays: taskData.active_monthdays || [],
                    subtasks: taskData.subtasks || []
                };
            }
            return defaultFormData;
        });
        
        const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);

        const handleSubmit = useCallback(async (e) => {
            e.preventDefault();
            
            if (!formData.name.trim()) {
                setError('Taaknaam is verplicht');
                return;
            }

            if (!saveHandler) {
                setError('No save handler available');
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const cleanedData = {
                    ...formData,
                    name: formData.name.trim(),
                    description: formData.description.trim(),
                    frequency_days: parseInt(formData.frequency_days) || 7,
                    duration: parseInt(formData.duration) || 15,
                    frequency_times: parseInt(formData.frequency_times) || 1
                };

                await saveHandler(cleanedData);
                
                if (closeHandler) {
                    closeHandler();
                }
            } catch (err) {
                setError(`Failed to save task: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [formData, saveHandler, closeHandler]);

        const handleDelete = useCallback(() => {
            if (!taskData) return;
            setShowDeleteConfirm(true);
        }, [taskData]);

        const confirmDelete = useCallback(async () => {
            if (!onDelete || !taskData) return;

            setLoading(true);
            setError(null);

            try {
                await onDelete(taskData.chore_id || taskData.id);
                setShowDeleteConfirm(false);
                if (closeHandler) {
                    closeHandler();
                }
            } catch (err) {
                setError(`Failed to delete task: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [onDelete, taskData, closeHandler]);

        const handleResetCompletion = useCallback(async () => {
            if (!onResetCompletion || !taskData) return;

            setLoading(true);
            setError(null);

            try {
                await onResetCompletion(taskData.chore_id || taskData.id);
            } catch (err) {
                setError(`Failed to reset completion: ${err.message}`);
            } finally {
                setLoading(false);
            }
        }, [onResetCompletion, taskData]);

        // FIXED: Fallback with inline styles
        if (!window.choreComponents?.Modal) {
            return h('div', { style: overlayStyle },
                h('div', { className: 'bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto', style: modalContentStyle },
                    h('div', { className: 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4' },
                        'Modal component not available. Please reload the page.'
                    ),
                    h('button', {
                        onClick: closeHandler,
                        className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
                    }, 'Close')
                )
            );
        }

        const formContent = h('div', { className: 'space-y-6' },
            h('h2', { className: 'text-xl font-semibold mb-4' }, 
                taskData ? 'Taak bewerken' : 'Nieuwe taak toevoegen'
            ),

            error && h('div', { className: 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded' }, error),

            h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
                // Basic info
                h('div', { className: 'grid grid-cols-2 gap-4' },
                    h('div', null,
                        h('label', { className: 'block text-sm font-medium mb-1' }, 'Taaknaam *'),
                        h('input', {
                            type: 'text',
                            value: formData.name,
                            onChange: (e) => setFormData({ ...formData, name: e.target.value }),
                            className: 'w-full p-2 border rounded',
                            required: true,
                            disabled: loading
                        })
                    ),
                    h('div', null,
                        h(IconSelector, {
                            value: formData.icon,
                            onChange: (icon) => setFormData({ ...formData, icon })
                        })
                    )
                ),

                // Description
                h('div', null,
                    h('label', { className: 'block text-sm font-medium mb-1' }, 'Beschrijving'),
                    h('textarea', {
                        value: formData.description,
                        onChange: (e) => setFormData({ ...formData, description: e.target.value }),
                        className: 'w-full p-2 border rounded h-20 resize-vertical',
                        disabled: loading
                    })
                ),

                // Assignment and priority
                h('div', { className: 'grid grid-cols-2 gap-4' },
                    h('div', null,
                        h('label', { className: 'block text-sm font-medium mb-1' }, 'Toegewezen aan'),
                        h('select', {
                            value: formData.assigned_to,
                            onChange: (e) => setFormData({ ...formData, assigned_to: e.target.value }),
                            className: 'w-full p-2 border rounded',
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
                    h('div', null,
                        h('label', { className: 'block text-sm font-medium mb-1' }, 'Prioriteit'),
                        h('select', {
                            value: formData.priority,
                            onChange: (e) => setFormData({ ...formData, priority: e.target.value }),
                            className: 'w-full p-2 border rounded',
                            disabled: loading
                        },
                            h('option', { value: 'Laag' }, 'Laag'),
                            h('option', { value: 'Middel' }, 'Middel'),
                            h('option', { value: 'Hoog' }, 'Hoog')
                        )
                    )
                ),

                // Duration
                h('div', null,
                    h('label', { className: 'block text-sm font-medium mb-1' }, 'Geschatte duur (minuten)'),
                    h('input', {
                        type: 'number',
                        min: '1',
                        value: formData.duration,
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 15 }),
                        className: 'w-full p-2 border rounded',
                        disabled: loading
                    })
                ),

                // Frequency
                h('div', { className: 'space-y-3' },
                    h('label', { className: 'block text-sm font-medium mb-1' }, 'Frequentie'),
                    h('select', {
                        value: formData.frequency_type,
                        onChange: (e) => setFormData({ ...formData, frequency_type: e.target.value }),
                        className: 'w-full p-2 border rounded',
                        disabled: loading
                    },
                        h('option', { value: 'Dagelijks' }, 'Dagelijks'),
                        h('option', { value: 'Wekelijks' }, 'Wekelijks'),
                        h('option', { value: 'Maandelijks' }, 'Maandelijks'),
                        h('option', { value: 'Custom' }, 'Aangepast')
                    ),

                    formData.frequency_type === 'Custom' && h('div', null,
                        h('label', { className: 'block text-sm font-medium mb-1' }, 'Elke X dagen'),
                        h('input', {
                            type: 'number',
                            min: '1',
                            value: formData.frequency_days,
                            onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) || 1 }),
                            className: 'w-full p-2 border rounded',
                            disabled: loading
                        })
                    ),

                    formData.frequency_type === 'Wekelijks' && h(WeekDayPicker, {
                        value: formData.selected_weekdays,
                        onChange: (weekdays) => setFormData({ ...formData, selected_weekdays: weekdays })
                    }),

                    formData.frequency_type === 'Maandelijks' && h(MonthDayPicker, {
                        value: formData.active_monthdays,
                        onChange: (monthdays) => setFormData({ ...formData, active_monthdays: monthdays })
                    })
                ),

                // Subtasks
                h('div', { className: 'space-y-3' },
                    h('label', { className: 'flex items-center' },
                        h('input', {
                            type: 'checkbox',
                            checked: formData.has_subtasks,
                            onChange: (e) => setFormData({ 
                                ...formData, 
                                has_subtasks: e.target.checked,
                                subtasks: e.target.checked ? (formData.subtasks || []) : []
                            }),
                            className: 'mr-2',
                            disabled: loading
                        }),
                        h('span', { className: 'text-sm font-medium' }, 'Heeft subtaken')
                    ),

                    formData.has_subtasks && h('div', { className: 'space-y-2 pl-6' },
                        h('label', { className: 'block text-sm font-medium mb-1' }, 'Subtaken'),
                        (formData.subtasks || []).map((subtask, index) =>
                            h('div', { key: index, className: 'flex items-center space-x-2' },
                                h('input', {
                                    type: 'text',
                                    className: 'flex-1 p-2 border rounded',
                                    value: typeof subtask === 'string' ? subtask : subtask.name || '',
                                    onChange: (e) => {
                                        const newSubtasks = [...formData.subtasks];
                                        newSubtasks[index] = typeof subtask === 'string' 
                                            ? e.target.value 
                                            : { ...subtask, name: e.target.value };
                                        setFormData({ ...formData, subtasks: newSubtasks });
                                    },
                                    placeholder: 'Subtaak naam',
                                    disabled: loading
                                }),
                                h('button', {
                                    type: 'button',
                                    className: 'px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600',
                                    onClick: () => {
                                        const newSubtasks = formData.subtasks.filter((_, i) => i !== index);
                                        setFormData({ ...formData, subtasks: newSubtasks });
                                    },
                                    disabled: loading
                                }, '×')
                            )
                        ),
                        h('button', {
                            type: 'button',
                            className: 'px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm',
                            onClick: () => {
                                setFormData({ 
                                    ...formData, 
                                    subtasks: [...(formData.subtasks || []), '']
                                });
                            },
                            disabled: loading
                        }, 'Subtaak toevoegen')
                    )
                ),

                // Action buttons
                h('div', { className: 'flex justify-between pt-4 border-t' },
                    h('div', { className: 'flex space-x-2' },
                        h('button', {
                            type: 'submit',
                            className: `px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                            disabled: loading
                        }, loading ? 'Opslaan...' : (taskData ? 'Bijwerken' : 'Toevoegen')),
                        h('button', {
                            type: 'button',
                            className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                            onClick: closeHandler,
                            disabled: loading
                        }, 'Annuleren')
                    ),
                    
                    taskData && h('div', { className: 'flex space-x-2' },
                        taskData.completed_today && h('button', {
                            type: 'button',
                            className: `px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: handleResetCompletion,
                            disabled: loading
                        }, 'Reset Voltooiing'),
                        h('button', {
                            type: 'button',
                            className: `px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: handleDelete,
                            disabled: loading
                        }, 'Verwijderen')
                    )
                )
            ),

            // FIXED: Delete confirmation dialog with inline styles
            showDeleteConfirm && h('div', { style: overlayStyle },
                h('div', { className: 'bg-white p-6 rounded-lg max-w-md mx-4', style: modalContentStyle },
                    h('h3', { className: 'text-lg font-medium mb-2' }, 'Taak verwijderen'),
                    h('p', { className: 'text-gray-600 mb-4' }, 
                        'Weet je zeker dat je deze taak permanent wilt verwijderen?'
                    ),
                    h('div', { className: 'flex justify-end space-x-2' },
                        h('button', {
                            className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400',
                            onClick: () => setShowDeleteConfirm(false),
                            disabled: loading
                        }, 'Annuleren'),
                        h('button', {
                            className: `px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: confirmDelete,
                            disabled: loading
                        }, loading ? 'Verwijderen...' : 'Verwijderen')
                    )
                )
            )
        );

        return h(window.choreComponents.Modal, { 
            isOpen: true, 
            onClose: closeHandler 
        }, formContent);
    };

    // Export all form components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        TaskForm,
        UserManagement,
        IconSelector,
        WeekDayPicker,
        MonthDayPicker
    });

    console.log('✅ FIXED Form components loaded with inline-styled overlays for proper positioning');
})();