/**
 * Task-related components for the Chores Manager
 * Includes TaskCard, TaskList, and task-related utilities
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React || !window.choreUtils) {
        console.error('Task components require React and choreUtils');
        return;
    }

    const h = React.createElement;

    /**
     * Priority indicator component
     */
    const PriorityIndicator = ({ priority }) => {
        const priorityMap = {
            'Laag': { symbol: '○', color: 'text-gray-400', bg: 'bg-gray-100' },
            'Middel': { symbol: '◐', color: 'text-yellow-600', bg: 'bg-yellow-100' },
            'Hoog': { symbol: '●', color: 'text-red-600', bg: 'bg-red-100' }
        };

        const config = priorityMap[priority] || priorityMap['Middel'];

        return h('span', {
            className: `inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bg}`,
            title: `Prioriteit: ${priority}`
        },
            h('span', { className: config.color }, config.symbol)
        );
    };

    /**
     * Task description display/edit component
     */
    const TaskDescription = ({ description, choreId, onSave, onClose, inTaskCard = false }) => {
        return h('div', { className: inTaskCard ? "p-3 bg-gray-50 border-t" : "p-4" },
            h('h3', { className: "font-medium mb-2" }, "Beschrijving"),
            h('div', { className: "mt-2 text-sm" },
                description ? h('div', { className: "text-gray-700 whitespace-pre-wrap" }, description) 
                           : h('div', { className: "text-gray-400 italic" }, "Geen beschrijving")
            ),
            !inTaskCard && h('div', { className: "flex justify-end mt-3" },
                h('button', {
                    className: "px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300",
                    onClick: onClose
                }, "Sluiten")
            )
        );
    };

    /**
     * Main TaskCard component - FIXED VERSION
     */
    const TaskCard = function({
        chore,
        onMarkDone,
        onEdit,
        onShowDescription,
        onToggleDescription,
        assignees = [],
        onMarkSubtaskDone
    }) {
        const [showConfirm, setShowConfirm] = React.useState(false);
        const [showDescription, setShowDescription] = React.useState(false);
        const [showSubtaskConfirm, setShowSubtaskConfirm] = React.useState(false);

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
            ? assignees.filter(a => a.name !== "Wie kan").map(a => a.name)
            : ["Laura", "Martijn", "Samen"];

        const handleMarkDone = () => {
            if (chore.assigned_to === "Wie kan" || (assignees.length > 1 && chore.assigned_to !== "Samen")) {
                setShowConfirm(true);
            } else {
                onMarkDone(id, chore.assigned_to);
            }
        };

        const handleConfirmComplete = (selectedUser) => {
            setShowConfirm(false);
            onMarkDone(id, selectedUser);
        };

        const handleSubtaskCompletion = (subtaskIndex, completedBy) => {
            setShowSubtaskConfirm(false);
            onMarkSubtaskDone(id, subtaskIndex, completedBy);
        };

        const toggleDescription = () => {
            const newState = !showDescription;
            setShowDescription(newState);
            if (onToggleDescription) {
                onToggleDescription(id, newState);
            }
        };

        return h('div', { className: "task-card-wrapper" },
            h('div', {
                className: `task-card ${dueStatusClass} ${isCompletedToday ? 'completed' : ''} 
                          ${isProcessing ? 'processing' : ''} ${bgColorClass}`,
                style: customStyle
            },
                // Card header
                h('div', { className: "flex items-start justify-between" },
                    // Task info
                    h('div', { className: "flex-1" },
                        h('div', { className: "flex items-center" },
                            h('span', { className: "task-icon mr-2" }, taskIcon),
                            h('h3', { className: "text-lg font-medium" }, chore.name)
                        ),
                        
                        // Task metadata
                        h('div', { className: "flex items-center mt-2 text-sm text-gray-600" },
                            h(PriorityIndicator, { priority: chore.priority }),
                            h('span', { className: "ml-3" }, chore.assigned_to),
                            h('span', { className: "ml-3" }, `${chore.duration} min`)
                        ),

                        // Due date info
                        h('div', { className: "mt-2 text-sm" },
                            isPastDue
                                ? h('span', { className: "text-red-600 font-medium" }, "Achterstallig")
                                : (isDueTodayValue
                                    ? h('span', { className: "text-green-600 font-medium" }, "Vandaag")
                                    : h('span', { className: "text-gray-500" }, 
                                        `Volgende: ${window.choreUtils.formatDate(nextDueDate)}`))
                        ),

                        // Completion info
                        isCompletedToday && h('div', { className: "mt-2 text-sm text-green-600" },
                            `✓ Voltooid door ${chore.last_done_by || chore.assigned_to}`
                        )
                    ),

                    // Action buttons
                    h('div', { className: "flex flex-col space-y-2 ml-4" },
                        !isCompletedToday && h('button', {
                            className: `px-3 py-1 rounded text-white ${isProcessing ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`,
                            onClick: handleMarkDone,
                            disabled: isProcessing
                        }, isProcessing ? "..." : "✓"),

                        h('button', {
                            className: "px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600",
                            onClick: () => onEdit(chore)
                        }, "✎")
                    )
                ),

                // Description toggle
                hasDescription && h('div', { className: "mt-3" },
                    h('button', {
                        className: "text-sm text-blue-600 hover:text-blue-800",
                        onClick: toggleDescription
                    }, showDescription ? "▲ Verberg beschrijving" : "▼ Toon beschrijving")
                ),

                // Subtasks
                hasSubtasks && h('div', { className: "mt-3 border-t pt-3" },
                    h('div', { className: "text-sm font-medium mb-2" }, "Subtaken:"),
                    h('div', { className: "space-y-1" },
                        chore.subtasks.map((subtask, index) =>
                            h('div', { 
                                key: index, 
                                className: "flex items-center justify-between text-sm" 
                            },
                                h('span', { 
                                    className: `flex-1 ${subtask.completed ? "line-through text-gray-500" : ""}` 
                                }, subtask.name),
                                !subtask.completed && h('button', {
                                    className: "ml-2 px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600",
                                    onClick: () => setShowSubtaskConfirm(true),
                                    disabled: isProcessing
                                }, "✓")
                            )
                        )
                    )
                )
            ),

            // Description section (expanded) - ensure no stray content
            hasDescription && showDescription && h('div', {
                className: `task-description expanded`,
                "data-chore-id": id,
                style: { marginLeft: '1rem', marginRight: '1rem' }
            },
                h(TaskDescription, {
                    description: chore.description,
                    choreId: id,
                    onSave: onShowDescription,
                    onClose: toggleDescription,
                    inTaskCard: true
                })
            ),

            // Dialogs
            h(window.choreComponents.CompletionConfirmDialog, {
                isOpen: showConfirm,
                title: "Taak voltooien",
                message: `Markeer "${chore.name}" als voltooid:`,
                onConfirm: handleConfirmComplete,
                onCancel: () => setShowConfirm(false),
                assignees: availableAssignees,
                defaultUser: chore.assigned_to
            }),

            hasSubtasks && h(window.choreComponents.SubtaskCompletionDialog, {
                isOpen: showSubtaskConfirm,
                chore: chore,
                onComplete: handleSubtaskCompletion,
                onCancel: () => setShowSubtaskConfirm(false),
                assignees: availableAssignees,
                defaultUser: chore.assigned_to
            })
        );
    };

    // Export components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        TaskCard,
        TaskDescription,
        PriorityIndicator
    });

    console.log('Task components loaded successfully');
})();