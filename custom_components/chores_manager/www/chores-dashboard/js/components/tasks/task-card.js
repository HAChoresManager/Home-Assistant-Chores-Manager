/**
 * TaskCard Component - Main task display card
 * Split from the original large tasks.js file for better maintainability
 */

(function() {
    'use strict';
    
    const { useState, useCallback, useMemo } = React;
    const h = React.createElement;
    
    /**
     * TaskCard Component - Displays a single chore/task
     * Handles completion, subtasks, and descriptions
     */
    const TaskCard = ({
        chore,
        onComplete,
        onShowDescription,
        onEdit,
        onDelete,
        assignees = [],
        showEditDelete = true,
        isProcessing = false
    }) => {
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
            frequency_days = 7
        } = chore || {};
        
        // Computed properties
        const hasDescription = description && description.trim().length > 0;
        const availableAssignees = useMemo(() => {
            return assignees.filter(a => a.active !== false);
        }, [assignees]);
        
        // Get assignee color
        const getAssigneeColor = useCallback((assigneeName) => {
            const assignee = assignees.find(a => a.name === assigneeName);
            return assignee?.color || '#CCCCCC';
        }, [assignees]);
        
        // Format frequency display
        const formatFrequency = useCallback(() => {
            if (frequency_type === 'Dagelijks') return 'Dagelijks';
            if (frequency_type === 'Wekelijks') {
                if (frequency_days === 7) return 'Wekelijks';
                if (frequency_days === 14) return '2-wekelijks';
                return `Elke ${frequency_days} dagen`;
            }
            if (frequency_type === 'Maandelijks') return 'Maandelijks';
            return frequency_type || `Elke ${frequency_days} dagen`;
        }, [frequency_type, frequency_days]);
        
        // Event handlers
        const handleComplete = useCallback(() => {
            if (!has_subtasks || completed_subtasks_count === 0) {
                setShowConfirm(true);
            } else {
                setShowSubtaskConfirm(true);
            }
        }, [has_subtasks, completed_subtasks_count]);
        
        const handleConfirmComplete = useCallback(async (selectedUser) => {
            setShowConfirm(false);
            setLocalProcessing(true);
            
            try {
                await onComplete(id, selectedUser);
            } catch (error) {
                console.error('Error completing task:', error);
            } finally {
                setLocalProcessing(false);
            }
        }, [id, onComplete]);
        
        const handleSubtaskCompletion = useCallback(async (subtaskId, completedBy) => {
            setShowSubtaskConfirm(false);
            setLocalProcessing(true);
            
            try {
                if (window.ChoresAPI && window.ChoresAPI.chores) {
                    await window.ChoresAPI.chores.completeSubtask(subtaskId, completedBy);
                    // Refresh the UI
                    if (window.refreshChoresData) {
                        await window.refreshChoresData();
                    }
                }
            } catch (error) {
                console.error('Error completing subtask:', error);
            } finally {
                setLocalProcessing(false);
            }
        }, []);
        
        const toggleDescription = useCallback(() => {
            setShowDescription(prev => !prev);
        }, []);
        
        // Render priority indicator
        const renderPriorityIndicator = () => {
            if (!window.choreComponents?.PriorityIndicator) return null;
            return h(window.choreComponents.PriorityIndicator, { priority });
        };
        
        // Render subtasks progress
        const renderSubtasksProgress = () => {
            if (!has_subtasks || !subtasks?.length) return null;
            
            const completedCount = subtasks.filter(st => st.completed).length;
            const totalCount = subtasks.length;
            const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
            
            return h('div', { className: 'subtasks-progress mt-2' },
                h('div', { className: 'flex justify-between items-center mb-1' },
                    h('span', { className: 'text-xs text-gray-600' }, 
                        `Subtaken: ${completedCount}/${totalCount}`
                    ),
                    h('span', { className: 'text-xs text-gray-600' }, 
                        `${Math.round(percentage)}%`
                    )
                ),
                h('div', { className: 'w-full bg-gray-200 rounded-full h-2' },
                    h('div', {
                        className: 'bg-blue-500 h-2 rounded-full transition-all duration-300',
                        style: { width: `${percentage}%` }
                    })
                )
            );
        };
        
        // Main render
        return h('div', {
            className: `task-card p-4 mb-3 border rounded-lg shadow-sm transition-all duration-200 
                       ${is_overdue ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
                       ${isDisabled ? 'opacity-50' : 'hover:shadow-md'}`,
            'data-chore-id': id
        },
            // Header
            h('div', { className: 'flex items-start justify-between mb-2' },
                h('div', { className: 'flex items-center flex-1' },
                    // Icon
                    h('span', { className: 'text-2xl mr-3' }, icon),
                    
                    // Title and metadata
                    h('div', { className: 'flex-1' },
                        h('h3', { className: 'font-semibold text-lg' }, name),
                        
                        // Metadata row
                        h('div', { className: 'flex flex-wrap gap-2 mt-1' },
                            renderPriorityIndicator(),
                            
                            // Frequency badge
                            h('span', { className: 'text-xs px-2 py-1 bg-gray-100 rounded' },
                                formatFrequency()
                            ),
                            
                            // Assignee badge
                            h('span', {
                                className: 'text-xs px-2 py-1 rounded',
                                style: { backgroundColor: getAssigneeColor(assigned_to) }
                            }, assigned_to),
                            
                            // Status badge
                            is_overdue && h('span', { 
                                className: 'text-xs px-2 py-1 bg-red-500 text-white rounded' 
                            }, 'Te laat'),
                            
                            days_until !== null && days_until <= 0 && !is_overdue && 
                            h('span', { 
                                className: 'text-xs px-2 py-1 bg-green-500 text-white rounded' 
                            }, 'Vandaag')
                        )
                    )
                ),
                
                // Action buttons
                h('div', { className: 'flex items-center gap-2' },
                    // Complete button
                    h('button', {
                        onClick: handleComplete,
                        disabled: isDisabled,
                        className: `px-3 py-1 rounded transition-colors
                                   ${isDisabled ? 'bg-gray-300 cursor-not-allowed' : 
                                     'bg-green-500 hover:bg-green-600 text-white'}`
                    }, '✓'),
                    
                    // Edit button
                    showEditDelete && onEdit && h('button', {
                        onClick: () => onEdit(chore),
                        disabled: isDisabled,
                        className: 'p-1 text-blue-500 hover:text-blue-700 disabled:text-gray-400'
                    }, '✏️'),
                    
                    // Delete button
                    showEditDelete && onDelete && h('button', {
                        onClick: () => onDelete(id),
                        disabled: isDisabled,
                        className: 'p-1 text-red-500 hover:text-red-700 disabled:text-gray-400'
                    }, '🗑️')
                )
            ),
            
            // Subtasks progress
            renderSubtasksProgress(),
            
            // Description toggle
            hasDescription && h('button', {
                onClick: toggleDescription,
                className: 'mt-2 text-sm text-blue-500 hover:text-blue-700'
            }, showDescription ? 'Verberg beschrijving' : 'Toon beschrijving'),
            
            // Description content
            hasDescription && showDescription && h('div', {
                className: 'mt-3 p-3 bg-gray-50 rounded'
            },
                window.choreComponents?.TaskDescription ? 
                h(window.choreComponents.TaskDescription, {
                    description,
                    choreId: id,
                    onSave: onShowDescription,
                    onClose: toggleDescription,
                    inTaskCard: true
                }) : h('p', { className: 'text-sm text-gray-700' }, description)
            ),
            
            // Dialogs
            window.choreComponents?.CompletionConfirmDialog && h(
                window.choreComponents.CompletionConfirmDialog, {
                    isOpen: showConfirm,
                    title: "Taak voltooien",
                    message: `Markeer "${name}" als voltooid:`,
                    onConfirm: handleConfirmComplete,
                    onCancel: () => setShowConfirm(false),
                    assignees: availableAssignees,
                    defaultUser: assigned_to
                }
            ),
            
            has_subtasks && window.choreComponents?.SubtaskCompletionDialog && h(
                window.choreComponents.SubtaskCompletionDialog, {
                    isOpen: showSubtaskConfirm,
                    chore,
                    onComplete: handleSubtaskCompletion,
                    onCancel: () => setShowSubtaskConfirm(false),
                    assignees: availableAssignees,
                    defaultUser: assigned_to
                }
            )
        );
    };
    
    // Export component
    window.choreComponents = window.choreComponents || {};
    window.choreComponents.TaskCard = TaskCard;
    
    console.log('TaskCard component loaded successfully');
})();