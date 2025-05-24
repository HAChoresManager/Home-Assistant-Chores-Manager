// custom_components/chores_manager/www/chores-dashboard/js/components.js

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
      // WeekDayPicker Component - IMPROVED with better visual feedback
      const WeekDayPicker = function({ selectedDays, onChange }) {
        const weekDays = [
          { day: "Maandag", short: "Ma", value: "mon" },
          { day: "Dinsdag", short: "Di", value: "tue" },
          { day: "Woensdag", short: "Wo", value: "wed" },
          { day: "Donderdag", short: "Do", value: "thu" },
          { day: "Vrijdag", short: "Vr", value: "fri" },
          { day: "Zaterdag", short: "Za", value: "sat" },
          { day: "Zondag", short: "Zo", value: "sun" }
        ];

        return React.createElement('div', { className: "week-day-picker" },
          React.createElement('div', { className: "grid grid-cols-7 gap-2" },
            weekDays.map(({ day, short, value }) =>
              React.createElement('div', {
                key: value,
                className: `text-center cursor-pointer p-3 rounded-lg select-none font-medium transition-all duration-200 ${
                  selectedDays[value] 
                    ? 'bg-blue-500 text-white shadow-md transform scale-105' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`,
                title: day,
                onClick: () => {
                  onChange({
                    ...selectedDays,
                    [value]: !selectedDays[value]
                  });
                }
              }, short)
            )
          )
        );
      };

      // MonthDayPicker Component - IMPROVED with better visual feedback
      const MonthDayPicker = function({ selectedDays, onChange }) {
        const days = Array.from({ length: 31 }, (_, i) => i + 1);

        return React.createElement('div', { className: "month-day-picker" },
          React.createElement('div', { className: "grid grid-cols-7 gap-1" },
            days.map(day =>
              React.createElement('div', {
                key: day,
                className: `text-center cursor-pointer p-2 rounded-md select-none text-sm font-medium transition-all duration-200 ${
                  selectedDays[day] 
                    ? 'bg-blue-500 text-white shadow-md' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`,
                onClick: () => {
                  onChange({
                    ...selectedDays,
                    [day]: !selectedDays[day]
                  });
                }
              }, day)
            )
          )
        );
      };

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

      // Subtask Completion Dialog Component
      const SubtaskCompletionDialog = function({ chore, onComplete, onCancel, isOpen, assignees = [], defaultUser }) {
          if (!isOpen || !chore || !chore.subtasks || !Array.isArray(chore.subtasks)) return null;
          
          const [selectedUser, setSelectedUser] = React.useState(defaultUser || '');
          const [subtaskStates, setSubtaskStates] = React.useState({});
          
          // Initialize subtask states on dialog open
          React.useEffect(() => {
              if (isOpen && chore.subtasks && Array.isArray(chore.subtasks)) {
                  const initialStates = {};
                  chore.subtasks.forEach(subtask => {
                      // Ensure subtask has required fields
                      if (subtask && typeof subtask.id !== 'undefined') {
                          initialStates[subtask.id] = subtask.completed || false;
                      }
                  });
                  setSubtaskStates(initialStates);
              }
          }, [isOpen, chore]);
          
          const handleSubtaskToggle = (subtaskId) => {
              if (typeof subtaskId === 'undefined') return;
              setSubtaskStates(prev => ({
                  ...prev,
                  [subtaskId]: !prev[subtaskId]
              }));
          };
          
          const handleComplete = () => {
              if (!selectedUser) {
                  console.warn('No user selected for subtask completion');
                  return;
              }
              
              // Filter selected subtasks and ensure they're valid
              const completedSubtasks = Object.entries(subtaskStates)
                  .filter(([_, isCompleted]) => isCompleted)
                  .map(([id]) => {
                      const numId = parseInt(id, 10);
                      if (isNaN(numId)) {
                          console.warn('Invalid subtask ID:', id);
                          return null;
                      }
                      return numId;
                  })
                  .filter(id => id !== null);
              
              if (completedSubtasks.length === 0) {
                  console.warn('No valid subtasks selected for completion');
                  return;
              }
              
              console.log('Completing subtasks:', { choreId: chore.chore_id, subtaskIds: completedSubtasks, user: selectedUser });
              onComplete(chore.chore_id, completedSubtasks, selectedUser);
          };
          
          // Filter out "Wie kan" from completion assignees
          const filteredAssignees = assignees.filter(user => user.name !== "Wie kan");
          
          // Check if all subtasks are completed
          const allCompleted = chore.subtasks.every(subtask => 
              subtaskStates[subtask.id] || subtask.completed);
          
          // Count selected subtasks
          const selectedCount = Object.values(subtaskStates).filter(Boolean).length;
          
          return React.createElement('div',
              { className: "modal-container" },
              React.createElement('div',
                  { className: "confirm-dialog bg-white p-4 rounded-lg shadow-lg max-w-md w-full mx-auto" },
                  React.createElement('h3', { className: "text-lg font-medium mb-2" }, 
                      `Voltooien subtaken voor: ${chore.name}`
                  ),
                  React.createElement('div', { className: "mb-4" },
                      React.createElement('label', { className: "block text-sm font-medium mb-2" }, 
                          "Selecteer de subtaken die je hebt voltooid:"
                      ),
                      React.createElement('div', { className: "max-h-60 overflow-auto border rounded p-2" },
                          chore.subtasks.map(subtask => {
                              if (!subtask || typeof subtask.id === 'undefined') {
                                  console.warn('Invalid subtask:', subtask);
                                  return null;
                              }
                              
                              return React.createElement('div', {
                                  key: subtask.id,
                                  className: "flex items-center py-2 border-b last:border-b-0"
                              },
                                  React.createElement('input', {
                                      type: "checkbox",
                                      id: `subtask-${subtask.id}`,
                                      checked: subtaskStates[subtask.id] || subtask.completed || false,
                                      onChange: () => handleSubtaskToggle(subtask.id),
                                      disabled: subtask.completed,
                                      className: "mr-2"
                                  }),
                                  React.createElement('label', {
                                      htmlFor: `subtask-${subtask.id}`,
                                      className: `flex-1 ${subtask.completed ? "line-through text-gray-500" : ""}`
                                  }, subtask.name || 'Unnamed subtask')
                              );
                          }).filter(Boolean) // Remove null entries
                      )
                  ),
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
                          onClick: handleComplete,
                          className: "px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700",
                          disabled: !selectedUser || selectedCount === 0,
                          title: !selectedUser ? "Selecteer een gebruiker" : 
                                 selectedCount === 0 ? "Selecteer minstens één subtaak" : ""
                      }, allCompleted ? "Alle subtaken voltooid!" : `${selectedCount} subtaken voltooien`)
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
      };

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

      // SIMPLIFIED AND IMPROVED TaskForm with better frequency selection
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
              frequency_type: 'Weekly', // Simplified default
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
              specific_date: { month: 0, day: 1 }, // For yearly/quarterly tasks
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
                      newFormData.selected_weekdays[dayNames[initialData.weekday]] = true;
                  } else if (initialData.frequency_type === 'Dagelijks') {
                      newFormData.frequency_type = 'Daily';
                      if (initialData.active_days) {
                          newFormData.selected_weekdays = initialData.active_days;
                      } else {
                          // Default to all days for daily tasks
                          newFormData.selected_weekdays = {
                              mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true
                          };
                      }
                  } else if (initialData.frequency_type === 'Maandelijks' && initialData.monthday > 0) {
                      newFormData.frequency_type = 'Monthly';
                      newFormData.selected_monthdays = { [initialData.monthday]: true };
                  } else if (initialData.frequency_type === 'Meerdere keren per week') {
                      newFormData.frequency_type = 'MultipleWeekly';
                      newFormData.frequency_times = initialData.frequency_times || 2;
                      newFormData.selected_weekdays = initialData.active_days || {
                          mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
                      };
                  } else if (initialData.frequency_type === 'Meerdere keren per maand') {
                      newFormData.frequency_type = 'MultipleMonthly';
                      newFormData.frequency_times = initialData.frequency_times || 4;
                      newFormData.selected_monthdays = initialData.active_monthdays || { 1: true, 15: true };
                  }
                  
                  setFormData(newFormData);
              }
          }, [isEditing, initialData]);

          const handleSubmit = (e) => {
              e.preventDefault();

              if (!formData.name || formData.name.trim() === '') {
                  alert('Taak moet een naam hebben');
                  return;
              }

              // Convert simplified form data back to backend format
              const processedData = { ...formData };

              // Map simplified frequency types back to backend types
              switch (formData.frequency_type) {
                  case 'Daily':
                      processedData.frequency_type = 'Dagelijks';
                      processedData.frequency_days = 1;
                      processedData.frequency_times = 1;
                      processedData.active_days = formData.selected_weekdays;
                      break;

                  case 'Weekly':
                      processedData.frequency_type = 'Wekelijks';
                      processedData.frequency_days = 7;
                      processedData.frequency_times = 1;
                      // Find selected weekday
                      const selectedWeekday = Object.entries(formData.selected_weekdays)
                          .find(([day, selected]) => selected);
                      if (selectedWeekday) {
                          const dayMap = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
                          processedData.weekday = dayMap[selectedWeekday[0]];
                      }
                      break;

                  case 'MultipleWeekly':
                      processedData.frequency_type = 'Meerdere keren per week';
                      processedData.frequency_days = 7;
                      processedData.frequency_times = Math.max(1, Math.min(7, formData.frequency_times));
                      processedData.active_days = formData.selected_weekdays;
                      break;

                  case 'Monthly':
                      processedData.frequency_type = 'Maandelijks';
                      processedData.frequency_days = 30;
                      processedData.frequency_times = 1;
                      // Find selected day
                      const selectedDay = Object.keys(formData.selected_monthdays)
                          .find(day => formData.selected_monthdays[day]);
                      if (selectedDay) {
                          processedData.monthday = parseInt(selectedDay);
                      }
                      break;

                  case 'MultipleMonthly':
                      processedData.frequency_type = 'Meerdere keren per maand';
                      processedData.frequency_days = 30;
                      processedData.frequency_times = Math.max(1, Math.min(30, formData.frequency_times));
                      processedData.active_monthdays = formData.selected_monthdays;
                      break;

                  case 'Quarterly':
                      processedData.frequency_type = 'Per kwartaal';
                      processedData.frequency_days = 90;
                      processedData.frequency_times = 1;
                      processedData.startMonth = formData.specific_date.month;
                      processedData.startDay = formData.specific_date.day;
                      break;

                  case 'SemiAnnual':
                      processedData.frequency_type = 'Halfjaarlijks';
                      processedData.frequency_days = 180;
                      processedData.frequency_times = 1;
                      processedData.startMonth = formData.specific_date.month;
                      processedData.startDay = formData.specific_date.day;
                      break;

                  case 'Yearly':
                      processedData.frequency_type = 'Jaarlijks';
                      processedData.frequency_days = 365;
                      processedData.frequency_times = 1;
                      processedData.startMonth = formData.specific_date.month;
                      processedData.startDay = formData.specific_date.day;
                      break;
              }

              // Ensure numeric fields are numbers
              processedData.frequency_days = Number(processedData.frequency_days) || 7;
              processedData.frequency_times = Number(processedData.frequency_times) || 1;
              processedData.duration = Number(processedData.duration) || 15;

              // Handle subtasks
              if (processedData.has_subtasks && processedData.subtasks) {
                  processedData.subtasks = processedData.subtasks
                      .filter(subtask => subtask && subtask.name && subtask.name.trim() !== '')
                      .map(subtask => ({
                          name: subtask.name.trim(),
                          completed: false
                      }));
                  
                  if (processedData.subtasks.length === 0) {
                      processedData.has_subtasks = false;
                  }
              } else {
                  processedData.subtasks = [];
              }

              // Remove simplified fields that backend doesn't need
              delete processedData.selected_weekdays;
              delete processedData.selected_monthdays;
              delete processedData.specific_date;

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

          // Helper function to count selected days
          const getSelectedDaysCount = (days) => {
              return Object.values(days || {}).filter(Boolean).length;
          };

          // Helper function to get selected weekday names
          const getSelectedWeekdayNames = (days) => {
              const dayNames = { mon: 'Ma', tue: 'Di', wed: 'Wo', thu: 'Do', fri: 'Vr', sat: 'Za', sun: 'Zo' };
              return Object.entries(days || {})
                  .filter(([_, selected]) => selected)
                  .map(([day, _]) => dayNames[day])
                  .join(', ');
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

                      // SIMPLIFIED Frequency Type Selection
                      React.createElement('div', null,
                          React.createElement('label', { className: "block text-sm font-medium mb-2" }, "Hoe vaak moet deze taak gedaan worden?"),
                          React.createElement('select', {
                              name: "frequency_type",
                              className: "mt-1 block w-full rounded-md border p-2",
                              value: formData.frequency_type,
                              onChange: handleChange
                          },
                              React.createElement('option', { value: "Daily" }, "Dagelijks"),
                              React.createElement('option', { value: "Weekly" }, "Wekelijks"),
                              React.createElement('option', { value: "MultipleWeekly" }, "Meerdere keren per week"),
                              React.createElement('option', { value: "Monthly" }, "Maandelijks"),
                              React.createElement('option', { value: "MultipleMonthly" }, "Meerdere keren per maand"),
                              React.createElement('option', { value: "Quarterly" }, "Per kwartaal"),
                              React.createElement('option', { value: "SemiAnnual" }, "Halfjaarlijks"),
                              React.createElement('option', { value: "Yearly" }, "Jaarlijks")
                          )
                      ),

                      // Frequency-specific controls with IMPROVED visual feedback
                      React.createElement('div', { className: "p-4 bg-blue-50 rounded-lg border border-blue-200" },
                          
                          // Daily tasks
                          formData.frequency_type === 'Daily' && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, "🌅 Dagelijkse taak instellingen"),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer op welke dagen deze taak gedaan moet worden:"
                              ),
                              React.createElement(WeekDayPicker, {
                                  selectedDays: formData.selected_weekdays,
                                  onChange: (days) => setFormData({ ...formData, selected_weekdays: days })
                              }),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  `✓ Actief op: ${getSelectedDaysCount(formData.selected_weekdays)} dagen (${getSelectedWeekdayNames(formData.selected_weekdays) || 'Geen dagen geselecteerd'})`
                              )
                          ),

                          // Weekly tasks
                          formData.frequency_type === 'Weekly' && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, "📅 Wekelijkse taak instellingen"),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer op welke dag van de week deze taak gedaan moet worden:"
                              ),
                              React.createElement(WeekDayPicker, {
                                  selectedDays: formData.selected_weekdays,
                                  onChange: (days) => {
                                      // For weekly tasks, only allow one day selection
                                      const selectedDay = Object.keys(days).find(day => days[day]);
                                      const newDays = {};
                                      Object.keys(days).forEach(day => newDays[day] = false);
                                      if (selectedDay) {
                                          newDays[selectedDay] = true;
                                      }
                                      setFormData({ ...formData, selected_weekdays: newDays });
                                  }
                              }),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  getSelectedDaysCount(formData.selected_weekdays) > 0 
                                      ? `✓ Elke week op: ${getSelectedWeekdayNames(formData.selected_weekdays)}`
                                      : "⚠️ Selecteer een dag"
                              )
                          ),

                          // Multiple times per week
                          formData.frequency_type === 'MultipleWeekly' && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, "🔄 Meerdere keren per week"),
                              React.createElement('div', { className: "flex items-center space-x-4 mb-3" },
                                  React.createElement('div', null,
                                      React.createElement('label', { className: "block text-sm font-medium mb-1 text-blue-800" }, "Aantal keer per week:"),
                                      React.createElement('input', {
                                          type: "number",
                                          name: "frequency_times",
                                          className: "w-20 p-2 border rounded",
                                          value: formData.frequency_times || 2,
                                          min: 2,
                                          max: 7,
                                          onChange: handleChange
                                      })
                                  )
                              ),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer op welke dagen deze taak gedaan kan worden:"
                              ),
                              React.createElement(WeekDayPicker, {
                                  selectedDays: formData.selected_weekdays,
                                  onChange: (days) => setFormData({ ...formData, selected_weekdays: days })
                              }),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  `✓ ${formData.frequency_times}x per week op beschikbare dagen: ${getSelectedWeekdayNames(formData.selected_weekdays) || 'Geen dagen geselecteerd'}`
                              )
                          ),

                          // Monthly tasks
                          formData.frequency_type === 'Monthly' && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, "📊 Maandelijkse taak instellingen"),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer op welke dag van de maand deze taak gedaan moet worden:"
                              ),
                              React.createElement(MonthDayPicker, {
                                  selectedDays: formData.selected_monthdays,
                                  onChange: (days) => {
                                      // For monthly tasks, only allow one day selection
                                      const selectedDay = Object.keys(days).find(day => days[day]);
                                      const newDays = {};
                                      if (selectedDay) {
                                          newDays[selectedDay] = true;
                                      }
                                      setFormData({ ...formData, selected_monthdays: newDays });
                                  }
                              }),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  Object.keys(formData.selected_monthdays).length > 0
                                      ? `✓ Elke maand op dag: ${Object.keys(formData.selected_monthdays).join(', ')}`
                                      : "⚠️ Selecteer een dag"
                              )
                          ),

                          // Multiple times per month
                          formData.frequency_type === 'MultipleMonthly' && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, "🔄 Meerdere keren per maand"),
                              React.createElement('div', { className: "flex items-center space-x-4 mb-3" },
                                  React.createElement('div', null,
                                      React.createElement('label', { className: "block text-sm font-medium mb-1 text-blue-800" }, "Aantal keer per maand:"),
                                      React.createElement('input', {
                                          type: "number",
                                          name: "frequency_times",
                                          className: "w-20 p-2 border rounded",
                                          value: formData.frequency_times || 4,
                                          min: 2,
                                          max: 15,
                                          onChange: handleChange
                                      })
                                  )
                              ),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer op welke dagen van de maand deze taak gedaan kan worden:"
                              ),
                              React.createElement(MonthDayPicker, {
                                  selectedDays: formData.selected_monthdays,
                                  onChange: (days) => setFormData({ ...formData, selected_monthdays: days })
                              }),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  `✓ ${formData.frequency_times}x per maand op dagen: ${Object.keys(formData.selected_monthdays).join(', ') || 'Geen dagen geselecteerd'}`
                              )
                          ),

                          // Fixed schedule tasks (Quarterly, Semi-annual, Yearly)
                          (formData.frequency_type === 'Quarterly' || formData.frequency_type === 'SemiAnnual' || formData.frequency_type === 'Yearly') && React.createElement('div', null,
                              React.createElement('h4', { className: "font-medium mb-3 text-blue-900" }, 
                                  formData.frequency_type === 'Quarterly' ? "📈 Driemaandelijkse taak" :
                                  formData.frequency_type === 'SemiAnnual' ? "📅 Halfjaarlijkse taak" : "🗓️ Jaarlijkse taak"
                              ),
                              React.createElement('p', { className: "text-sm text-blue-700 mb-3" },
                                  "Selecteer de datum waarop deze taak gedaan moet worden:"
                              ),
                              React.createElement('div', { className: "flex space-x-4" },
                                  React.createElement('div', { className: "flex-1" },
                                      React.createElement('label', { className: "block text-sm font-medium mb-1 text-blue-800" }, "Maand"),
                                      React.createElement('select', {
                                          value: formData.specific_date?.month || 0,
                                          onChange: (e) => setFormData({
                                              ...formData,
                                              specific_date: {
                                                  ...formData.specific_date,
                                                  month: parseInt(e.target.value)
                                              }
                                          }),
                                          className: "w-full p-2 border rounded"
                                      },
                                          ["Januari", "Februari", "Maart", "April", "Mei", "Juni",
                                          "Juli", "Augustus", "September", "Oktober", "November", "December"]
                                          .map((month, index) =>
                                              React.createElement('option', { key: index, value: index }, month)
                                          )
                                      )
                                  ),
                                  React.createElement('div', { className: "flex-1" },
                                      React.createElement('label', { className: "block text-sm font-medium mb-1 text-blue-800" }, "Dag"),
                                      React.createElement('select', {
                                          value: formData.specific_date?.day || 1,
                                          onChange: (e) => setFormData({
                                              ...formData,
                                              specific_date: {
                                                  ...formData.specific_date,
                                                  day: parseInt(e.target.value)
                                              }
                                          }),
                                          className: "w-full p-2 border rounded"
                                      },
                                          Array.from({ length: 31 }, (_, i) => i + 1).map(day =>
                                              React.createElement('option', { key: day, value: day }, day)
                                          )
                                      )
                                  )
                              ),
                              React.createElement('p', { className: "text-xs text-blue-600 mt-3 p-2 bg-blue-100 rounded" },
                                  `✓ ${formData.frequency_type === 'Quarterly' ? 'Elk kwartaal' : 
                                    formData.frequency_type === 'SemiAnnual' ? 'Elke 6 maanden' : 'Elk jaar'} op ${
                                      ["januari", "februari", "maart", "april", "mei", "juni",
                                      "juli", "augustus", "september", "oktober", "november", "december"][formData.specific_date?.month || 0]
                                  } ${formData.specific_date?.day || 1}`
                              )
                          )
                      ),

                      // Subtask Management Section - Simplified
                      React.createElement('div',
                          { className: "mt-6 p-4 bg-green-50 rounded-md border border-green-200" },
                          React.createElement('h3', { className: "text-lg font-medium mb-3 flex items-center" },
                              React.createElement('span', { className: "mr-2" }, "📋"),
                              "Subtaken (optioneel)"
                          ),

                          // Enable subtasks toggle
                          React.createElement('div', { className: "mb-4" },
                              React.createElement('label', { className: "flex items-center" },
                                  React.createElement('input', {
                                      type: "checkbox",
                                      checked: formData.has_subtasks || false,
                                      onChange: e => {
                                          setFormData({
                                              ...formData,
                                              has_subtasks: e.target.checked,
                                              subtasks: e.target.checked ? (formData.subtasks || [{ name: "", completed: false }]) : []
                                          });
                                      },
                                      className: "mr-2"
                                  }),
                                  React.createElement('span', { className: "text-sm font-medium" }, "Deze taak heeft subtaken")
                              )
                          ),

                          // Subtask list (only shown when has_subtasks is true)
                          formData.has_subtasks && React.createElement('div', null,
                              React.createElement('label', { className: "block text-sm font-medium mb-2" }, "Subtaken:"),
                              React.createElement('div', { className: "space-y-2 mb-3" },
                                  (formData.subtasks || []).map((subtask, index) =>
                                      React.createElement('div', { key: index, className: "flex items-center" },
                                          React.createElement('input', {
                                              type: "text",
                                              value: (subtask && subtask.name) || '',
                                              placeholder: "Naam van subtaak",
                                              onChange: e => {
                                                  const newSubtasks = [...(formData.subtasks || [])];
                                                  if (!newSubtasks[index]) {
                                                      newSubtasks[index] = { name: '', completed: false };
                                                  }
                                                  newSubtasks[index].name = e.target.value;
                                                  setFormData({
                                                      ...formData,
                                                      subtasks: newSubtasks
                                                  });
                                              },
                                              className: "flex-1 p-2 border rounded-md"
                                          }),
                                          index > 0 && React.createElement('button', {
                                              type: "button",
                                              onClick: () => {
                                                  const newSubtasks = [...(formData.subtasks || [])];
                                                  newSubtasks.splice(index, 1);
                                                  setFormData({
                                                      ...formData,
                                                      subtasks: newSubtasks
                                                  });
                                              },
                                              className: "ml-2 p-2 text-red-500 hover:bg-red-100 rounded-full"
                                          }, "×")
                                      )
                                  )
                              ),

                              // Add subtask button
                              React.createElement('button', {
                                  type: "button",
                                  onClick: () => {
                                      setFormData({
                                          ...formData,
                                          subtasks: [...(formData.subtasks || []), { name: "", completed: false }]
                                      });
                                  },
                                  className: "px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm flex items-center"
                              },
                                  React.createElement('span', { className: "mr-1" }, "+"),
                                  "Subtaak toevoegen"
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

                      // Priority and Duration
                      React.createElement('div', { className: "grid grid-cols-2 gap-4" },
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
                          )
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

      // Updated TaskCard component - no changes needed for this
      const TaskCard = function({
        chore,
        onMarkDone,
        onEdit,
        onShowDescription,
        onToggleDescription,
        assignees = [],
        onMarkSubtaskDone
      }) {
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
          const hasSubtasks = chore.has_subtasks && chore.subtasks && Array.isArray(chore.subtasks) && chore.subtasks.length > 0;
      
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
          const [showSubtaskConfirm, setShowSubtaskConfirm] = React.useState(false);
            
          // State to track expanded subtasks
          const [expandedSubtasks, setExpandedSubtasks] = React.useState({});
            
          // Function to toggle subtask expansion
          const toggleSubtasks = (choreId) => {
            setExpandedSubtasks(prev => ({
              ...prev,
              [choreId]: !prev[choreId]
            }));
          };
        
          // Function to handle subtask completion
          const handleSubtaskCompletion = (choreId, subtaskIds, person) => {
              // Hide subtask confirmation dialog
              setShowSubtaskConfirm(false);
              
              // Validate inputs
              if (!choreId || !subtaskIds || !Array.isArray(subtaskIds) || subtaskIds.length === 0) {
                  console.error('Invalid subtask completion data:', { choreId, subtaskIds, person });
                  return;
              }
              
              // Call the completion function with the array of subtask IDs
              if (typeof onMarkSubtaskDone === 'function') {
                  onMarkSubtaskDone(choreId, subtaskIds, person);
              } else {
                  console.error('onMarkSubtaskDone is not a function');
              }
          };
          
          // Handler for task card click
          const handleCardClick = () => {
              if (isProcessing) return; // Prevent clicks while processing
              
              // Different behavior for tasks with subtasks
              if (hasSubtasks) {
                  // For tasks with subtasks, open the subtask completion dialog
                  setShowSubtaskConfirm(true);
              } else {
                  // For regular tasks, show the normal completion confirmation
                  setShowConfirm(true);
              }
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
              // Toggle state
              setShowDescription(!showDescription);
              
              // Force re-render of description container
              setTimeout(() => {
                  const descEl = document.querySelector(`.task-description[data-chore-id="${id}"]`);
                  if (descEl) {
                      if (showDescription) {
                          descEl.classList.remove('expanded');
                      } else {
                          descEl.classList.add('expanded');
                      }
                  }
              }, 10);
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
                  ),
                
                  // Subtask display with improved rendering
                  hasSubtasks && React.createElement('div', { className: "mt-2" },
                    // Show a progress bar for subtasks
                    React.createElement('div', { className: "flex items-center justify-between text-xs text-gray-600 mb-1" },
                      React.createElement('span', null, "Subtaken:"),
                      React.createElement('span', null,
                        `${chore.subtasks.filter(s => s && s.completed).length}/${chore.subtasks.length}`
                      )
                    ),
                    React.createElement('div', { className: "h-1.5 bg-gray-200 rounded-full overflow-hidden" },
                      React.createElement('div', {
                        className: "h-full bg-green-500 transition-all duration-300",
                        style: {
                          width: `${(chore.subtasks.filter(s => s && s.completed).length / chore.subtasks.length) * 100}%`
                        }
                      })
                    ),
                  
                    // Subtask toggle button 
                    React.createElement('div', { className: "mt-2" },
                      React.createElement('button', {
                        onClick: (e) => {
                          e.stopPropagation(); // Don't trigger parent card click
                          toggleSubtasks(chore.chore_id);
                        },
                        className: "text-xs text-blue-600 flex items-center",
                        type: "button",
                        "data-chore-id": chore.chore_id
                      },
                        expandedSubtasks[chore.chore_id] ? "Verberg subtaken" : "Toon subtaken",
                        React.createElement('span', { className: "ml-1" },
                          expandedSubtasks[chore.chore_id] ? "▲" : "▼"
                        )
                      )
                    ),
                  
                    // Always render the subtask list, but control visibility with style
                    React.createElement('div', {
                      className: "mt-2 pl-2 border-l-2 border-gray-200 subtask-list",
                      style: { display: expandedSubtasks[chore.chore_id] ? 'block' : 'none' }
                    },
                      chore.subtasks
                        .filter(subtask => subtask && typeof subtask.name === 'string') // Filter out invalid subtasks
                        .map((subtask, index) =>
                          React.createElement('div', {
                            key: subtask.id || index,
                            className: "flex items-center py-1 text-sm subtask-item"
                          },
                            React.createElement('input', {
                              type: "checkbox",
                              checked: subtask.completed || false,
                              readOnly: true,
                              className: "mr-2 subtask-checkbox"
                            }),
                            React.createElement('span', {
                              className: `subtask-name ${subtask.completed ? "completed line-through text-gray-500" : ""}`
                            }, subtask.name)
                          )
                        )
                    )
                  )
              ),
            
              // Description section - now directly below the task card
              hasDescription && React.createElement('div', {
                  className: `task-description ${showDescription ? 'expanded' : ''}`,
                  "data-chore-id": id,
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
              }),
              
              // Subtask completion dialog
              hasSubtasks && React.createElement(SubtaskCompletionDialog, {
                  isOpen: showSubtaskConfirm,
                  chore: chore,
                  onComplete: handleSubtaskCompletion,
                  onCancel: () => setShowSubtaskConfirm(false),
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

      // ThemeSettings component
      const ThemeSettings = function({ onSave, currentTheme = {} }) {
        // Default theme values
        const defaultTheme = {
          backgroundColor: '#ffffff',
          cardColor: '#f8f8f8',
          primaryTextColor: '#000000',
          secondaryTextColor: '#333333'
        };

        // Use React hooks
        const [theme, setTheme] = React.useState({
          backgroundColor: currentTheme?.backgroundColor || defaultTheme.backgroundColor,
          cardColor: currentTheme?.cardColor || defaultTheme.cardColor,
          primaryTextColor: currentTheme?.primaryTextColor || defaultTheme.primaryTextColor,
          secondaryTextColor: currentTheme?.secondaryTextColor || defaultTheme.secondaryTextColor,
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

        const handleReset = () => {
          setTheme(defaultTheme);
          // Save immediately when reset
          onSave(defaultTheme);
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

          // Buttons - Save and Reset
          React.createElement('div', { className: "mt-6 flex justify-between" },
            React.createElement('button', {
              type: "button",
              onClick: handleReset,
              className: "theme-reset-button px-4 py-2"
            }, "Herstel Standaard"),
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
      };

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
        SubtaskCompletionDialog,
        UserManagement,
        WeekDayPicker,
        MonthDayPicker,
        ThemeSettings
      };
  }
})();