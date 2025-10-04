/**
 * FIXED TaskCard Component - Properly handles dialog state through callbacks
 * Uses app-level state management for dialogs instead of local rendering
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
     * Fixed TaskCard Component - Displays a single chore/task
     * Dialogs are triggered via callbacks to app-level state
     */
    const TaskCard = function({
        chore = {},
        onComplete,
        onEdit,
        onDelete,
        onCompleteClick, // New: Callback to trigger completion dialog at app level
        onSubtaskClick,  // New: Callback to trigger subtask dialog at app level
        assignees = [],
        showEditDelete = true,
        isProcessing = false
    }) {
        // Local state only for UI interactions, not dialogs
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
        
        // Filter active subtasks
        const activeSubtasks = subtasks?.filter(st => !st.is_completed) || [];
        const completedCount = completed_subtasks_count || 0;
        const totalSubtasks = subtasks?.length || 0;
        
        // Handle complete button click - triggers app-level dialog
        const handleCompleteClick = useCallback(() => {
            if (isDisabled) return;
            
            // If we have the new callback, use it to trigger app-level dialog
            if (onCompleteClick) {
                onCompleteClick({
                    choreId,
                    name,
                    defaultUser: assigned_to
                });
            } else if (onComplete) {
                // Fallback: direct completion without dialog
                setLocalProcessing(true);
                onComplete(choreId, assigned_to)
                    .finally(() => setLocalProcessing(false));
            }
        }, [choreId, name, assigned_to, isDisabled, onComplete, onCompleteClick]);
        
        // Handle subtask completion - triggers app-level dialog
        const handleSubtaskClick = useCallback(() => {
            if (isDisabled || !has_subtasks) return;
            
            if (onSubtaskClick) {
                onSubtaskClick(chore);
            }
        }, [chore, has_subtasks, isDisabled, onSubtaskClick]);
        
        // Priority colors
        const priorityColors = {
            'Laag': 'text-green-600',
            'Middel': 'text-yellow-600',
            'Hoog': 'text-red-600'
        };
        
        // Assignee background colors
        const assigneeColors = {
            'Laura': 'bg-laura',
            'Martijn': 'bg-martijn',
            'Samen': 'bg-samen',
            'Wie kan': 'bg-wie-kan'
        };
        
        // Status styling
        const getStatusClasses = () => {
            if (is_overdue) return 'border-red-500 bg-red-50';
            if (days_until === 0) return 'border-yellow-500 bg-yellow-50';
            return 'border-gray-200 hover:shadow-md';
        };
        
        // Format due date display
        const getDueDisplay = () => {
            if (days_until === null) return '';
            if (days_until < 0) return `${Math.abs(days_until)} dagen te laat`;
            if (days_until === 0) return 'Vandaag';
            if (days_until === 1) return 'Morgen';
            return `Over ${days_until} dagen`;
        };
        
        return h('div', { 
            className: `task-card bg-white rounded-lg shadow-sm border-2 transition-all duration-200 ${getStatusClasses()} ${isDisabled ? 'opacity-75' : ''}`,
            style: { position: 'relative' }
        },
            // Card content
            h('div', { className: 'p-4' },
                // Header row
                h('div', { className: 'task-header mb-3' },
                    // Icon and title
                    h('div', { className: 'flex items-start flex-1 min-w-0' },
                        h('span', { className: 'task-card-icon mr-3 flex-shrink-0' }, icon),
                        h('div', { className: 'flex-1 min-w-0' },
                            h('h3', { className: 'task-title text-lg' }, name),
                            
                            // Metadata
                            h('div', { className: 'flex flex-wrap items-center gap-2 mt-1 text-sm' },
                                // Priority
                                h('span', { className: `font-medium ${priorityColors[priority]}` }, 
                                    `⚡ ${priority}`
                                ),
                                
                                // Assignee
                                h('span', { 
                                    className: `px-2 py-0.5 rounded ${assigneeColors[assigned_to] || 'bg-gray-100'}` 
                                }, assigned_to),
                                
                                // Due date
                                getDueDisplay() && h('span', { 
                                    className: `font-medium ${is_overdue ? 'text-red-600' : days_until === 0 ? 'text-yellow-600' : 'text-gray-600'}` 
                                }, getDueDisplay()),
                                
                                // Duration
                                duration && h('span', { className: 'text-gray-500' }, `⏱️ ${duration} min`)
                            ),
                            
                            // Subtasks progress
                            has_subtasks && h('div', { className: 'mt-2' },
                                h('div', { className: 'flex items-center justify-between mb-1' },
                                    h('span', { className: 'text-sm text-gray-600' }, 
                                        `Subtaken: ${completedCount}/${totalSubtasks}`
                                    )
                                ),
                                h('div', { className: 'w-full bg-gray-200 rounded-full h-2' },
                                    h('div', { 
                                        className: 'bg-blue-500 h-2 rounded-full transition-all duration-300',
                                        style: { width: `${totalSubtasks > 0 ? (completedCount / totalSubtasks * 100) : 0}%` }
                                    })
                                )
                            )
                        )
                    ),
                    
                    // Action buttons
                    h('div', { className: 'task-actions' },
                        // Complete button
                        h('button', {
                            className: `px-3 py-1.5 rounded text-white font-medium transition-colors ${
                                has_subtasks && activeSubtasks.length > 0 ? 
                                'bg-blue-500 hover:bg-blue-600' : 
                                'bg-green-500 hover:bg-green-600'
                            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`,
                            onClick: has_subtasks && activeSubtasks.length > 0 ? handleSubtaskClick : handleCompleteClick,
                            disabled: isDisabled
                        }, 
                            isDisabled ? '⏳' : 
                            has_subtasks && activeSubtasks.length > 0 ? '📝' : '✓'
                        ),
                        
                        // Edit button
                        showEditDelete && onEdit && h('button', {
                            className: `ml-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded transition-colors ${
                                isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`,
                            onClick: () => !isDisabled && onEdit(chore),
                            disabled: isDisabled
                        }, '✏️'),
                        
                        // Delete button
                        showEditDelete && onDelete && h('button', {
                            className: `ml-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded transition-colors ${
                                isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`,
                            onClick: () => !isDisabled && onDelete(choreId),
                            disabled: isDisabled
                        }, '🗑️')
                    )
                ),
                
                // Description section
                hasDescription && h('div', { className: 'mt-3 pt-3 border-t' },
                    h('button', {
                        className: 'text-sm text-blue-600 hover:text-blue-700 flex items-center',
                        onClick: () => setShowDescription(!showDescription)
                    }, 
                        h('span', { className: 'mr-1' }, showDescription ? '▼' : '▶'),
                        'Beschrijving'
                    ),
                    showDescription && h('div', { className: 'mt-2 text-sm text-gray-700 whitespace-pre-wrap' },
                        description
                    )
                )
            )
        );
    };
    
    // Export component
    window.choreComponents = window.choreComponents || {};
    window.choreComponents.TaskCard = TaskCard;
    
    console.log('✅ FIXED TaskCard component - uses app-level dialog management');
})();