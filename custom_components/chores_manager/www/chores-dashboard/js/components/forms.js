/**
 * Form components for the Chores Manager
 * Includes TaskForm, UserForm, and form-related utilities
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React || !window.choreUtils) {
        console.error('Form components require React and choreUtils');
        return;
    }

    const h = React.createElement;

    /**
     * Icon selector component
     */
    const IconSelector = ({ value, onChange }) => {
        const [showPicker, setShowPicker] = React.useState(false);
        const icons = ['📋', '🧹', '🍽️', '🧺', '🛁', '🚿', '🪟', '🗑️', '📦', '🧽', '🧴', '🪣'];

        return h('div', { className: "relative" },
            h('button', {
                type: "button",
                className: "px-3 py-2 border rounded flex items-center justify-center text-2xl hover:bg-gray-50",
                onClick: () => setShowPicker(!showPicker)
            }, value || '📋'),

            showPicker && h('div', {
                className: "absolute z-10 mt-1 p-2 bg-white border rounded shadow-lg grid grid-cols-4 gap-2"
            },
                icons.map(icon =>
                    h('button', {
                        key: icon,
                        type: "button",
                        className: "p-2 hover:bg-gray-100 rounded text-2xl",
                        onClick: () => {
                            onChange(icon);
                            setShowPicker(false);
                        }
                    }, icon)
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

        return h('div', { className: "flex space-x-2" },
            days.map(day =>
                h('label', {
                    key: day.key,
                    className: `flex flex-col items-center cursor-pointer ${
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
                    h('label', { className: "block text-sm font-medium mb-1" }, "Om de hoeveel dagen"),
                    h('input', {
                        type: "number",
                        min: "1",
                        value: formData.frequency_days,
                        onChange: (e) => setFormData({ ...formData, frequency_days: parseInt(e.target.value) || 1 }),
                        className: "w-full p-2 border rounded-md"
                    })
                ),

                // Weekday selection for weekly tasks
                formData.frequency_type === 'Weekly' && h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Selecteer dag(en)"),
                    h(WeekDayPicker, {
                        selectedDays: formData.selected_weekdays,
                        onChange: (day, checked) => setFormData({
                            ...formData,
                            selected_weekdays: { ...formData.selected_weekdays, [day]: checked }
                        })
                    })
                ),

                // Assignment and priority row
                h('div', { className: "grid grid-cols-2 gap-4" },
                    // Assigned to
                    h('div', null,
                        h('label', { className: "block text-sm font-medium mb-1" }, "Toegewezen aan"),
                        h('select', {
                            value: formData.assigned_to,
                            onChange: (e) => setFormData({ ...formData, assigned_to: e.target.value }),
                            className: "w-full p-2 border rounded-md"
                        },
                            assigneeOptions.map(assignee =>
                                h('option', { key: assignee, value: assignee }, assignee)
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

                // Duration
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Geschatte duur (minuten)"),
                    h('input', {
                        type: "number",
                        min: "1",
                        value: formData.duration,
                        onChange: (e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 15 }),
                        className: "w-full p-2 border rounded-md"
                    })
                ),

                // Alternating assignment
                formData.assigned_to !== "Samen" && assigneeOptions.length > 1 && h('div', null,
                    h('label', { className: "flex items-center" },
                        h('input', {
                            type: "checkbox",
                            checked: formData.use_alternating || false,
                            onChange: (e) => setFormData({ ...formData, use_alternating: e.target.checked }),
                            className: "mr-2"
                        }),
                        h('span', { className: "text-sm font-medium" }, "Wissel toewijzing af met andere gebruiker")
                    ),

                    formData.use_alternating && h('div', { className: "mt-2" },
                        h('label', { className: "block text-sm font-medium mb-1" }, "Afwisselen met"),
                        h('select', {
                            value: formData.alternate_with,
                            onChange: (e) => setFormData({ ...formData, alternate_with: e.target.value }),
                            className: "w-full p-2 border rounded-md"
                        },
                            assigneeOptions
                                .filter(a => a !== formData.assigned_to && a !== "Wie kan")
                                .map(assignee =>
                                    h('option', { key: assignee, value: assignee }, assignee)
                                )
                        )
                    )
                ),

                // Description
                h('div', null,
                    h('label', { className: "block text-sm font-medium mb-1" }, "Beschrijving (optioneel)"),
                    h('textarea', {
                        value: formData.description || '',
                        onChange: (e) => setFormData({ ...formData, description: e.target.value }),
                        className: "w-full p-2 border rounded-md",
                        rows: 3,
                        placeholder: "Voeg instructies of details toe..."
                    })
                ),

                // Subtasks
                h('div', null,
                    h('label', { className: "flex items-center mb-3" },
                        h('input', {
                            type: "checkbox",
                            checked: formData.has_subtasks || false,
                            onChange: (e) => setFormData({
                                ...formData,
                                has_subtasks: e.target.checked,
                                subtasks: e.target.checked ? (formData.subtasks || [{ name: "", completed: false }]) : []
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
     * UserManagement component
     */
    const UserManagement = function({ users = [], onSave, onClose }) {
        const [editingUser, setEditingUser] = React.useState(null);
        const [newUser, setNewUser] = React.useState({ name: '', color: '#CCCCCC' });

        const isDefaultUser = (name) => {
            return ['Laura', 'Martijn', 'Samen', 'Wie kan'].includes(name);
        };

        const handleSubmit = (e) => {
            e.preventDefault();
            if (newUser.name.trim()) {
                onSave({ ...newUser, id: Date.now().toString() });
                setNewUser({ name: '', color: '#CCCCCC' });
            }
        };

        const handleEditClick = (user) => {
            setEditingUser(user);
        };

        const handleDeleteClick = (user) => {
            if (!isDefaultUser(user.name) && confirm(`Weet je zeker dat je ${user.name} wilt verwijderen?`)) {
                onSave(user, 'delete');
            }
        };

        const handleColorUpdate = (user, newColor) => {
            onSave({ ...user, color: newColor }, 'update');
            setEditingUser(null);
        };

        return h('div', { className: "bg-white rounded-lg p-6 shadow-lg max-w-md mx-auto" },
            h('div', { className: "flex justify-between items-center mb-4" },
                h('h2', { className: "text-xl font-bold" }, "Gebruikers beheren"),
                h('button', {
                    onClick: onClose,
                    className: "text-gray-400 hover:text-gray-600"
                }, "✕")
            ),

            h('div', { className: "space-y-4" },
                h('h3', { className: "text-lg font-medium mb-2" }, "Huidige gebruikers"),
                h('div', { className: "border rounded divide-y" },
                    users.map(user =>
                        h('div', {
                            key: user.id || user.name,
                            className: "flex items-center justify-between p-3"
                        },
                            h('div', { className: "flex items-center" },
                                h('div', {
                                    className: "w-4 h-4 rounded-full mr-3",
                                    style: { backgroundColor: user.color }
                                }),
                                h('span', null, user.name)
                            ),
                            h('div', { className: "flex space-x-2" },
                                h('button', {
                                    onClick: () => handleEditClick(user),
                                    className: "text-blue-500 hover:text-blue-700"
                                }, "Bewerken"),
                                h('button', {
                                    onClick: () => handleDeleteClick(user),
                                    className: "text-red-500 hover:text-red-700",
                                    disabled: isDefaultUser(user.name)
                                }, isDefaultUser(user.name) ? "Standaard" : "Verwijderen")
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
                        value: editingUser.color || '#CCCCCC',
                        onChange: (e) => handleColorUpdate(editingUser, e.target.value),
                        className: "w-full h-12 cursor-pointer"
                    }),
                    h('div', { className: "flex justify-end mt-4 space-x-2" },
                        h('button', {
                            onClick: () => setEditingUser(null),
                            className: "px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        }, "Annuleren")
                    )
                )
            )
        );
    };

    // Export components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        IconSelector,
        WeekDayPicker,
        MonthDayPicker,
        TaskForm,
        UserManagement
    });

    console.log('Form components loaded successfully');
})();