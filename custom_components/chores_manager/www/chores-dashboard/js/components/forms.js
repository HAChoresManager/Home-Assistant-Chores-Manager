/**
 * Form components for the Chores Manager
 * Includes user management, task forms, and various input components
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Form components require React');
        return;
    }

    const h = React.createElement;

    /**
     * Icon selector component
     */
    const IconSelector = function({ value = '📋', onChange }) {
        const icons = [
            '📋', '🧽', '🧹', '🗑️', '🍽️', '👕', '🛏️', '🚿', '🌱', '🐕',
            '🐱', '🚗', '💡', '🔧', '📧', '📞', '💰', '🏠', '🍳', '☕'
        ];

        const [isOpen, setIsOpen] = React.useState(false);

        const handleSelect = (icon) => {
            onChange(icon);
            setIsOpen(false);
        };

        return h('div', { className: "relative" },
            h('button', {
                type: "button",
                className: "w-full p-2 border rounded text-left bg-white hover:bg-gray-50",
                onClick: () => setIsOpen(!isOpen)
            },
                h('span', { className: "text-2xl mr-2" }, value),
                h('span', null, "Kies pictogram")
            ),
            
            isOpen && h('div', {
                className: "absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto"
            },
                h('div', { className: "grid grid-cols-5 gap-1 p-2" },
                    icons.map(icon =>
                        h('button', {
                            key: icon,
                            type: "button",
                            className: `p-2 hover:bg-gray-100 rounded text-center ${
                                value === icon ? 'bg-blue-100 border border-blue-300' : ''
                            }`,
                            onClick: () => handleSelect(icon)
                        }, 
                            h('span', { className: "text-xl" }, icon)
                        )
                    )
                )
            )
        );
    };

    /**
     * Week day picker component
     */
    const WeekDayPicker = function({ selectedDays = [], onChange }) {
        const weekDays = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
        
        const toggleDay = (index) => {
            const newSelection = [...selectedDays];
            if (newSelection.includes(index)) {
                newSelection.splice(newSelection.indexOf(index), 1);
            } else {
                newSelection.push(index);
            }
            onChange(newSelection);
        };
        
        return h('div', { className: 'grid grid-cols-7 gap-2' },
            weekDays.map((day, index) => 
                h('button', {
                    key: index,
                    type: 'button',
                    className: `p-2 rounded ${selectedDays.includes(index) ? 'bg-blue-500 text-white' : 'bg-gray-200'}`,
                    onClick: () => toggleDay(index)
                }, day)
            )
        );
    };
    
    /**
     * Month day picker component
     */
    const MonthDayPicker = function({ selectedDays = [], onChange }) {
        const toggleDay = (day) => {
            const newSelection = [...selectedDays];
            if (newSelection.includes(day)) {
                newSelection.splice(newSelection.indexOf(day), 1);
            } else {
                newSelection.push(day);
            }
            onChange(newSelection);
        };
        
        return h('div', { className: 'grid grid-cols-7 gap-2' },
            Array.from({ length: 31 }, (_, i) => i + 1).map(day =>
                h('button', {
                    key: day,
                    type: 'button',
                    className: `p-2 rounded ${selectedDays.includes(day) ? 'bg-blue-500 text-white' : 'bg-gray-200'}`,
                    onClick: () => toggleDay(day)
                }, day)
            )
        );
    };

    /**
     * User management component
     */
    const UserManagement = ({ users, onSave, onClose }) => {
        const [localUsers, setLocalUsers] = React.useState(users.map(u => ({ ...u })));
        const [haEnabled, setHaEnabled] = React.useState(false);
        const [haUsers, setHaUsers] = React.useState([]);
        const [editingUser, setEditingUser] = React.useState(null);

        // Load HA users if available
        React.useEffect(() => {
            if (window.ChoresAPI && window.ChoresAPI.users && window.ChoresAPI.users.getHAUsers) {
                window.ChoresAPI.users.getHAUsers()
                    .then(users => {
                        setHaUsers(users || []);
                        setHaEnabled(true);
                    })
                    .catch(err => {
                        console.error('Failed to load HA users:', err);
                        setHaEnabled(false);
                    });
            }
        }, []);

        const handleAddUser = () => {
            const newUser = {
                id: `user_${Date.now()}`,
                name: 'Nieuwe Gebruiker',
                color: '#' + Math.floor(Math.random()*16777215).toString(16),
                active: true,
                isNew: true
            };
            setLocalUsers([...localUsers, newUser]);
        };

        const handleImportHAUser = (haUser) => {
            const existingUser = localUsers.find(u => u.id === haUser.id);
            if (!existingUser) {
                const newUser = {
                    id: haUser.id,
                    name: haUser.name,
                    color: '#' + Math.floor(Math.random()*16777215).toString(16),
                    active: true,
                    isNew: true
                };
                setLocalUsers([...localUsers, newUser]);
            }
        };

        const handleUpdateUser = (index, field, value) => {
            const updatedUsers = [...localUsers];
            updatedUsers[index] = {
                ...updatedUsers[index],
                [field]: value,
                modified: true
            };
            setLocalUsers(updatedUsers);
        };

        const handleDeleteUser = (index) => {
            const updatedUsers = [...localUsers];
            if (updatedUsers[index].isNew) {
                // Remove new users completely
                updatedUsers.splice(index, 1);
            } else {
                // Mark existing users for deletion
                updatedUsers[index] = {
                    ...updatedUsers[index],
                    deleted: true
                };
            }
            setLocalUsers(updatedUsers);
        };

        const handleSave = () => {
            onSave(localUsers);
        };

        const handleUpdateColor = (user) => {
            const updatedUsers = localUsers.map(u => 
                u.id === user.id ? { ...u, color: user.color, modified: true } : u
            );
            setLocalUsers(updatedUsers);
            setEditingUser(null);
        };

        return h(window.choreComponents.Modal, { isOpen: true, onClose },
            h('h2', { className: "text-xl font-semibold mb-4" }, "Gebruikersbeheer"),

            // User list
            h('div', { className: "space-y-2 mb-4 max-h-96 overflow-y-auto" },
                localUsers.filter(u => !u.deleted).map((user, index) =>
                    h('div', { key: user.id, className: "flex items-center space-x-2 p-2 border rounded" },
                        h('div', {
                            className: "w-8 h-8 rounded-full cursor-pointer",
                            style: { backgroundColor: user.color },
                            onClick: () => setEditingUser(user),
                            title: "Klik om kleur te wijzigen"
                        }),
                        h('input', {
                            type: "text",
                            className: "flex-1 p-1 border rounded",
                            value: user.name,
                            onChange: (e) => handleUpdateUser(index, 'name', e.target.value),
                            disabled: user.id === 'wie_kan'
                        }),
                        user.id !== 'wie_kan' && h('button', {
                            className: "px-2 py-1 bg-red-500 text-white rounded text-sm",
                            onClick: () => handleDeleteUser(index)
                        }, "Verwijderen")
                    )
                )
            ),

            // Add new user button
            h('button', {
                className: "w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-4",
                onClick: handleAddUser
            }, "Nieuwe Gebruiker Toevoegen"),

            // HA user import section
            haEnabled && haUsers.length > 0 && h('div', { className: "mb-4" },
                h('h3', { className: "font-medium mb-2" }, "Importeer Home Assistant Gebruiker"),
                h('div', { className: "space-y-1" },
                    haUsers.filter(haUser => !localUsers.find(u => u.id === haUser.id))
                        .map(haUser =>
                            h('button', {
                                key: haUser.id,
                                className: "w-full text-left px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded",
                                onClick: () => handleImportHAUser(haUser)
                            }, `+ ${haUser.name}`)
                        )
                )
            ),

            // Action buttons
            h('div', { className: "flex justify-end space-x-2" },
                h('button', {
                    className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                    onClick: onClose
                }, "Annuleren"),
                h('button', {
                    className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                    onClick: handleSave
                }, "Opslaan")
            ),

            // Color picker modal
            editingUser && h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" },
                h('div', { className: "bg-white p-4 rounded-lg" },
                    h('h3', { className: "text-lg font-medium mb-3" }, "Kies kleur voor " + editingUser.name),
                    h('input', {
                        type: "color",
                        value: editingUser.color,
                        onChange: (e) => setEditingUser({ ...editingUser, color: e.target.value }),
                        className: "mb-4"
                    }),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
                            onClick: () => handleUpdateColor(editingUser)
                        }, "Opslaan"),
                        h('button', {
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                            onClick: () => setEditingUser(null)
                        }, "Annuleren")
                    )
                )
            )
        );
    };

    /**
     * Task form component
     * FIX: Accept both 'users' and 'assignees' props to maintain compatibility
     */
    const TaskForm = ({ task, users, assignees, onSave, onDelete, onClose, onResetCompletion }) => {
        // FIX: Use users prop if available, otherwise use assignees prop, fallback to empty array
        const availableUsers = users || assignees || [];
        
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

        const [formData, setFormData] = React.useState(task ? {
            ...defaultFormData,
            ...task,
            chore_id: task.chore_id || task.id
        } : defaultFormData);
        
        const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

        const handleSubmit = (e) => {
            e.preventDefault();
            onSave(formData);
        };

        const handleDelete = () => {
            setShowDeleteConfirm(true);
        };

        const confirmDelete = () => {
            onDelete(task.chore_id || task.id);
            setShowDeleteConfirm(false);
        };

        return h(window.choreComponents.Modal, { isOpen: true, onClose },
            h('h2', { className: "text-xl font-semibold mb-4" }, task ? 'Taak Bewerken' : 'Nieuwe Taak'),

            h('form', { onSubmit: handleSubmit, className: "space-y-4" },
                // Basic task info
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Taaknaam"),
                    h('input', {
                        type: "text",
                        className: "w-full p-2 border rounded",
                        value: formData.name,
                        onChange: (e) => setFormData({ ...formData, name: e.target.value }),
                        required: true
                    })
                ),

                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Beschrijving"),
                    h('textarea', {
                        className: "w-full p-2 border rounded",
                        rows: 3,
                        value: formData.description,
                        onChange: (e) => setFormData({ ...formData, description: e.target.value })
                    })
                ),

                // Icon selection
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Pictogram"),
                    h(IconSelector, {
                        value: formData.icon,
                        onChange: (icon) => setFormData({ ...formData, icon })
                    })
                ),

                // Assignment
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Toegewezen aan"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: formData.assigned_to,
                        onChange: (e) => setFormData({ ...formData, assigned_to: e.target.value })
                    },
                        // FIX: Use availableUsers array instead of undefined users
                        availableUsers.map(user =>
                            h('option', { 
                                key: user.name || user, 
                                value: user.name || user 
                            }, user.name || user)
                        )
                    )
                ),

                // Priority
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Prioriteit"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: formData.priority,
                        onChange: (e) => setFormData({ ...formData, priority: e.target.value })
                    },
                        ['Laag', 'Middel', 'Hoog'].map(priority =>
                            h('option', { key: priority, value: priority }, priority)
                        )
                    )
                ),

                // Duration
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Geschatte duur (minuten)"),
                    h('input', {
                        type: "number",
                        className: "w-full p-2 border rounded",
                        value: formData.duration,
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 15 }),
                        min: 1
                    })
                ),

                // Frequency type
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Frequentie Type"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: formData.frequency_type,
                        onChange: (e) => setFormData({ ...formData, frequency_type: e.target.value })
                    },
                        ['Dagelijks', 'Wekelijks', 'Maandelijks', 'Jaarlijks', 'Aangepast'].map(type =>
                            h('option', { key: type, value: type }, type)
                        )
                    )
                ),

                // Frequency days (for custom frequency)
                (formData.frequency_type === 'Aangepast' || formData.frequency_type === 'Dagelijks') && 
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Aantal dagen"),
                    h('input', {
                        type: "number",
                        className: "w-full p-2 border rounded",
                        value: formData.frequency_days,
                        onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) || 1 }),
                        min: 1
                    })
                ),

                // Week days selection (for weekly)
                formData.frequency_type === 'Wekelijks' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Dagen van de week"),
                    h(WeekDayPicker, {
                        selectedDays: formData.selected_weekdays || [],
                        onChange: (days) => setFormData({ ...formData, selected_weekdays: days })
                    })
                ),

                // Month days selection (for monthly)
                formData.frequency_type === 'Maandelijks' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Dagen van de maand"),
                    h(MonthDayPicker, {
                        selectedDays: formData.active_monthdays || [],
                        onChange: (days) => setFormData({ ...formData, active_monthdays: days })
                    })
                ),

                // Notifications
                h('div', null,
                    h('label', { className: "flex items-center" },
                        h('input', {
                            type: "checkbox",
                            className: "mr-2",
                            checked: formData.notify_when_due,
                            onChange: (e) => setFormData({ ...formData, notify_when_due: e.target.checked })
                        }),
                        h('span', { className: "text-sm font-medium" }, "Stuur notificatie wanneer verschuldigd")
                    )
                ),

                // Subtasks
                h('div', null,
                    h('label', { className: "flex items-center" },
                        h('input', {
                            type: "checkbox",
                            className: "mr-2",
                            checked: formData.has_subtasks,
                            onChange: (e) => setFormData({
                                ...formData,
                                has_subtasks: e.target.checked,
                                subtasks: e.target.checked ? (formData.subtasks || []) : []
                            })
                        }),
                        h('span', { className: "text-sm font-medium" }, "Heeft subtaken")
                    )
                ),

                // Subtask list
                formData.has_subtasks && h('div', { className: "space-y-2" },
                    h('label', { className: "block text-sm font-medium mb-1" }, "Subtaken"),
                    (formData.subtasks || []).map((subtask, index) =>
                        h('div', { key: index, className: "flex items-center space-x-2" },
                            h('input', {
                                type: "text",
                                className: "flex-1 p-2 border rounded",
                                value: subtask.name || subtask,
                                onChange: (e) => {
                                    const newSubtasks = [...formData.subtasks];
                                    if (typeof newSubtasks[index] === 'string') {
                                        newSubtasks[index] = e.target.value;
                                    } else {
                                        newSubtasks[index] = { ...newSubtasks[index], name: e.target.value };
                                    }
                                    setFormData({ ...formData, subtasks: newSubtasks });
                                }
                            }),
                            h('button', {
                                type: "button",
                                className: "px-2 py-1 bg-red-500 text-white rounded",
                                onClick: () => {
                                    const newSubtasks = formData.subtasks.filter((_, i) => i !== index);
                                    setFormData({ ...formData, subtasks: newSubtasks });
                                }
                            }, "×")
                        )
                    ),
                    h('button', {
                        type: "button",
                        className: "px-3 py-1 bg-blue-500 text-white rounded",
                        onClick: () => {
                            setFormData({ 
                                ...formData, 
                                subtasks: [...(formData.subtasks || []), '']
                            });
                        }
                    }, "Subtaak toevoegen")
                ),

                // Action buttons
                h('div', { className: "flex justify-between" },
                    h('div', { className: "flex space-x-2" },
                        h('button', {
                            type: "submit",
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, task ? "Bijwerken" : "Toevoegen"),
                        h('button', {
                            type: "button",
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                            onClick: onClose
                        }, "Annuleren")
                    ),
                    
                    task && h('div', { className: "flex space-x-2" },
                        task.completed_today && h('button', {
                            type: "button",
                            className: "px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600",
                            onClick: () => onResetCompletion(task.chore_id || task.id)
                        }, "Reset Voltooiing"),
                        h('button', {
                            type: "button",
                            className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600",
                            onClick: handleDelete
                        }, "Verwijderen")
                    )
                )
            ),

            // Delete confirmation dialog
            showDeleteConfirm && h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" },
                h('div', { className: "bg-white p-4 rounded-lg max-w-md" },
                    h('h3', { className: "text-lg font-medium mb-2" }, "Taak verwijderen"),
                    h('p', { className: "text-gray-600 mb-4" }, 
                        "Weet je zeker dat je deze taak permanent wilt verwijderen?"),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                            onClick: () => setShowDeleteConfirm(false)
                        }, "Annuleren"),
                        h('button', {
                            className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600",
                            onClick: confirmDelete
                        }, "Verwijderen")
                    )
                )
            )
        );
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

    console.log('Form components loaded successfully');

})();