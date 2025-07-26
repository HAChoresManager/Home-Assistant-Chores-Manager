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
     * Weekday picker component
     */
    const WeekDayPicker = function({ selectedDays = [], onChange }) {
        const weekdays = [
            { key: 0, label: 'Zo' },
            { key: 1, label: 'Ma' },
            { key: 2, label: 'Di' },
            { key: 3, label: 'Wo' },
            { key: 4, label: 'Do' },
            { key: 5, label: 'Vr' },
            { key: 6, label: 'Za' }
        ];

        const handleToggle = (day) => {
            const newSelected = selectedDays.includes(day)
                ? selectedDays.filter(d => d !== day)
                : [...selectedDays, day];
            onChange(newSelected);
        };

        return h('div', { className: "flex flex-wrap gap-2" },
            weekdays.map(({ key, label }) =>
                h('button', {
                    key: key,
                    type: "button",
                    className: `px-3 py-1 rounded border ${
                        selectedDays.includes(key)
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`,
                    onClick: () => handleToggle(key)
                }, label)
            )
        );
    };

    /**
     * Month day picker component
     */
    const MonthDayPicker = function({ selectedDays = [], onChange }) {
        const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

        const handleToggle = (day) => {
            const newSelected = selectedDays.includes(day)
                ? selectedDays.filter(d => d !== day)
                : [...selectedDays, day];
            onChange(newSelected);
        };

        return h('div', { className: "grid grid-cols-7 gap-1 max-h-32 overflow-y-auto" },
            monthDays.map(day =>
                h('button', {
                    key: day,
                    type: "button",
                    className: `px-2 py-1 text-sm rounded border ${
                        selectedDays.includes(day)
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`,
                    onClick: () => handleToggle(day)
                }, day)
            )
        );
    };

    /**
     * User management component
     */
    const UserManagement = function({ users = [], onSave, onClose }) {
        const [localUsers, setLocalUsers] = React.useState(users);
        const [newUserName, setNewUserName] = React.useState('');
        const [newUserColor, setNewUserColor] = React.useState('#3B82F6');
        const [editingUser, setEditingUser] = React.useState(null);

        const defaultUsers = ['Wie kan'];
        const isDefaultUser = (userName) => defaultUsers.includes(userName);

        React.useEffect(() => {
            setLocalUsers(users);
        }, [users]);

        const handleSubmit = async (e) => {
            e.preventDefault();
            
            if (!newUserName.trim()) {
                alert('Voer een gebruikersnaam in');
                return;
            }

            // Check if user already exists
            if (localUsers.some(u => u.name === newUserName.trim())) {
                alert('Deze gebruiker bestaat al');
                return;
            }

            try {
                // Call the ChoresAPI to add the user - FIX: Pass object instead of individual params
                if (window.ChoresAPI && window.ChoresAPI.users) {
                    await window.ChoresAPI.users.addUser({
                        id: newUserName.trim(),
                        name: newUserName.trim(),
                        color: newUserColor
                    });
                    
                    // Update local state
                    setLocalUsers([...localUsers, { 
                        name: newUserName.trim(), 
                        color: newUserColor 
                    }]);
                    
                    // Clear form
                    setNewUserName('');
                    setNewUserColor('#3B82F6');
                    
                    // Notify parent
                    onSave([...localUsers, { 
                        name: newUserName.trim(), 
                        color: newUserColor 
                    }]);
                }
            } catch (error) {
                console.error('Failed to add user:', error);
                alert('Er is een fout opgetreden bij het toevoegen van de gebruiker');
            }
        };

        const handleDelete = async (userName) => {
            if (isDefaultUser(userName)) return;
            
            if (!confirm(`Weet je zeker dat je "${userName}" wilt verwijderen?`)) {
                return;
            }

            try {
                // Call the ChoresAPI to delete the user
                if (window.ChoresAPI && window.ChoresAPI.users) {
                    await window.ChoresAPI.users.deleteUser(userName);
                    
                    // Update local state
                    const updatedUsers = localUsers.filter(u => u.name !== userName);
                    setLocalUsers(updatedUsers);
                    
                    // Notify parent
                    onSave(updatedUsers);
                }
            } catch (error) {
                console.error('Failed to delete user:', error);
                alert('Er is een fout opgetreden bij het verwijderen van de gebruiker');
            }
        };

        const handleUpdateColor = async (user) => {
            try {
                // Call the ChoresAPI to update the user - FIX: Pass object instead of individual params
                if (window.ChoresAPI && window.ChoresAPI.users) {
                    await window.ChoresAPI.users.addUser({
                        id: user.name,
                        name: user.name,
                        color: user.color
                    });
                    
                    // Update local state
                    const updatedUsers = localUsers.map(u => 
                        u.name === user.name ? user : u
                    );
                    setLocalUsers(updatedUsers);
                    
                    // Notify parent
                    onSave(updatedUsers);
                }
                
                setEditingUser(null);
            } catch (error) {
                console.error('Failed to update user color:', error);
                alert('Er is een fout opgetreden bij het bijwerken van de kleur');
            }
        };

        return h('div', { className: "p-4" },
            h('h2', { className: "text-xl font-semibold mb-4" }, "Gebruikersbeheer"),

            h('div', { className: "space-y-2 mb-6" },
                h('h3', { className: "text-lg font-medium mb-2" }, "Huidige gebruikers"),
                localUsers.filter(u => !isDefaultUser(u.name)).map(user =>
                    h('div', {
                        key: user.name,
                        className: "flex items-center justify-between p-2 bg-gray-50 rounded"
                    },
                        h('div', { className: "flex items-center space-x-2" },
                            h('div', {
                                className: "w-6 h-6 rounded-full border",
                                style: { backgroundColor: user.color || '#3B82F6' }
                            }),
                            h('span', { className: "font-medium" }, user.name),
                            isDefaultUser(user.name) && h('span', { 
                                className: "text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded" 
                            }, "standaard")
                        ),
                        !isDefaultUser(user.name) && h('div', { className: "flex space-x-1" },
                            h('button', {
                                className: "text-blue-600 hover:text-blue-800",
                                onClick: () => setEditingUser(user)
                            }, "✏️"),
                            h('button', {
                                className: "text-red-600 hover:text-red-800",
                                onClick: () => handleDelete(user.name)
                            }, "🗑️")
                        )
                    )
                )
            ),

            h('form', { onSubmit: handleSubmit, className: "space-y-4" },
                h('h3', { className: "text-lg font-medium" }, "Nieuwe gebruiker toevoegen"),
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Naam"),
                    h('input', {
                        type: "text",
                        className: "w-full p-2 border rounded",
                        value: newUserName,
                        onChange: (e) => setNewUserName(e.target.value),
                        placeholder: "Gebruikersnaam"
                    })
                ),
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Kleur"),
                    h('input', {
                        type: "color",
                        className: "w-full h-10 border rounded",
                        value: newUserColor,
                        onChange: (e) => setNewUserColor(e.target.value)
                    })
                ),
                h('div', { className: "flex space-x-2" },
                    h('button', {
                        type: "submit",
                        className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    }, "Toevoegen"),
                    h('button', {
                        type: "button",
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400",
                        onClick: onClose
                    }, "Sluiten")
                )
            ),

            // Color editing modal
            editingUser && h('div', { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" },
                h('div', { className: "bg-white p-4 rounded-lg" },
                    h('h4', { className: "text-lg font-medium mb-2" }, `Kleur wijzigen voor ${editingUser.name}`),
                    h('input', {
                        type: "color",
                        className: "w-full h-10 border rounded mb-4",
                        value: editingUser.color || '#3B82F6',
                        onChange: (e) => setEditingUser({ ...editingUser, color: e.target.value })
                    }),
                    h('div', { className: "flex space-x-2" },
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
            frequency_days: task.frequency || task.frequency_days || 7,
            selected_weekdays: task.selected_weekdays || [],
            active_monthdays: task.active_monthdays || []
        } : defaultFormData);

        const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

        const handleFrequencyChange = (frequencyType) => {
            const updates = { frequency_type: frequencyType };
            
            switch(frequencyType) {
                case 'Daily':
                    updates.frequency_days = 1;
                    break;
                case 'Weekly':
                    updates.frequency_days = 7;
                    break;
                case 'BiWeekly':
                    updates.frequency_days = 14;
                    break;
                case 'Monthly':
                    updates.frequency_days = 30;
                    break;
            }
            
            setFormData({ ...formData, ...updates });
        };

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

        return h('div', { className: "p-4" },
            h('h2', { className: "text-xl font-semibold mb-4" }, 
                task ? 'Taak Bewerken' : 'Nieuwe Taak'),

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
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) }),
                        min: 1
                    })
                ),

                // Frequency
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Frequentie"),
                    h('select', {
                        className: "w-full p-2 border rounded",
                        value: formData.frequency_type,
                        onChange: (e) => handleFrequencyChange(e.target.value)
                    },
                        [
                            { value: 'Daily', label: 'Dagelijks' },
                            { value: 'Weekly', label: 'Wekelijks' },
                            { value: 'BiWeekly', label: 'Om de week' },
                            { value: 'Monthly', label: 'Maandelijks' }
                        ].map(option =>
                            h('option', { key: option.value, value: option.value }, option.label)
                        )
                    )
                ),

                // Custom frequency
                formData.frequency_type === 'Custom' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Aangepaste frequentie (dagen)"),
                    h('input', {
                        type: "number",
                        className: "w-full p-2 border rounded",
                        value: formData.frequency_days,
                        onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) }),
                        min: 1
                    })
                ),

                // Weekday selection for weekly tasks
                (formData.frequency_type === 'Weekly' || formData.frequency_type === 'BiWeekly') && 
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Dagen van de week"),
                    h(WeekDayPicker, {
                        selectedDays: formData.selected_weekdays,
                        onChange: (days) => setFormData({ ...formData, selected_weekdays: days })
                    })
                ),

                // Month day selection for monthly tasks
                formData.frequency_type === 'Monthly' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Dagen van de maand"),
                    h(MonthDayPicker, {
                        selectedDays: formData.active_monthdays,
                        onChange: (days) => setFormData({ ...formData, active_monthdays: days })
                    })
                ),

                // Subtasks
                h('div', null,
                    h('label', { className: "flex items-center space-x-2" },
                        h('input', {
                            type: "checkbox",
                            checked: formData.has_subtasks,
                            onChange: (e) => setFormData({ 
                                ...formData, 
                                has_subtasks: e.target.checked,
                                subtasks: e.target.checked ? formData.subtasks : []
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
    Object.assign(window.choreComponents || {}, {
        TaskForm,
        UserManagement,
        IconSelector,
        WeekDayPicker,
        MonthDayPicker
    });

    console.log('Form components loaded successfully');

})();