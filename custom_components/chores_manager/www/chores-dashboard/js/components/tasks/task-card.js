/**
 * COMPLETE TaskCard Component - Main task display card
 * This file was MISSING - that's why TaskCard wasn't loading!
 */

(function() {
    'use strict';
    
    if (!window.React) {
        console.error('TaskCard requires React');
        return;
    }
    
    const { useState, useCallback } = React;
    const h = React.createElement;
    
    /**
     * Complete TaskCard Component - Displays a single chore/task
     */
    const TaskCard = function({
        chore = {},
        onComplete,
        onEdit,
        onDelete,
        assignees = [],
        showEditDelete = true,
        isProcessing = false
    }) {
        // State management
        const [showConfirm, setShowConfirm] = useState(false);
        const [showSubtaskConfirm, setShowSubtaskConfirm] = useState(false);
        const [showDescription, setShowDescription] = useState(false);
        const [localProcessing, setLocalProcessing] = useState(false);
        
        // Combine processing states
        const isDisabled = isProcessing || localProcessing;
        
        // Extract chore properties with defaults
        const {
            id,
            chore_id,
            name = 'Unnamed Task',
            icon = '📋',
            priority = 'Middel',
            assigned_to = 'Wie kan',
            is_overdue = false,
            days_until = null,
            description = '',
            has_subtasks = false,
            subtasks = [],
            completed_subtasks_count = 0,
            frequency_type = '',
            frequency_days = 7,
            duration = 15
        } = chore;
        
        const choreId = id || chore_id;
        const hasDescription = description && description.trim().length > 0;
        
        // Filter assignees (remove "Wie kan" if it exists as a user)
        const availableAssignees = assignees.filter(a => {
            const name = a.name || a;
            return name !== 'Wie kan';
        });
        
        // Handlers
        const handleComplete = useCallback(() => {
            if (has_subtasks && subtasks && subtasks.length > 0) {
                setShowSubtaskConfirm(true);
            } else {
                setShowConfirm(true);
            }
        }, [has_subtasks, subtasks]);
        
        const handleConfirmComplete = useCallback(async (userId) => {
            setShowConfirm(false);
            setLocalProcessing(true);
            
            try {
                if (onComplete) {
                    await onComplete(choreId, userId);
                }
            } catch (error) {
                console.error('Error completing task:', error);
            } finally {
                setLocalProcessing(false);
            }
        }, [choreId, onComplete]);
        
        const handleSubtaskCompletion = useCallback(async (selectedSubtasks, userId) => {
            setShowSubtaskConfirm(false);
            setLocalProcessing(true);
            
            try {
                // Handle subtask completion logic here
                if (window.ChoresAPI?.chores?.completeSubtask) {
                    for (const subtaskId of selectedSubtasks) {
                        await window.ChoresAPI.chores.completeSubtask(subtaskId, userId);
                    }
                }
                
                // Refresh if possible
                if (window.refreshChoresData) {
                    await window.refreshChoresData();
                }
            } catch (error) {
                console.error('Error completing subtasks:', error);
            } finally {
                setLocalProcessing(false);
            }
        }, []);
        
        const toggleDescription = useCallback(() => {
            setShowDescription(prev => !prev);
        }, []);
        
        // Get assignee color
        const getAssigneeColor = (assignee) => {
            if (!assignee || assignee === 'Wie kan') return '#e5e7eb';
            const colors = ['#dbeafe', '#fef3c7', '#d1fae5', '#fde2e8', '#e0e7ff', '#fed7d7'];
            const hash = assignee.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return colors[hash % colors.length];
        };
        
        // Format frequency
        const formatFrequency = () => {
            if (frequency_type === 'Dagelijks') return 'Dagelijks';
            if (frequency_type === 'Wekelijks') return 'Wekelijks';
            if (frequency_type === 'Maandelijks') return 'Maandelijks';
            if (frequency_days === 1) return 'Dagelijks';
            if (frequency_days === 7) return 'Wekelijks';
            if (frequency_days < 7) return `Elke ${frequency_days} dagen`;
            if (frequency_days < 30) return `Elke ${Math.round(frequency_days/7)} weken`;
            return `Elke ${Math.round(frequency_days/30)} maanden`;
        };
        
        // Main render
        return h('div', {
            className: `task-card p-4 mb-3 border rounded-lg shadow-sm transition-all ${
                is_overdue ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
            } ${isDisabled ? 'opacity-50' : 'hover:shadow-md'}`,
            'data-chore-id': choreId
        },
            // Header row
            h('div', { className: 'flex items-start justify-between mb-2' },
                // Left side - icon and info
                h('div', { className: 'flex items-center flex-1' },
                    h('span', { className: 'text-2xl mr-3' }, icon),
                    h('div', { className: 'flex-1' },
                        h('h3', { className: 'font-semibold text-lg' }, name),
                        h('div', { className: 'flex flex-wrap gap-2 mt-1' },
                            // Priority indicator
                            window.choreComponents?.PriorityIndicator && h(window.choreComponents.PriorityIndicator, { priority }),
                            
                            // Frequency
                            h('span', { className: 'text-xs px-2 py-1 bg-gray-100 rounded' }, formatFrequency()),
                            
                            // Assignee
                            h('span', {
                                className: 'text-xs px-2 py-1 rounded',
                                style: { backgroundColor: getAssigneeColor(assigned_to) }
                            }, assigned_to),
                            
                            // Status badges
                            is_overdue && h('span', { className: 'text-xs px-2 py-1 bg-red-500 text-white rounded' }, 'Te laat'),
                            days_until !== null && days_until <= 0 && !is_overdue && 
                                h('span', { className: 'text-xs px-2 py-1 bg-green-500 text-white rounded' }, 'Vandaag')
                        )
                    )
                ),
                
                // Right side - action buttons
                h('div', { className: 'flex items-center gap-2' },
                    // Complete button
                    h('button', {
                        onClick: handleComplete,
                        disabled: isDisabled,
                        className: `px-3 py-1 rounded transition-colors ${
                            isDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white'
                        }`
                    }, '✓'),
                    
                    // Edit button
                    showEditDelete && onEdit && h('button', {
                        onClick: () => onEdit(chore),
                        disabled: isDisabled,
                        className: `px-3 py-1 rounded transition-colors ${
                            isDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`
                    }, '✏️')
                )
            ),
            
            // Subtasks progress
            has_subtasks && subtasks && subtasks.length > 0 && h('div', { className: 'mt-2' },
                window.choreComponents?.SubtaskProgress ? 
                    h(window.choreComponents.SubtaskProgress, { subtasks }) :
                    h('div', { className: 'text-sm text-gray-600' },
                        `${subtasks.filter(s => s.completed).length}/${subtasks.length} subtaken voltooid`
                    )
            ),
            
            // Description toggle
            hasDescription && h('div', { className: 'mt-2' },
                h('button', {
                    onClick: toggleDescription,
                    className: 'text-sm text-blue-600 hover:text-blue-800'
                }, showDescription ? 'Verberg beschrijving' : 'Toon beschrijving')
            ),
            
            // Description content
            hasDescription && showDescription && h('div', { className: 'mt-3 p-3 bg-gray-50 rounded' },
                window.choreComponents?.TaskDescription ? 
                    h(window.choreComponents.TaskDescription, {
                        description,
                        choreId,
                        inTaskCard: true
                    }) : 
                    h('p', { className: 'text-sm text-gray-700' }, description)
            ),
            
            // Completion confirm dialog
            showConfirm && (window.choreComponents?.CompletionConfirmDialog ? 
                h(window.choreComponents.CompletionConfirmDialog, {
                    isOpen: true,
                    title: "Taak voltooien",
                    message: `Markeer "${name}" als voltooid:`,
                    onConfirm: handleConfirmComplete,
                    onCancel: () => setShowConfirm(false),
                    assignees: availableAssignees,
                    defaultUser: assigned_to
                }) :
                h('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' },
                    h('div', { className: 'bg-white p-6 rounded-lg max-w-md' },
                        h('h3', { className: 'text-lg font-medium mb-4' }, 'Taak voltooien'),
                        h('p', { className: 'mb-4' }, `Markeer "${name}" als voltooid?`),
                        h('div', { className: 'flex justify-end gap-2' },
                            h('button', {
                                onClick: () => setShowConfirm(false),
                                className: 'px-4 py-2 bg-gray-300 rounded'
                            }, 'Annuleren'),
                            h('button', {
                                onClick: () => handleConfirmComplete(assigned_to),
                                className: 'px-4 py-2 bg-green-500 text-white rounded'
                            }, 'Voltooien')
                        )
                    )
                )
            ),
            
            // Subtask completion dialog
            showSubtaskConfirm && (window.choreComponents?.SubtaskCompletionDialog ?
                h(window.choreComponents.SubtaskCompletionDialog, {
                    isOpen: true,
                    chore,
                    onComplete: handleSubtaskCompletion,
                    onCancel: () => setShowSubtaskConfirm(false),
                    assignees: availableAssignees,
                    defaultUser: assigned_to
                }) :
                h('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' },
                    h('div', { className: 'bg-white p-6 rounded-lg max-w-md' },
                        h('h3', { className: 'text-lg font-medium mb-4' }, 'Subtaken voltooien'),
                        h('p', { className: 'mb-4' }, 'Subtask dialog niet beschikbaar'),
                        h('button', {
                            onClick: () => setShowSubtaskConfirm(false),
                            className: 'px-4 py-2 bg-gray-300 rounded'
                        }, 'Sluiten')
                    )
                )
            )
        );
    };
    
    // Export component
    window.choreComponents = window.choreComponents || {};
    window.choreComponents.TaskCard = TaskCard;
    
    console.log('✅ TaskCard component loaded successfully');
})();