h('div', { className: "flex justify-end space-x-2 mt-4" },
                    h('button', {
                        onClick: onClose,
                        className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    }, "Sluiten")
                )/**
 * Form components for the Chores Manager
 * This module contains all form-related components
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
    const IconSelector = ({ value, onChange }) => {
        const icons = [
            '🧹', '🧽', '🚿', '🛁', '🚽', '🪣',
            '🧻', '🧴', '🧯', '🪟', '🛏️', '🛋️',
            '🪑', '🚪', '🪜', '🧺', '👕', '🩳',
            '🧦', '🥾', '🍽️', '🥄', '🥢', '🍳',
            '🌿', '🌱', '🌾', '🌻', '💡', '🔌',
            '🔋', '🔧', '🔨', '🪛', '🗑️', '📦',
            '📋', '✅', '📅', '⏰', '🎯', '💼'
        ];

        const [showPicker, setShowPicker] = React.useState(false);

        return h('div', { className: "relative" },
            h('button', {
                type: "button",
                onClick: () => setShowPicker(!showPicker),
                className: "w-full p-2 border rounded-md flex items-center justify-between"
            },
                h('span', { className: "text-2xl" }, value || '📋'),
                h('span', { className: "text-gray-400" }, "▼")
            ),

            showPicker && h('div', {
                className: "absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg p-2"
            },
                h('div', { className: "grid grid-cols-6 gap-2" },
                    icons.map(icon =>
                        h('button', {
                            key: icon,
                            type: "button",
                            onClick: () => {
                                onChange(icon);
                                setShowPicker(false);
                            },
                            className: `p-2 hover:bg-gray-100 rounded cursor-pointer text-2xl ${
                                icon === value ? 'bg-blue-100' : ''
                            }`
                        }, icon)
                    )
                )
            )
        );
    };

    /**
     * Week day picker component
     */
    const WeekDayPicker = ({ selectedDays, onChange }) => {
        const days = [
            { key: 'mon', label: 'Ma' },
            { key: 'tue', label: 'Di' },
            { key: 'wed', label: 'Wo' },
            { key: 'thu', label: 'Do' },
            { key: 'fri', label: 'Vr' },
            { key: 'sat', label: 'Za' },
            { key: 'sun', label: 'Zo' }
        ];

        return h('div', { className: "flex gap-2" },
            days.map(day =>
                h('label', {
                    key: day.key,
                    className: `cursor-pointer ${
                        selectedDays[day.key] ? 'text-blue-600' : 'text-gray-600'
                    }`
                },
                    h('input', {
                        type: "checkbox",
                        checked: selectedDays[day.key] || false,
                        onChange: (e) => onChange(day.key, e.target.checked),
                        className: "sr-only"
                    }),
                    h('span', {
                        className: `w-10 h-10 flex items-center justify-center rounded-full border-2 ${
                            selectedDays[day.key] 
                                ? 'bg-blue-500 text-white border-blue-500' 
                                : 'border-gray-300 hover:border-gray-400'
                        }`
                    }, day.label)
                )
            )
        );
    };

    /**
     * Month day picker component
     */
    const MonthDayPicker = ({ selectedDays, onChange, maxDays = 31 }) => {
        const days = Array.from({ length: maxDays }, (_, i) => i + 1);

        return h('div', { className: "grid grid-cols-7 gap-2" },
            days.map(day =>
                h('label', {
                    key: day,
                    className: `cursor-pointer ${selectedDays[day] ? 'text-blue-600' : 'text-gray-600'}`
                },
                    h('input', {
                        type: "checkbox",
                        checked: selectedDays[day] || false,
                        onChange: (e) => onChange(day, e.target.checked),
                        className: "sr-only"
                    }),
                    h('span', {
                        className: `w-10 h-10 flex items-center justify-center rounded border-2 ${
                            selectedDays[day]
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-gray-300 hover:border-gray-400'
                        }`
                    }, day)
                )
            )
        );
    };

    /**
     * Main TaskForm component
     */
    const TaskForm = function({ onSubmit, onDelete, onCancel, onResetCompletion, initialData = null, assignees = [] }) {
        const isEditing = !!initialData;

        // Filter out "Wie kan" from assignee options
        const assigneeOptions = assignees.length > 0
            ? assignees.map(a => a.name)
            : ["Laura", "Martijn", "Wie kan"];

        // Add default options if none from server
        if (assigneeOptions.length === 0) {
            assigneeOptions.push("Laura", "Martijn", "Samen");
        }

        const [formData, setFormData] = React.useState({
            chore_id: '',
            name: '',
            frequency_type: 'Weekly',
            frequency_days: 7,
            frequency_times: 1,
            assigned_to: 'Laura',
            priority: 'Middel',
            duration: 15,
            icon: '📋',
            description: '',
            use_alternating: false,
            alternate_with: 'Martijn',
            selected_weekdays: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false },
            selected_monthdays: {},
            specific_date: { month: 0, day: 1 },
            has_subtasks: false,
            subtasks: [],
            ...(initialData || {})
        });

        const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
        const [showResetConfirm, setShowResetConfirm] = React.useState(false);

        // Initialize selected days from existing data when editing
        React.useEffect(() => {
            if (isEditing && initialData) {
                const newFormData = { ...formData, ...initialData };
                
                // Convert old frequency types to new simplified system
                if (initialData.frequency_type === 'Wekelijks' && initialData.weekday >= 0) {
                    const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                    newFormData.frequency_type = 'Weekly';
                    newFormData.selected_weekdays = {};
                    dayNames.forEach(day => newFormData.selected_weekdays[day] = false);
                    if (initialData.weekday >= 0 && initialData.weekday < 7) {
                        newFormData.selected_weekdays[dayNames[initialData.weekday]] = true;
                    }
                }

                setFormData(newFormData);
            }
        }, []);

        const handleSubmit = (e) => {
            e.preventDefault();
            
            // Prepare submission data
            const submissionData = { ...formData };
            
            // Convert frequency type to backend format
            if (formData.frequency_type === 'Weekly') {
                submissionData.frequency_type = 'Wekelijks';
                // Find first selected weekday
                const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                const selectedIndex = dayNames.findIndex(day => formData.selected_weekdays[day]);
                submissionData.weekday = selectedIndex >= 0 ? selectedIndex : -1;
            }

            // Clean up subtasks
            if (submissionData.has_subtasks && submissionData.subtasks) {
                submissionData.subtasks = submissionData.subtasks
                    .filter(st => st && st.name && st.name.trim())
                    .map(st => ({
                        name: st.name.trim(),
                        completed: st.completed || false
                    }));
            }

            onSubmit(submissionData);
        };

        const confirmDelete = () => {
            setShowDeleteConfirm(false);
            onDelete(formData.chore_id);
        };

        const confirmReset = () => {
            setShowResetConfirm(false);
            onResetCompletion(formData.chore_id);
        };

        const handleFrequencyChange = (newType) => {
            const updates = { frequency_type: newType };
            
            // Set default frequency days based on type
            switch(newType) {
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
                case 'Quarterly':
                    updates.frequency_days = 90;
                    break;
                case 'Yearly':
                    updates.frequency_days = 365;
                    break;
                case 'Custom':
                    // Keep existing value
                    break;
            }
            
            setFormData({ ...formData, ...updates });
        };

        return h('div', { className: "bg-white rounded-lg p-6 shadow-lg max-w-2xl mx-auto" },
            h('h2', { className: "text-xl font-bold mb-4" }, isEditing ? "Taak bewerken" : "Nieuwe taak"),

            h('form', { onSubmit: handleSubmit, className: "space-y-4" },
                // Basic info row
                h('div', { className: "grid grid-cols-3 gap-4" },
                    // Name
                    h('div', { className: "col-span-2" },
                        h('label', { className: "block text-sm font-medium mb-1" }, "Naam"),
                        h('input', {
                            type: "text",
                            value: formData.name,
                            onChange: (e) => setFormData({ ...formData, name: e.target.value }),
                            className: "w-full p-2 border rounded-md",
                            required: true
                        })
                    ),

                    // Icon
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Icoon"),
                        h(IconSelector, {
                            value: formData.icon,
                            onChange: (icon) => setFormData({ ...formData, icon })
                        })
                    )
                ),

                // Frequency section
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Frequentie"),
                    h('select', {
                        value: formData.frequency_type,
                        onChange: (e) => handleFrequencyChange(e.target.value),
                        className: "w-full p-2 border rounded-md"
                    },
                        h('option', { value: "Daily" }, "Dagelijks"),
                        h('option', { value: "Weekly" }, "Wekelijks"),
                        h('option', { value: "BiWeekly" }, "Tweewekelijks"),
                        h('option', { value: "Monthly" }, "Maandelijks"),
                        h('option', { value: "Quarterly" }, "Per kwartaal"),
                        h('option', { value: "Yearly" }, "Jaarlijks"),
                        h('option', { value: "Custom" }, "Aangepast")
                    )
                ),

                // Custom frequency days
                formData.frequency_type === 'Custom' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Aantal dagen"),
                    h('input', {
                        type: "number",
                        value: formData.frequency_days,
                        onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) || 1 }),
                        className: "w-full p-2 border rounded-md",
                        min: 1,
                        max: 365
                    })
                ),

                // Assignment section
                h('div', { className: "grid grid-cols-2 gap-4" },
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Toegewezen aan"),
                        h('select', {
                            value: formData.assigned_to,
                            onChange: (e) => setFormData({ ...formData, assigned_to: e.target.value }),
                            className: "w-full p-2 border rounded-md"
                        },
                            assigneeOptions.map(name =>
                                h('option', { key: name, value: name }, name)
                            )
                        )
                    ),

                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Prioriteit"),
                        h('select', {
                            value: formData.priority,
                            onChange: (e) => setFormData({ ...formData, priority: e.target.value }),
                            className: "w-full p-2 border rounded-md"
                        },
                            h('option', { value: "Laag" }, "Laag"),
                            h('option', { value: "Middel" }, "Middel"),
                            h('option', { value: "Hoog" }, "Hoog")
                        )
                    )
                ),

                // Duration
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Geschatte duur (minuten)"),
                    h('input', {
                        type: "number",
                        value: formData.duration,
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 15 }),
                        className: "w-full p-2 border rounded-md",
                        min: 1,
                        max: 480
                    })
                ),

                // Description
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Beschrijving"),
                    h('textarea', {
                        value: formData.description,
                        onChange: (e) => setFormData({ ...formData, description: e.target.value }),
                        className: "w-full p-2 border rounded-md",
                        rows: 3
                    })
                ),

                // Subtasks section
                h('div', null,
                    h('label', { className: "flex items-center mb-2" },
                        h('input', {
                            type: "checkbox",
                            checked: formData.has_subtasks,
                            onChange: (e) => setFormData({
                                ...formData,
                                has_subtasks: e.target.checked,
                                subtasks: e.target.checked ? 
                                    (formData.subtasks && formData.subtasks.length > 0 ? formData.subtasks : [{ name: "", completed: false }]) : []
                            }),
                            className: "mr-2"
                        }),
                        h('span', { className: "text-sm font-medium" }, "Deze taak heeft subtaken")
                    ),

                    formData.has_subtasks && h('div', null,
                        h('label', { className: "block text-sm font-medium mb-2" }, "Subtaken:"),
                        h('div', { className: "space-y-2 mb-3" },
                            (formData.subtasks || []).map((subtask, index) =>
                                h('div', { key: index, className: "flex items-center" },
                                    h('input', {
                                        type: "text",
                                        value: (subtask && subtask.name) || '',
                                        placeholder: "Naam van subtaak",
                                        onChange: e => {
                                            const newSubtasks = [...(formData.subtasks || [])];
                                            if (!newSubtasks[index]) {
                                                newSubtasks[index] = { name: '', completed: false };
                                            }
                                            newSubtasks[index].name = e.target.value;
                                            setFormData({ ...formData, subtasks: newSubtasks });
                                        },
                                        className: "flex-1 p-2 border rounded-md"
                                    }),
                                    index > 0 && h('button', {
                                        type: "button",
                                        onClick: () => {
                                            const newSubtasks = [...(formData.subtasks || [])];
                                            newSubtasks.splice(index, 1);
                                            setFormData({ ...formData, subtasks: newSubtasks });
                                        },
                                        className: "ml-2 p-2 text-red-500 hover:bg-red-100 rounded-full"
                                    }, "×")
                                )
                            )
                        ),

                        h('button', {
                            type: "button",
                            onClick: () => {
                                setFormData({
                                    ...formData,
                                    subtasks: [...(formData.subtasks || []), { name: "", completed: false }]
                                });
                            },
                            className: "px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        }, "+ Subtaak toevoegen")
                    )
                ),

                // Action buttons
                h('div', { className: "flex justify-between mt-6" },
                    h('div', { className: "space-x-2" },
                        isEditing && h('button', {
                            type: "button",
                            onClick: () => setShowDeleteConfirm(true),
                            className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        }, "Verwijderen"),

                        isEditing && formData.last_done && h('button', {
                            type: "button",
                            onClick: () => setShowResetConfirm(true),
                            className: "px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        }, "Reset voltooiing")
                    ),

                    h('div', { className: "space-x-2" },
                        h('button', {
                            type: "button",
                            onClick: onCancel,
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren"),

                        h('button', {
                            type: "submit",
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, isEditing ? "Opslaan" : "Toevoegen")
                    )
                )
            ),

            // Confirmation dialogs
            h(window.choreComponents.ConfirmDialog, {
                isOpen: showDeleteConfirm,
                title: "Taak verwijderen",
                message: `Weet je zeker dat je "${formData.name}" wilt verwijderen?`,
                onConfirm: confirmDelete,
                onCancel: () => setShowDeleteConfirm(false)
            }),

            h(window.choreComponents.ConfirmDialog, {
                isOpen: showResetConfirm,
                title: "Voltooiing ongedaan maken",
                message: `Weet je zeker dat je de laatste voltooiing van "${formData.name}" wilt ongedaan maken?`,
                onConfirm: confirmReset,
                onCancel: () => setShowResetConfirm(false)
            })
        );
    };

    /**
     * UserManagement component - FIXED VERSION
     */
    const UserManagement = function({ users = [], onSave, onClose }) {
        const [editingUser, setEditingUser] = React.useState(null);
        const [newUser, setNewUser] = React.useState({ name: '', color: '#CCCCCC' });
        const [localUsers, setLocalUsers] = React.useState(users);

        // Update local users when props change
        React.useEffect(() => {
            setLocalUsers(users);
        }, [users]);

        const isDefaultUser = (name) => {
            return ['Laura', 'Martijn', 'Samen', 'Wie kan'].includes(name);
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!newUser.name.trim()) return;

            try {
                // Add user via API
                const api = window.ChoresAPI;
                if (api && api.UsersAPI) {
                    await api.UsersAPI.add(newUser.name.trim(), newUser.color);
                    
                    // Update local state
                    const updatedUsers = [...localUsers, { name: newUser.name.trim(), color: newUser.color }];
                    setLocalUsers(updatedUsers);
                    
                    // Call parent's onSave to trigger data reload
                    if (onSave) {
                        await onSave(updatedUsers);
                    }
                    
                    // Reset form
                    setNewUser({ name: '', color: '#CCCCCC' });
                }
            } catch (error) {
                console.error('Failed to add user:', error);
                alert('Fout bij toevoegen gebruiker: ' + error.message);
            }
        };

        const handleDelete = async (name) => {
            if (isDefaultUser(name)) return;
            
            if (confirm(`Weet je zeker dat je "${name}" wilt verwijderen?`)) {
                try {
                    const api = window.ChoresAPI;
                    if (api && api.UsersAPI) {
                        await api.UsersAPI.delete(name);
                        
                        // Update local state
                        const updatedUsers = localUsers.filter(u => u.name !== name);
                        setLocalUsers(updatedUsers);
                        
                        // Call parent's onSave to trigger data reload
                        if (onSave) {
                            await onSave(updatedUsers);
                        }
                    }
                } catch (error) {
                    console.error('Failed to delete user:', error);
                    alert('Fout bij verwijderen gebruiker: ' + error.message);
                }
            }
        };

        const handleColorSave = async () => {
            if (!editingUser) return;
            
            try {
                const api = window.ChoresAPI;
                if (api && api.UsersAPI) {
                    // API doesn't have update method, so we need to delete and re-add
                    await api.UsersAPI.delete(editingUser.name);
                    await api.UsersAPI.add(editingUser.name, editingUser.color);
                    
                    // Update local state
                    const updatedUsers = localUsers.map(u => 
                        u.name === editingUser.name ? editingUser : u
                    );
                    setLocalUsers(updatedUsers);
                    
                    // Call parent's onSave to trigger data reload
                    if (onSave) {
                        await onSave(updatedUsers);
                    }
                    
                    setEditingUser(null);
                }
            } catch (error) {
                console.error('Failed to update user color:', error);
                alert('Fout bij bijwerken kleur: ' + error.message);
            }
        };

        return h('div', { className: "bg-white rounded-lg p-6 shadow-lg max-w-md mx-auto" },
            h('h2', { className: "text-xl font-bold mb-4" }, "Gebruikers beheren"),
            
            h('div', { className: "space-y-4" },
                h('div', { className: "space-y-2" },
                    localUsers.map(user =>
                        h('div', {
                            key: user.name,
                            className: "flex items-center justify-between p-2 border rounded"
                        },
                            h('div', { className: "flex items-center space-x-3" },
                                h('div', {
                                    className: "w-8 h-8 rounded-full border-2",
                                    style: { 
                                        backgroundColor: `${user.color}30`,
                                        borderColor: user.color
                                    }
                                }),
                                h('span', { className: "font-medium" }, user.name),
                                isDefaultUser(user.name) && h('span', { 
                                    className: "text-xs text-gray-500" 
                                }, "(standaard)")
                            ),
                            h('div', { className: "flex space-x-2" },
                                h('button', {
                                    onClick: () => setEditingUser(user),
                                    className: "px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                }, "Kleur"),
                                !isDefaultUser(user.name) && h('button', {
                                    onClick: () => handleDelete(user.name),
                                    className: "px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                                }, "Verwijderen")
                            )
                        )
                    )
                ),

                h('h3', { className: "text-lg font-medium mb-2 mt-6" }, "Nieuwe gebruiker toevoegen"),
                h('form', {
                    onSubmit: handleSubmit,
                    className: "space-y-4"
                },
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Naam"),
                        h('input', {
                            type: "text",
                            className: "w-full p-2 border rounded",
                            value: newUser.name,
                            onChange: (e) => setNewUser({ ...newUser, name: e.target.value }),
                            required: true
                        })
                    ),
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Kleur"),
                        h('input', {
                            type: "color",
                            className: "p-1 border rounded w-20 h-10",
                            value: newUser.color,
                            onChange: (e) => setNewUser({ ...newUser, color: e.target.value })
                        })
                    ),
                    h('div', { className: "flex justify-end" },
                        h('button', {
                            type: "submit",
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, "Toevoegen")
                    )
                )
            ),

            // Edit color dialog
            editingUser && h('div', {
                className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",
                onClick: () => setEditingUser(null)
            },
                h('div', {
                    className: "bg-white rounded-lg p-6 max-w-sm mx-auto",
                    onClick: (e) => e.stopPropagation()
                },
                    h('h3', { className: "text-lg font-medium mb-4" }, `Kleur wijzigen voor ${editingUser.name}`),
                    h('input', {
                        type: "color",
                        className: "w-full h-20 mb-4",
                        value: editingUser.color,
                        onChange: (e) => setEditingUser({ ...editingUser, color: e.target.value })
                    }),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            onClick: () => setEditingUser(null),
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren"),
                        h('button', {
                            onClick: handleColorSave,
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, "Opslaan")
                    )
                )
            ),
            
            // Close button at bottom
            h('div', { className: "flex justify-end mt-4" },
                h('button', {
                    onClick: onClose,
                    className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                }, "Sluiten")
            )
        );
    };

    // Export components
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