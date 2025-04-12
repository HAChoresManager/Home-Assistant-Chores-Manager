// Wait for choreUtils to be available
(function() {
    // Check if choreUtils is ready
    const checkUtilsReady = () => {
        if (window.choreUtils) {
            initComponents();
        } else {
            setTimeout(checkUtilsReady, 50);
        }
    };

    // Initialize when ready
    checkUtilsReady();

    function initComponents() {
        // Custom Confirm Dialog component
        const ConfirmDialog = function({ title, message, onConfirm, onCancel, isOpen }) {
            if (!isOpen) return null;

            return React.createElement('div',
                { className: "modal-container" },
                React.createElement('div',
                    { className: "confirm-dialog bg-white p-4 rounded-lg shadow-lg max-w-md w-full mx-auto" },
                    React.createElement('h3', { className: "text-lg font-medium mb-2" }, title),
                    React.createElement('p', { className: "mb-4 text-gray-700" }, message),
                    React.createElement('div', { className: "flex justify-end space-x-2" },
                        React.createElement('button', {
                            onClick: onCancel,
                            className: "px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        }, "Annuleren"),
                        React.createElement('button', {
                            onClick: onConfirm,
                            className: "px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                        }, "Bevestigen")
                    )
                )
            );
        };

        // Completion Confirm Dialog with user selection
        const CompletionConfirmDialog = function({ title, message, onConfirm, onCancel, isOpen, assignees = [], defaultUser }) {
            if (!isOpen) return null;

            const [selectedUser, setSelectedUser] = React.useState(defaultUser || '');

            const handleConfirm = () => {
                if (!selectedUser) return;
                onConfirm(selectedUser);
            };

            // Filter out "Wie kan" from completion assignees
            const filteredAssignees = assignees.filter(user => user.name !== "Wie kan");

            return React.createElement('div',
                { className: "modal-container" },
                React.createElement('div',
                    { className: "confirm-dialog bg-white p-4 rounded-lg shadow-lg max-w-md w-full mx-auto" },
                    React.createElement('h3', { className: "text-lg font-medium mb-2" }, title),
                    React.createElement('p', { className: "mb-4 text-gray-700" }, message),
                    React.createElement('div', { className: "mb-4" },
                        React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Voltooid door:"),
                        React.createElement('select', {
                            className: "w-full p-2 border rounded",
                            value: selectedUser,
                            onChange: (e) => setSelectedUser(e.target.value)
                        },
                            React.createElement('option', { value: "" }, "-- Selecteer gebruiker --"),
                            filteredAssignees.map(user => 
                                React.createElement('option', { 
                                    key: user.id || user.name, 
                                    value: user.name 
                                }, user.name)
                            )
                        )
                    ),
                    React.createElement('div', { className: "flex justify-end space-x-2" },
                        React.createElement('button', {
                            onClick: onCancel,
                            className: "px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        }, "Annuleren"),
                        React.createElement('button', {
                            onClick: handleConfirm,
                            className: "px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700",
                            disabled: !selectedUser
                        }, "Voltooien")
                    )
                )
            );
        };

        // User Management Component
        const UserManagement = function({ users, onClose, onAddUser, onDeleteUser, onSaveTheme, currentTheme = {} }) {
            const [newUser, setNewUser] = React.useState({ name: '', color: '#CCCCCC' });
            const [showConfirmDelete, setShowConfirmDelete] = React.useState(false);
            const [userToDelete, setUserToDelete] = React.useState(null);
            const [editMode, setEditMode] = React.useState(false);
            const [editingUser, setEditingUser] = React.useState(null);
            const [activeTab, setActiveTab] = React.useState('users'); // 'users' or 'theme'
        
            const handleSubmit = (e) => {
                e.preventDefault();
                if (!newUser.name.trim()) return;
        
                const userId = newUser.name.toLowerCase().replace(/\s+/g, '_');
        
                onAddUser({
                    id: userId,
                    name: newUser.name.trim(),
                    color: newUser.color,
                    active: true
                });
        
                setNewUser({ name: '', color: '#CCCCCC' });
            };
        
            const handleEditClick = (user) => {
                setEditMode(true);
                setEditingUser({...user});
            };
        
            const handleSaveEdit = () => {
                if (!editingUser || !editingUser.name.trim()) return;
        
                onAddUser({
                    id: editingUser.id,
                    name: editingUser.name.trim(),
                    color: editingUser.color,
                    active: true
                });
        
                setEditMode(false);
                setEditingUser(null);
            };
        
            const handleDeleteClick = (user) => {
                setUserToDelete(user);
                setShowConfirmDelete(true);
            };
        
            const confirmDelete = () => {
                if (userToDelete) {
                    onDeleteUser(userToDelete.id);
                }
                setShowConfirmDelete(false);
                setUserToDelete(null);
            };
        
            const isDefaultUser = (name) => {
                return ["Laura", "Martijn", "Samen"].includes(name);
            };
        
            return React.createElement('div',
                { className: "modal-container" },
                React.createElement('div',
                    { className: "bg-white p-6 rounded-lg shadow-lg max-w-lg w-full mx-auto" },
        
                    // Header with tabs
                    React.createElement('div', { className: "flex justify-between items-center mb-4" },
                        React.createElement('div', { className: "flex space-x-4 user-tabs" },
                            React.createElement('button', {
                                className: `user-tab ${activeTab === 'users' ? 'active' : ''}`,
                                onClick: () => setActiveTab('users')
                            }, "Gebruikers"),
                            React.createElement('button', {
                                className: `user-tab ${activeTab === 'theme' ? 'active' : ''}`,
                                onClick: () => setActiveTab('theme')
                            }, "Thema")
                        ),
                        React.createElement('button', {
                            onClick: onClose,
                            className: "text-gray-400 hover:text-gray-600"
                        }, "✕")
                    ),
        
                    // Conditional content based on active tab
                    activeTab === 'users' ?
                        // Users tab content
                        React.createElement('div', null,
                            editMode && editingUser ?
                                // Edit user form
                                React.createElement('div', { className: "mb-6" },
                                    React.createElement('h3', { className: "text-lg font-medium mb-2" },
                                        "Bewerk gebruiker: " + editingUser.name
                                    ),
                                    React.createElement('form', { className: "space-y-4" },
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Naam"),
                                            React.createElement('input', {
                                                type: "text",
                                                className: "w-full p-2 border rounded",
                                                value: editingUser.name,
                                                onChange: (e) => setEditingUser({...editingUser, name: e.target.value}),
                                                disabled: isDefaultUser(editingUser.name),
                                                required: true
                                            }),
                                            isDefaultUser(editingUser.name) &&
                                                React.createElement('p', { className: "text-xs text-gray-500 mt-1" },
                                                    "Standaard gebruikers kunnen niet hernoemd worden"
                                                )
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Kleur"),
                                            React.createElement('input', {
                                                type: "color",
                                                className: "p-1 border rounded w-20 h-10",
                                                value: editingUser.color,
                                                onChange: (e) => setEditingUser({...editingUser, color: e.target.value})
                                            })
                                        ),
                                        React.createElement('div', { className: "flex justify-end space-x-2" },
                                            React.createElement('button', {
                                                type: "button",
                                                onClick: () => {
                                                    setEditMode(false);
                                                    setEditingUser(null);
                                                },
                                                className: "px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                            }, "Annuleren"),
                                            React.createElement('button', {
                                                type: "button",
                                                onClick: handleSaveEdit,
                                                className: "px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                                            }, "Opslaan")
                                        )
                                    )
                                )
                                :
                                // Users list
                                React.createElement('div', { className: "mb-6" },
                                    React.createElement('h3', { className: "text-lg font-medium mb-2" }, "Huidige gebruikers"),
                                    React.createElement('div', { className: "border rounded divide-y" },
                                        users.map(user =>
                                            React.createElement('div', {
                                                key: user.id || user.name,
                                                className: "flex items-center justify-between p-3"
                                            },
                                                React.createElement('div', { className: "flex items-center" },
                                                    React.createElement('div', {
                                                        className: "w-4 h-4 rounded-full mr-3",
                                                        style: { backgroundColor: user.color }
                                                    }),
                                                    React.createElement('span', null, user.name)
                                                ),
                                                React.createElement('div', { className: "flex space-x-2" },
                                                    React.createElement('button', {
                                                        onClick: () => handleEditClick(user),
                                                        className: "text-blue-500 hover:text-blue-700"
                                                    }, "Bewerken"),
                                                    React.createElement('button', {
                                                        onClick: () => handleDeleteClick(user),
                                                        className: "text-red-500 hover:text-red-700",
                                                        disabled: isDefaultUser(user.name)
                                                    }, isDefaultUser(user.name) ?
                                                        "Standaard" : "Verwijderen")
                                                )
                                            )
                                        )
                                    ),
        
                                    React.createElement('h3', { className: "text-lg font-medium mb-2 mt-6" }, "Nieuwe gebruiker toevoegen"),
                                    React.createElement('form', {
                                        onSubmit: handleSubmit,
                                        className: "space-y-4"
                                    },
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Naam"),
                                            React.createElement('input', {
                                                type: "text",
                                                className: "w-full p-2 border rounded",
                                                value: newUser.name,
                                                onChange: (e) => setNewUser({...newUser, name: e.target.value}),
                                                required: true
                                            })
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Kleur"),
                                            React.createElement('input', {
                                                type: "color",
                                                className: "p-1 border rounded w-20 h-10",
                                                value: newUser.color,
                                                onChange: (e) => setNewUser({...newUser, color: e.target.value})
                                            })
                                        ),
                                        React.createElement('div', { className: "flex justify-end" },
                                            React.createElement('button', {
                                                type: "submit",
                                                className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                            }, "Toevoegen")
                                        )
                                    )
                                )
                        )
                        :
                        // Theme tab content
                        React.createElement(ThemeSettings, {
                            onSave: onSaveTheme,
                            currentTheme: currentTheme
                        }),
        
                    // Confirmation dialog for deletion
                    showConfirmDelete && userToDelete && React.createElement(ConfirmDialog, {
                        isOpen: true,
                        title: "Gebruiker verwijderen",
                        message: `Weet je zeker dat je gebruiker "${userToDelete.name}" wilt verwijderen?`,
                        onConfirm: confirmDelete,
                        onCancel: () => {
                            setShowConfirmDelete(false);
                            setUserToDelete(null);
                        }
                    })
                )
            );
        };;

        // Priority indicator component
        const PriorityIndicator = function({ priority, small = false }) {
            const priorityColors = {
                'Hoog': '#EF4444',
                'Middel': '#F59E0B',
                'Laag': '#3B82F6'
            };

            const priorityIcons = {
                'Hoog': '!',
                'Middel': '•',
                'Laag': '·'
            };

            const color = priorityColors[priority] || '#6B7280';
            const icon = priorityIcons[priority] || '•';

            const sizeClass = small ? 'w-4 h-4 text-xs' : 'w-6 h-6 text-sm';

            return React.createElement('div', {
                className: `${sizeClass} rounded-full flex items-center justify-center font-bold`,
                style: {
                    backgroundColor: color,
                    color: 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                },
                title: `Prioriteit: ${priority}`
            }, icon);
        };

        const IconSelector = function({ selectedIcon, onSelectIcon }) {
            return React.createElement('div', null,
                React.createElement('label', { className: "block text-sm font-medium mb-2" }, "Pictogram"),
                React.createElement('div', { className: "icon-grid" },
                    Object.entries(window.choreUtils.availableIcons).map(([key, icon]) =>
                        React.createElement('div', {
                            key: key,
                            className: `icon-option ${selectedIcon === icon ? 'selected' : ''}`,
                            onClick: () => onSelectIcon(icon),
                            title: key
                        }, icon)
                    )
                )
            );
        };

        const TaskDescription = function({ description, choreId, onSave, onClose, inTaskCard = false }) {
            const [editMode, setEditMode] = React.useState(!description || description.trim() === '');
            const [newDescription, setNewDescription] = React.useState(description || '');

            const handleSave = () => {
                onSave(choreId, newDescription);
                setEditMode(false);
            };

            // Different styling if shown inline in task card
            const containerClass = inTaskCard
                ? "px-3 py-2 bg-white bg-opacity-60 rounded-md mt-2"
                : "px-4 py-3 bg-white rounded-lg shadow";

            const titleClass = inTaskCard
                ? "text-base font-medium mb-1"
                : "text-lg font-medium mb-2";

            const buttonClass = inTaskCard
                ? "text-xs px-2 py-1"
                : "px-3 py-1";

            if (editMode) {
                return React.createElement('div', { className: containerClass },
                    React.createElement('h3', { className: titleClass }, "Taakbeschrijving bewerken"),
                    React.createElement('textarea', {
                        className: "w-full p-2 border rounded-md h-32",
                        value: newDescription,
                        onChange: (e) => setNewDescription(e.target.value),
                        placeholder: "Voer een beschrijving of instructies voor deze taak in..."
                    }),
                    React.createElement('div', { className: "flex justify-end mt-3 space-x-2" },
                        React.createElement('button', {
                            className: `${buttonClass} bg-gray-200 text-gray-700 rounded hover:bg-gray-300`,
                            onClick: onClose
                        }, "Annuleren"),
                        React.createElement('button', {
                            className: `${buttonClass} bg-blue-500 text-white rounded hover:bg-blue-600`,
                            onClick: handleSave
                        }, "Opslaan")
                    )
                );
            }

            return React.createElement('div', { className: containerClass },
                React.createElement('div', { className: "flex justify-between items-center mb-2" },
                    React.createElement('h3', { className: titleClass }, "Taakbeschrijving"),
                    React.createElement('button', {
                        className: "text-blue-500 hover:text-blue-700 text-sm",
                        onClick: () => setEditMode(true)
                    }, "Bewerken")
                ),
                React.createElement('div', { className: "whitespace-pre-wrap text-gray-700 text-sm" },
                    description ? description : React.createElement('div', { className: "text-gray-400 italic" }, "Geen beschrijving")
                ),
                !inTaskCard && React.createElement('div', { className: "flex justify-end mt-3" },
                    React.createElement('button', {
                        className: `${buttonClass} bg-gray-200 text-gray-700 rounded hover:bg-gray-300`,
                        onClick: onClose
                    }, "Sluiten")
                )
            );
        };

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
                frequency_type: 'Wekelijks',
                frequency_days: 7,
                frequency_times: 1,
                assigned_to: 'Laura', // Default to Laura instead of "Wie kan"
                priority: 'Middel',
                duration: 15,
                icon: '📋',
                description: '',
                use_alternating: false,
                alternate_with: 'Martijn', // Default to Martijn for alternating
                weekday: -1,
                monthday: -1,
                startMonth: 0,
                startDay: 1,
                ...(initialData || {})
            });

            const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
            const [showResetConfirm, setShowResetConfirm] = React.useState(false);

            const handleSubmit = (e) => {
                e.preventDefault();

                // Validate task name - prevent empty names
                if (!formData.name || formData.name.trim() === '') {
                    alert('Taak moet een naam hebben');
                    return;
                }

                // Create a copy of data to manipulate
                const processedData = { ...formData };

                // Ensure numeric fields are numbers
                processedData.frequency_days = Number(processedData.frequency_days) || 7;
                processedData.frequency_times = Number(processedData.frequency_times) || 1;
                processedData.duration = Number(processedData.duration) || 15;
                processedData.weekday = Number(processedData.weekday || -1);
                processedData.monthday = Number(processedData.monthday || -1);

                // Handle specific frequency types
                if (processedData.frequency_type === "Meerdere keren per week") {
                    // Ensure frequency_times is valid (1-7)
                    processedData.frequency_times = Math.min(Math.max(1, processedData.frequency_times), 7);
                } else if (processedData.frequency_type === "Meerdere keren per maand") {
                    // Ensure frequency_times is valid (1-30)
                    processedData.frequency_times = Math.min(Math.max(1, processedData.frequency_times), 30);
                }

                // Special handling for quarterly and semi-annual tasks
                if (processedData.frequency_type === "Per kwartaal" || processedData.frequency_type === "Halfjaarlijks") {
                    processedData.startMonth = Number(processedData.startMonth || 0);
                    processedData.startDay = Number(processedData.startDay || 1);
                }

                // Remove any undefined fields
                Object.keys(processedData).forEach(key => {
                    if (processedData[key] === undefined) {
                        delete processedData[key];
                    }
                });

                onSubmit(processedData);
            };

            const handleChange = (e) => {
                const { name, value, type, checked } = e.target;
                setFormData({
                    ...formData,
                    [name]: type === 'number' ? parseInt(value, 10) : type === 'checkbox' ? checked : value
                });
            };

            const handleNameChange = (e) => {
                const name = e.target.value;
                // Only update the chore_id if this is a new task
                if (!isEditing) {
                    setFormData({
                        ...formData,
                        chore_id: name.toLowerCase().replace(/\s+/g, '_'),
                        name
                    });
                } else {
                    setFormData({
                        ...formData,
                        name
                    });
                }
            };

            const handleDelete = () => {
                setShowDeleteConfirm(true);
            };

            const confirmDelete = () => {
                setShowDeleteConfirm(false);
                onDelete(formData.chore_id);
            };

            const handleResetCompletion = () => {
                setShowResetConfirm(true);
            };

            const confirmReset = () => {
                setShowResetConfirm(false);
                onResetCompletion(formData.chore_id);
            };

            return React.createElement('div',
                { className: "modal-container" },
                React.createElement('div',
                    { className: "modal-content" },
                    React.createElement('h2', { className: "text-xl font-bold mb-4" },
                        isEditing ? `Bewerk Taak: ${initialData.name}` : "Nieuwe Taak"
                    ),
                    React.createElement('form',
                        { onSubmit: handleSubmit, className: "space-y-4" },
                        // Name input
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Naam"),
                            React.createElement('input', {
                                type: "text",
                                name: "name",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.name,
                                onChange: handleNameChange,
                                required: true
                            })
                        ),

                        // Icon selector
                        React.createElement(IconSelector, {
                            selectedIcon: formData.icon,
                            onSelectIcon: (icon) => setFormData({...formData, icon})
                        }),

                        // Description
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Beschrijving"),
                            React.createElement('textarea', {
                                name: "description",
                                className: "mt-1 block w-full rounded-md border p-2 h-24",
                                value: formData.description || '',
                                onChange: handleChange,
                                placeholder: "Optionele taakbeschrijving of instructies"
                            })
                        ),

                        // Frequency Type
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Frequentie Type"),
                            React.createElement('select', {
                                name: "frequency_type",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.frequency_type,
                                onChange: handleChange
                            },
                                React.createElement('option', { value: "Dagelijks" }, "Dagelijks"),
                                React.createElement('option', { value: "Wekelijks" }, "Wekelijks"),
                                React.createElement('option', { value: "Meerdere keren per week" }, "Meerdere keren per week"),
                                React.createElement('option', { value: "Maandelijks" }, "Maandelijks"),
                                React.createElement('option', { value: "Meerdere keren per maand" }, "Meerdere keren per maand"),
                                React.createElement('option', { value: "Per kwartaal" }, "Per kwartaal (3 maanden)"),
                                React.createElement('option', { value: "Halfjaarlijks" }, "Halfjaarlijks (6 maanden)"),
                                React.createElement('option', { value: "Jaarlijks" }, "Jaarlijks")
                            )
                        ),

                        // Frequency specific options based on type
                        formData.frequency_type === "Wekelijks" && React.createElement('div', { className: "p-3 mt-2 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('label', { className: "block text-sm font-medium" }, "Dag van de week"),
                            React.createElement('select', {
                                name: "weekday",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.weekday || -1,
                                onChange: handleChange
                            },
                                React.createElement('option', { value: -1 }, "Geen specifieke dag"),
                                React.createElement('option', { value: 0 }, "Maandag"),
                                React.createElement('option', { value: 1 }, "Dinsdag"),
                                React.createElement('option', { value: 2 }, "Woensdag"),
                                React.createElement('option', { value: 3 }, "Donderdag"),
                                React.createElement('option', { value: 4 }, "Vrijdag"),
                                React.createElement('option', { value: 5 }, "Zaterdag"),
                                React.createElement('option', { value: 6 }, "Zondag")
                            )
                        ),

                        formData.frequency_type === "Maandelijks" && React.createElement('div', { className: "p-3 mt-2 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('label', { className: "block text-sm font-medium" }, "Dag van de maand"),
                            React.createElement('select', {
                                name: "monthday",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.monthday || -1,
                                onChange: handleChange
                            },
                                React.createElement('option', { value: -1 }, "Geen specifieke dag"),
                                ...Array.from({length: 31}, (_, i) =>
                                    React.createElement('option', { value: i+1 }, `${i+1}`)
                                )
                            )
                        ),

                        formData.frequency_type === "Meerdere keren per week" && React.createElement('div', { className: "p-3 mt-2 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('label', { className: "block text-sm font-medium" }, "Aantal keren per week"),
                            React.createElement('select', {
                                name: "frequency_times",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.frequency_times || 2,
                                onChange: handleChange
                            },
                                ...Array.from({length: 6}, (_, i) =>
                                    React.createElement('option', { value: i+2 }, `${i+2} keer`)
                                )
                            )
                        ),

                        formData.frequency_type === "Meerdere keren per maand" && React.createElement('div', { className: "p-3 mt-2 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('label', { className: "block text-sm font-medium" }, "Aantal keren per maand"),
                            React.createElement('select', {
                                name: "frequency_times",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.frequency_times || 4,
                                onChange: handleChange
                            },
                                ...Array.from({length: 15}, (_, i) =>
                                    React.createElement('option', { value: i+2 }, `${i+2} keer`)
                                )
                            )
                        ),

                        (formData.frequency_type === "Per kwartaal" || formData.frequency_type === "Halfjaarlijks") &&
                        React.createElement('div', { className: "p-3 mt-2 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('div', { className: "flex space-x-4" },
                                React.createElement('div', { className: "flex-1" },
                                    React.createElement('label', { className: "block text-sm font-medium" }, "Startmaand"),
                                    React.createElement('select', {
                                        name: "startMonth",
                                        className: "mt-1 block w-full rounded-md border p-2",
                                        value: formData.startMonth || 0,
                                        onChange: handleChange
                                    },
                                        React.createElement('option', { value: 0 }, "Januari"),
                                        React.createElement('option', { value: 1 }, "Februari"),
                                        React.createElement('option', { value: 2 }, "Maart"),
                                        React.createElement('option', { value: 3 }, "April"),
                                        React.createElement('option', { value: 4 }, "Mei"),
                                        React.createElement('option', { value: 5 }, "Juni"),
                                        React.createElement('option', { value: 6 }, "Juli"),
                                        React.createElement('option', { value: 7 }, "Augustus"),
                                        React.createElement('option', { value: 8 }, "September"),
                                        React.createElement('option', { value: 9 }, "Oktober"),
                                        React.createElement('option', { value: 10 }, "November"),
                                        React.createElement('option', { value: 11 }, "December")
                                    )
                                ),
                                React.createElement('div', { className: "flex-1" },
                                    React.createElement('label', { className: "block text-sm font-medium" }, "Dag"),
                                    React.createElement('select', {
                                        name: "startDay",
                                        className: "mt-1 block w-full rounded-md border p-2",
                                        value: formData.startDay || 1,
                                        onChange: handleChange
                                    },
                                        ...Array.from({length: 31}, (_, i) =>
                                            React.createElement('option', { value: i+1 }, `${i+1}`)
                                        )
                                    )
                                )
                            )
                        ),

                        // Assignee section
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Toegewezen aan"),
                            React.createElement('div', { className: "mt-1" },
                                React.createElement('select', {
                                    name: "assigned_to",
                                    className: "block w-full rounded-md border p-2",
                                    value: formData.assigned_to,
                                    onChange: handleChange
                                },
                                    assigneeOptions.map(name => 
                                        React.createElement('option', { 
                                            key: name, 
                                            value: name 
                                        }, name)
                                    )
                                )
                            )
                        ),

                        // Alternating assignments section
                        React.createElement('div', { className: "mt-4 p-3 bg-gray-50 rounded-md border border-gray-200" },
                            React.createElement('h3', { className: "font-medium text-sm mb-2" }, "Wisselen tussen personen"),
                            React.createElement('div', { className: "flex items-center" },
                                React.createElement('input', {
                                    type: "checkbox",
                                    id: "use_alternating",
                                    name: "use_alternating",
                                    className: "rounded mr-2",
                                    checked: formData.use_alternating || false,
                                    onChange: handleChange
                                }),
                                React.createElement('label', {
                                    htmlFor: "use_alternating",
                                    className: "text-sm"
                                }, "Wissel deze taak tussen personen")
                            ),

                            formData.use_alternating && React.createElement('div', { className: "mt-2 pl-6" },
                                React.createElement('label', {
                                    className: "block text-sm mb-1"
                                }, "Wissel met:"),
                                React.createElement('select', {
                                    name: "alternate_with",
                                    className: "block w-full rounded-md border p-2",
                                    value: formData.alternate_with || assigneeOptions[0],
                                    onChange: handleChange
                                },
                                    // Exclude the currently assigned person from options
                                    assigneeOptions
                                        .filter(name => name !== formData.assigned_to)
                                        .map(name => 
                                            React.createElement('option', { 
                                                key: name, 
                                                value: name 
                                            }, name)
                                        )
                                ),
                                React.createElement('p', { className: "text-xs text-gray-500 mt-1" },
                                    "Na voltooiing zal de taak automatisch wisselen tussen deze personen."
                                )
                            )
                        ),

                        // Priority
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Prioriteit"),
                            React.createElement('select', {
                                name: "priority",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.priority,
                                onChange: handleChange
                            },
                                React.createElement('option', { value: "Hoog" }, "Hoog"),
                                React.createElement('option', { value: "Middel" }, "Middel"),
                                React.createElement('option', { value: "Laag" }, "Laag")
                            )
                        ),

                        // Duration
                        React.createElement('div', null,
                            React.createElement('label', { className: "block text-sm font-medium" }, "Duur (minuten)"),
                            React.createElement('input', {
                                type: "number",
                                name: "duration",
                                className: "mt-1 block w-full rounded-md border p-2",
                                value: formData.duration,
                                onChange: handleChange,
                                min: 5,
                                max: 120,
                                step: 5
                            })
                        ),

                        // Form buttons
                        React.createElement('div', { className: "flex justify-between mt-6" },
                            React.createElement('div', null,
                                isEditing && React.createElement('button', {
                                    type: "button",
                                    onClick: handleDelete,
                                    className: "px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                                }, "Verwijderen")
                            ),
                            React.createElement('div', { className: "flex space-x-2" },
                                React.createElement('button', {
                                    type: "button",
                                    onClick: onCancel,
                                    className: "px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                }, "Annuleren"),
                                React.createElement('button', {
                                    type: "submit",
                                    className: "px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                                }, isEditing ? "Opslaan" : "Toevoegen")
                            )
                        )
                    ),

                    // Delete confirmation dialog
                    React.createElement(ConfirmDialog, {
                        isOpen: showDeleteConfirm,
                        title: "Taak verwijderen",
                        message: `Weet je zeker dat je "${formData.name}" wilt verwijderen?`,
                        onConfirm: confirmDelete,
                        onCancel: () => setShowDeleteConfirm(false)
                    }),

                    // Reset completion confirmation dialog
                    React.createElement(ConfirmDialog, {
                        isOpen: showResetConfirm,
                        title: "Voltooiing ongedaan maken",
                        message: `Weet je zeker dat je de laatste voltooiing van "${formData.name}" wilt ongedaan maken?`,
                        onConfirm: confirmReset,
                        onCancel: () => setShowResetConfirm(false)
                    })
                )
            );
        };

        const TaskCard = function({ chore, onMarkDone, onEdit, onShowDescription, onToggleDescription, assignees = [] }) {
            const id = chore.chore_id || chore.id;
            const bgColorClass = window.choreUtils.getBackgroundColor(chore.assigned_to, assignees);
            const isCompletedToday = chore.last_done && window.choreUtils.isToday(chore.last_done);
            const isProcessing = chore.isProcessing; 
            const taskIcon = chore.icon || '📋';
            const nextDueDate = window.choreUtils.calculateNextDueDate(chore);
            const isPastDue = window.choreUtils.isDueOrOverdue(chore) && !isCompletedToday;
            const isDueTodayValue = !isPastDue && window.choreUtils.isDueToday(chore);
            const dueStatusClass = isPastDue ? 'past-due' : (isDueTodayValue ? 'due-today' : '');
            const hasDescription = chore.description && chore.description.trim() !== '';
            
            // Get custom style for this assignee
            const assigneeObj = assignees.find(a => a.name === chore.assigned_to);
            const customStyle = assigneeObj && assigneeObj.color ? {
                backgroundColor: `${assigneeObj.color}20`,
                borderColor: assigneeObj.color
            } : {};
            
            // Filter available assignees for completion
            const availableAssignees = assignees.length > 0 
                ? assignees.filter(a => a.name !== "Wie kan") 
                : [
                    { id: "laura", name: "Laura" },
                    { id: "martijn", name: "Martijn" }
                ];
            
            // State for description toggle and completion animation
            const [showDescription, setShowDescription] = React.useState(false);
            const [isCompleting, setIsCompleting] = React.useState(false);
            const [showConfirm, setShowConfirm] = React.useState(false);
            
            const handleCardClick = () => {
                if (isProcessing) return; // Prevent clicks while processing
                setShowConfirm(true);
            };
            
            const handleConfirmComplete = (selectedUser) => {
                setShowConfirm(false);
                // Show immediate feedback animation
                setIsCompleting(true);
                
                // Call the actual mark done function with the selected user
                onMarkDone(id, selectedUser);
                
                // Reset animation state after a delay
                setTimeout(() => {
                    setIsCompleting(false);
                }, 600);
            };
            
            const toggleDescription = () => {
                setShowDescription(!showDescription);
            };
            
            return React.createElement('div', 
                { className: "mb-4" }, // Wrapper div for card + description
                React.createElement('div', {
                    key: id,
                    className: `task-card border rounded-lg shadow ${bgColorClass} p-4 relative ${dueStatusClass} ${isCompleting ? 'completion-animation' : ''} ${isProcessing ? 'task-processing' : ''}`,
                    style: customStyle
                },
                    React.createElement('div', { className: "flex justify-between items-start" },
                        // Left side with icon and info
                        React.createElement('div', { 
                            className: "flex items-start flex-1 cursor-pointer",
                            onClick: handleCardClick
                        },
                            React.createElement('div', { className: "task-icon mr-3 mt-1" }, 
                                React.createElement('div', null, taskIcon),
                                React.createElement('div', { className: "mt-1 flex justify-center" }, 
                                    React.createElement(PriorityIndicator, { priority: chore.priority, small: true })
                                )
                            ),
                            React.createElement('div', { className: "flex-1" },
                                React.createElement('h3', { className: "text-xl font-medium" }, chore.name),
                                React.createElement('div', { className: "flex items-center mt-1" },
                                    React.createElement('span', { className: "text-gray-600 mr-1" }, "👤"),
                                    React.createElement('span', { className: "text-gray-600" }, chore.assigned_to)
                                ),
                                React.createElement('div', { className: "flex items-center mt-1" },
                                    React.createElement('span', { className: "text-gray-600 mr-1" }, "⏱️"),
                                    React.createElement('span', { className: "text-gray-600" }, `${chore.duration} min`)
                                ),
                                React.createElement('div', { className: "flex items-center mt-1" },
                                    React.createElement('span', { className: "text-gray-600 mr-1" }, "📆"),
                                    React.createElement('span', { 
                                        className: `text-gray-600 ${isPastDue ? 'text-red-600 font-bold' : (isDueTodayValue ? 'text-orange-600 font-semibold' : '')}` 
                                    }, 
                                    isPastDue 
                                        ? "Achterstallig" 
                                        : (isDueTodayValue 
                                            ? "Vandaag" 
                                            : `Volgende: ${window.choreUtils.formatDate(nextDueDate)}`)
                                    )
                                ),
                                chore.last_done && React.createElement('div', { className: "flex items-center mt-1 text-sm" },
                                    React.createElement('span', { className: "text-gray-500" }, 
                                        `Laatst: ${window.choreUtils.formatDate(chore.last_done)}` + 
                                        (chore.last_done_by ? ` door ${chore.last_done_by}` : '')
                                    )
                                ),
                                // Alternating indicator if applicable
                                chore.use_alternating && React.createElement('div', { className: "text-xs text-gray-500 mt-1" },
                                    "Wisselt met: ", chore.alternate_with
                                )
                            )
                        ),
                        // Right side with actions
                        React.createElement('div', { className: "flex space-x-2" },
                            // Description button (only if has description)
                            hasDescription && React.createElement('button', {
                                onClick: (e) => {
                                    e.stopPropagation();
                                    toggleDescription();
                                },
                                className: "text-gray-500 hover:text-gray-700",
                                title: showDescription ? "Verberg beschrijving" : "Bekijk beschrijving"
                            }, showDescription ? "🔼" : "📝"),
                            
                            // Edit button
                            React.createElement('button', {
                                onClick: (e) => {
                                    e.stopPropagation();
                                    onEdit(chore);
                                },
                                className: "text-gray-500 hover:text-gray-700",
                                title: "Bewerk taak"
                            }, "✏️"),
                            
                            // Completed check (only shown if completed today)
                            isCompletedToday && React.createElement('span', {
                                className: "text-green-600 text-xl",
                                title: `Vandaag voltooid door ${chore.last_done_by || chore.assigned_to}`
                            }, "✓")
                        )
                    )
                ),
                
                // Description section - now directly below the task card
                hasDescription && React.createElement('div', {
                    className: `task-description ${showDescription ? 'expanded' : ''}`,
                    style: {
                        marginLeft: '1rem',
                        marginRight: '1rem',
                    }
                },
                    React.createElement(TaskDescription, {
                        description: chore.description,
                        choreId: id,
                        onSave: onShowDescription,
                        onClose: toggleDescription,
                        inTaskCard: true
                    })
                ),
                
                // User Selection Completion Dialog
                React.createElement(CompletionConfirmDialog, {
                    isOpen: showConfirm,
                    title: "Taak voltooien",
                    message: `Markeer "${chore.name}" als voltooid:`,
                    onConfirm: handleConfirmComplete,
                    onCancel: () => setShowConfirm(false),
                    assignees: availableAssignees,
                    defaultUser: chore.assigned_to
                })
            );
        };

        const StatsCard = function({ title, value, color, desc }) {
            return React.createElement('div',
                { className: "bg-white rounded-lg p-4 shadow" },
                React.createElement('div', { className: "flex items-center" },
                    React.createElement('span', { className: "text-gray-500 mr-2" }, desc),
                    React.createElement('span', { className: "text-gray-500" }, title)
                ),
                React.createElement('p', {
                    className: "text-3xl font-bold",
                    style: { color: color }
                }, value)
            );
        };

        // Theme Settings Component
        const ThemeSettings = function({ onSave, currentTheme = {} }) {
          const [theme, setTheme] = React.useState({
              backgroundColor: currentTheme.backgroundColor || '#ffffff',
              cardColor: currentTheme.cardColor || '#f8f8f8',
              primaryTextColor: currentTheme.primaryTextColor || '#000000',
              secondaryTextColor: currentTheme.secondaryTextColor || '#333333',
              ...currentTheme
          });
          
          const handleChange = (e) => {
              const { name, value } = e.target;
              setTheme({
                  ...theme,
                  [name]: value
              });
          };
          
          const handleSave = () => {
              onSave(theme);
          };
          
          const applyPreview = () => {
              // Apply colors to the preview container
              const previewStyle = {
                  backgroundColor: theme.backgroundColor,
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginTop: '1rem'
              };
              
              const cardStyle = {
                  backgroundColor: theme.cardColor,
                  color: theme.primaryTextColor,
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e0e0e0'
              };
              
              const secondaryTextStyle = {
                  color: theme.secondaryTextColor,
                  marginTop: '0.5rem'
              };
              
              return React.createElement('div', { style: previewStyle, className: 'theme-preview' },
                  React.createElement('h3', { style: { color: theme.primaryTextColor, marginBottom: '1rem' } }, "Thema Voorbeeld"),
                  React.createElement('div', { style: cardStyle },
                      React.createElement('h4', { style: { color: theme.primaryTextColor } }, "Voorbeeld Taakkaart"),
                      React.createElement('p', { style: secondaryTextStyle }, "Dit is een voorbeeld van de secundaire tekst.")
                  )
              );
          };
          
          return React.createElement('div', null,
              React.createElement('h3', { className: "text-lg font-medium mb-4" }, "Thema Instellingen"),
              
              // Background color picker
              React.createElement('div', { className: "mb-4" },
                  React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Achtergrondkleur"),
                  React.createElement('div', { className: "flex items-center" },
                      React.createElement('input', {
                          type: "color",
                          name: "backgroundColor",
                          value: theme.backgroundColor,
                          onChange: handleChange,
                          className: "w-10 h-10 mr-2"
                      }),
                      React.createElement('input', {
                          type: "text",
                          name: "backgroundColor",
                          value: theme.backgroundColor,
                          onChange: handleChange,
                          className: "flex-1 p-2 border rounded"
                      })
                  )
              ),
              
              // Card color picker
              React.createElement('div', { className: "mb-4" },
                  React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Kaartkleur"),
                  React.createElement('div', { className: "flex items-center" },
                      React.createElement('input', {
                          type: "color",
                          name: "cardColor",
                          value: theme.cardColor,
                          onChange: handleChange,
                          className: "w-10 h-10 mr-2"
                      }),
                      React.createElement('input', {
                          type: "text",
                          name: "cardColor",
                          value: theme.cardColor,
                          onChange: handleChange,
                          className: "flex-1 p-2 border rounded"
                      })
                  )
              ),
              
              // Primary text color picker
              React.createElement('div', { className: "mb-4" },
                  React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Hoofdtekstkleur"),
                  React.createElement('div', { className: "flex items-center" },
                      React.createElement('input', {
                          type: "color",
                          name: "primaryTextColor",
                          value: theme.primaryTextColor,
                          onChange: handleChange,
                          className: "w-10 h-10 mr-2"
                      }),
                      React.createElement('input', {
                          type: "text",
                          name: "primaryTextColor",
                          value: theme.primaryTextColor,
                          onChange: handleChange,
                          className: "flex-1 p-2 border rounded"
                      })
                  )
              ),
              
              // Secondary text color picker
              React.createElement('div', { className: "mb-4" },
                  React.createElement('label', { className: "block text-sm font-medium mb-1" }, "Secundaire tekstkleur"),
                  React.createElement('div', { className: "flex items-center" },
                      React.createElement('input', {
                          type: "color",
                          name: "secondaryTextColor",
                          value: theme.secondaryTextColor,
                          onChange: handleChange,
                          className: "w-10 h-10 mr-2"
                      }),
                      React.createElement('input', {
                          type: "text",
                          name: "secondaryTextColor",
                          value: theme.secondaryTextColor,
                          onChange: handleChange,
                          className: "flex-1 p-2 border rounded"
                      })
                  )
              ),
              
              // Preview section
              applyPreview(),
              
              // Save button
              React.createElement('div', { className: "mt-6 flex justify-end" },
                  React.createElement('button', {
                      type: "button",
                      onClick: handleSave,
                      className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  }, "Thema Opslaan")
              )
          );
        };

        const UserStatsCard = function({ assignee, stats, assignees = [] }) {
            const bgColorClass = window.choreUtils.getBackgroundColor(assignee, assignees);
            const assigneeObj = assignees.find(a => a.name === assignee);
            
            const completed = stats.tasks_completed || 0;
            const total = stats.total_tasks || 0;
            const timeCompleted = stats.time_completed || 0;
            const totalTime = stats.total_time || 0;
            const streak = stats.streak || 0;
            const hasStreak = streak > 0;
        
            // Fix progress bar overflow by limiting to 100%
            const completionPercentage = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
            const timePercentage = totalTime > 0 ? Math.min(100, (timeCompleted / totalTime) * 100) : 0;
        
            // Custom style object for background and border color
            const customStyle = assigneeObj && assigneeObj.color ? {
                backgroundColor: `${assigneeObj.color}20`,
                borderColor: assigneeObj.color
            } : {};
        
            return React.createElement('div',
                { 
                    className: `p-4 rounded-lg shadow ${bgColorClass} relative`,
                    style: customStyle 
                },
                // Add streak indicator in top right (if streak exists)
                hasStreak && React.createElement('div', { 
                    className: "absolute top-2 right-2 flex items-center" 
                },
                    React.createElement('span', { 
                        className: "text-orange-500 streak-flame"
                    }, "🔥"),
                    // Only show number if streak > 1
                    streak > 1 && React.createElement('span', { 
                        className: "text-sm ml-1 font-bold" 
                    }, streak)
                ),
                
                // Add header with assignee name
                React.createElement('h3', { 
                    className: "text-lg font-medium mb-2"
                }, assignee),
        
                // Tasks stats
                React.createElement('div', { className: "space-y-2" },
                    React.createElement('div', null,
                        React.createElement('div', { className: "flex justify-between text-sm mb-1" },
                            React.createElement('span', null, "Vandaag voltooid:"),
                            React.createElement('span', { className: "font-medium" }, `${completed} / ${total}`)
                        ),
                        React.createElement('div', { className: "progress-container" },
                            React.createElement('div', {
                                className: "progress-bar bg-blue-500",
                                style: { width: `${completionPercentage}%` }
                            })
                        )
                    ),
        
                    // Time stats
                    React.createElement('div', null,
                        React.createElement('div', { className: "flex justify-between text-sm mb-1" },
                            React.createElement('span', null, "Tijd vandaag:"),
                            React.createElement('span', { className: "font-medium" }, `${window.choreUtils.formatTime(timeCompleted)} / ${window.choreUtils.formatTime(totalTime)}`)
                        ),
                        React.createElement('div', { className: "progress-container" },
                            React.createElement('div', {
                                className: "progress-bar bg-green-500",
                                style: { width: `${timePercentage}%` }
                            })
                        )
                    ),
        
                    // Monthly stats
                    React.createElement('div', { className: "text-xs text-gray-600 mt-2" },
                        `Deze maand: ${stats.monthly_completed || 0} taken (${stats.monthly_percentage || 0}%)`
                    )
                )
            );
        };;;

        // Export the components to window object
        window.choreComponents = {
          PriorityIndicator,
          IconSelector,
          TaskDescription,
          TaskForm,
          TaskCard,
          StatsCard,
          UserStatsCard,
          ConfirmDialog,
          CompletionConfirmDialog,
          UserManagement,
          WeekDayPicker,
          MonthDayPicker,
          ThemeSettings
        };
    }
})();