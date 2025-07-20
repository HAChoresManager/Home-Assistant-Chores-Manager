/**
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
    const { useState, useEffect } = React;

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

        const [showPicker, setShowPicker] = useState(false);

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
    const WeekDayPicker = ({ value = [], onChange }) => {
        const days = [
            { value: 0, label: 'Ma', fullLabel: 'Maandag' },
            { value: 1, label: 'Di', fullLabel: 'Dinsdag' },
            { value: 2, label: 'Wo', fullLabel: 'Woensdag' },
            { value: 3, label: 'Do', fullLabel: 'Donderdag' },
            { value: 4, label: 'Vr', fullLabel: 'Vrijdag' },
            { value: 5, label: 'Za', fullLabel: 'Zaterdag' },
            { value: 6, label: 'Zo', fullLabel: 'Zondag' }
        ];

        const handleToggleDay = (dayValue) => {
            const newValue = value.includes(dayValue)
                ? value.filter(d => d !== dayValue)
                : [...value, dayValue];
            onChange(newValue);
        };

        return h('div', { className: "grid grid-cols-7 gap-2" },
            days.map(day =>
                h('button', {
                    key: day.value,
                    type: "button",
                    onClick: () => handleToggleDay(day.value),
                    className: `p-2 rounded border ${
                        value.includes(day.value)
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`,
                    title: day.fullLabel
                }, day.label)
            )
        );
    };

    /**
     * Month day picker component
     */
    const MonthDayPicker = ({ value = [], onChange }) => {
        const handleToggleDay = (day) => {
            const newValue = value.includes(day)
                ? value.filter(d => d !== day)
                : [...value, day];
            onChange(newValue);
        };

        const dayRows = [];
        for (let week = 0; week < 5; week++) {
            const weekDays = [];
            for (let day = 0; day < 7; day++) {
                const dayNumber = week * 7 + day + 1;
                if (dayNumber <= 31) {
                    weekDays.push(dayNumber);
                }
            }
            dayRows.push(weekDays);
        }

        return h('div', { className: "space-y-2" },
            dayRows.map((week, weekIndex) =>
                h('div', { key: weekIndex, className: "grid grid-cols-7 gap-2" },
                    week.map(day =>
                        h('button', {
                            key: day,
                            type: "button",
                            onClick: () => handleToggleDay(day),
                            className: `p-2 rounded border text-sm ${
                                value.includes(day)
                                    ? 'bg-blue-500 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`
                        }, day)
                    )
                )
            )
        );
    };

    /**
     * Task form component
     */
    const TaskForm = ({ task, users, onSave, onDelete, onClose, onResetCompletion }) => {
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

        const [formData, setFormData] = useState(task ? {
            ...defaultFormData,
            ...task,
            frequency_days: task.frequency || task.frequency_days || 7,
            selected_weekdays: task.selected_weekdays || [],
            active_monthdays: task.active_monthdays || []
        } : defaultFormData);

        const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
                task ? "Taak bewerken" : "Nieuwe taak"),

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
                        h('option', { value: "Custom" }, "Aangepast")
                    )
                ),

                // Custom frequency options
                formData.frequency_type === 'Custom' && h('div', { className: "ml-4 space-y-3" },
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Elke ... dagen"),
                        h('input', {
                            type: "number",
                            value: formData.frequency_days,
                            onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) || 1 }),
                            className: "w-full p-2 border rounded-md",
                            min: 1,
                            max: 365
                        })
                    )
                ),

                // Weekly frequency - specific days
                formData.frequency_type === 'Weekly' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Op welke dagen?"),
                    h(WeekDayPicker, {
                        value: formData.selected_weekdays,
                        onChange: (days) => setFormData({ ...formData, selected_weekdays: days })
                    })
                ),

                // Monthly frequency - specific days
                formData.frequency_type === 'Monthly' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Op welke dagen van de maand?"),
                    h(MonthDayPicker, {
                        value: formData.active_monthdays,
                        onChange: (days) => setFormData({ ...formData, active_monthdays: days })
                    })
                ),

                // Assignment row
                h('div', { className: "grid grid-cols-2 gap-4" },
                    // Assigned to
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Toegewezen aan"),
                        h('select', {
                            value: formData.assigned_to,
                            onChange: (e) => setFormData({ ...formData, assigned_to: e.target.value }),
                            className: "w-full p-2 border rounded-md"
                        },
                            h('option', { value: "Wie kan" }, "Wie kan"),
                            h('option', { value: "Allemaal" }, "Allemaal"),
                            h('option', { value: "Afwisselend" }, "Afwisselend"),
                            users.map(user =>
                                h('option', { key: user.name, value: user.name }, user.name)
                            )
                        )
                    ),

                    // Priority
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

                // Alternating assignment
                formData.assigned_to === 'Afwisselend' && h('div', null,
                    h('label', { className: "flex items-center space-x-2" },
                        h('input', {
                            type: "checkbox",
                            checked: formData.use_alternating,
                            onChange: (e) => setFormData({ ...formData, use_alternating: e.target.checked }),
                            className: "rounded"
                        }),
                        h('span', { className: "text-sm" }, "Afwisselen met andere gebruiker")
                    ),
                    formData.use_alternating && h('select', {
                        value: formData.alternate_with,
                        onChange: (e) => setFormData({ ...formData, alternate_with: e.target.value }),
                        className: "w-full mt-2 p-2 border rounded-md"
                    },
                        h('option', { value: "" }, "Selecteer gebruiker"),
                        users.filter(u => u.name !== formData.assigned_to).map(user =>
                            h('option', { key: user.name, value: user.name }, user.name)
                        )
                    )
                ),

                // Duration
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, 
                        `Geschatte duur: ${formData.duration} minuten`),
                    h('input', {
                        type: "range",
                        value: formData.duration,
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) }),
                        className: "w-full",
                        min: 5,
                        max: 120,
                        step: 5
                    })
                ),

                // Description
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Beschrijving (optioneel)"),
                    h('textarea', {
                        value: formData.description,
                        onChange: (e) => setFormData({ ...formData, description: e.target.value }),
                        className: "w-full p-2 border rounded-md",
                        rows: 3
                    })
                ),

                // Actions
                h('div', { className: "flex justify-between pt-4" },
                    h('div', { className: "space-x-2" },
                        task && h('button', {
                            type: "button",
                            onClick: handleDelete,
                            className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        }, "Verwijderen"),
                        task && task.last_done && h('button', {
                            type: "button",
                            onClick: () => onResetCompletion(task.chore_id || task.id),
                            className: "px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        }, "Reset voltooiing")
                    ),
                    h('div', { className: "space-x-2" },
                        h('button', {
                            type: "button",
                            onClick: onClose,
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren"),
                        h('button', {
                            type: "submit",
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, task ? "Opslaan" : "Toevoegen")
                    )
                )
            ),

            // Delete confirmation dialog
            showDeleteConfirm && h('div', {
                className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            },
                h('div', { className: "bg-white rounded-lg p-6 max-w-sm" },
                    h('h3', { className: "text-lg font-semibold mb-4" }, "Taak verwijderen?"),
                    h('p', { className: "mb-6" }, 
                        `Weet je zeker dat je "${formData.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            onClick: () => setShowDeleteConfirm(false),
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren"),
                        h('button', {
                            onClick: confirmDelete,
                            className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        }, "Verwijderen")
                    )
                )
            )
        );
    };

    /**
     * User management component
     */
    const UserManagement = ({ users, onSave, onClose }) => {
        const [localUsers, setLocalUsers] = useState(users || []);
        const [newUserName, setNewUserName] = useState('');
        const [newUserColor, setNewUserColor] = useState('#3B82F6');
        const [editingUser, setEditingUser] = useState(null);

        const isDefaultUser = (name) => {
            return ['Wie kan', 'Allemaal', 'Afwisselend'].includes(name);
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            
            if (!newUserName.trim()) return;
            
            // Check if user already exists
            if (localUsers.some(u => u.name === newUserName)) {
                alert('Deze gebruiker bestaat al!');
                return;
            }

            try {
                // Call the ChoresAPI to add the user
                if (window.ChoresAPI && window.ChoresAPI.users) {
                    await window.ChoresAPI.users.addUser(
                        newUserName, 
                        newUserName,
                        newUserColor
                    );
                    
                    // Update local state
                    setLocalUsers([...localUsers, { 
                        name: newUserName, 
                        color: newUserColor 
                    }]);
                    
                    // Clear form
                    setNewUserName('');
                    setNewUserColor('#3B82F6');
                    
                    // Notify parent
                    onSave([...localUsers, { 
                        name: newUserName, 
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
                // Call the ChoresAPI to update the user
                if (window.ChoresAPI && window.ChoresAPI.users) {
                    await window.ChoresAPI.users.addUser(
                        user.name,
                        user.name,
                        user.color
                    );
                    
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
                        value: newUserName,
                        onChange: (e) => setNewUserName(e.target.value),
                        className: "w-full p-2 border rounded-md",
                        placeholder: "Voer naam in",
                        required: true
                    })
                ),
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Kleur"),
                    h('div', { className: "flex items-center space-x-2" },
                        h('input', {
                            type: "color",
                            value: newUserColor,
                            onChange: (e) => setNewUserColor(e.target.value),
                            className: "h-10 w-20"
                        }),
                        h('span', { className: "text-sm text-gray-500" }, newUserColor)
                    )
                ),
                h('button', {
                    type: "submit",
                    className: "w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                }, "Gebruiker toevoegen")
            ),

            h('div', { className: "flex justify-end space-x-2 mt-4" },
                h('button', {
                    onClick: onClose,
                    className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                }, "Sluiten")
            ),

            // Color edit dialog
            editingUser && h('div', {
                className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            },
                h('div', { className: "bg-white rounded-lg p-6 max-w-sm" },
                    h('h3', { className: "text-lg font-semibold mb-4" }, 
                        `Kleur wijzigen voor ${editingUser.name}`),
                    h('div', { className: "mb-6" },
                        h('input', {
                            type: "color",
                            value: editingUser.color || '#3B82F6',
                            onChange: (e) => setEditingUser({ 
                                ...editingUser, 
                                color: e.target.value 
                            }),
                            className: "h-20 w-full"
                        })
                    ),
                    h('div', { className: "flex justify-end space-x-2" },
                        h('button', {
                            onClick: () => setEditingUser(null),
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren"),
                        h('button', {
                            onClick: () => handleUpdateColor(editingUser),
                            className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        }, "Opslaan")
                    )
                )
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