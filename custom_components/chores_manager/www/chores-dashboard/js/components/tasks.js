/**
 * COMPLETELY FIXED Task-related components for the Chores Manager
 * FIXED: Removed TaskCard duplication (now in separate file), kept utility components
 * Includes TaskDescription, PriorityIndicator, and other task-related utilities
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React) {
        console.error('Task components require React');
        return;
    }

    const h = React.createElement;
    const { useState, useCallback, useEffect } = React;

    /**
     * Priority indicator component with enhanced visuals
     */
    const PriorityIndicator = ({ priority = 'Middel' }) => {
        const priorityMap = {
            'Laag': { 
                symbol: '○', 
                color: 'text-gray-400', 
                bg: 'bg-gray-100',
                title: 'Lage prioriteit'
            },
            'Middel': { 
                symbol: '◐', 
                color: 'text-yellow-600', 
                bg: 'bg-yellow-100',
                title: 'Middel prioriteit'
            },
            'Hoog': { 
                symbol: '●', 
                color: 'text-red-600', 
                bg: 'bg-red-100',
                title: 'Hoge prioriteit'
            }
        };

        const config = priorityMap[priority] || priorityMap['Middel'];

        return h('span', {
            className: `inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bg} border`,
            title: config.title
        },
            h('span', { className: `${config.color} font-bold text-sm` }, config.symbol)
        );
    };

    /**
     * Enhanced task description display/edit component
     */
    const TaskDescription = ({ 
        description = '', 
        choreId, 
        onSave, 
        onClose, 
        inTaskCard = false,
        editable = false,
        maxLength = 1000
    }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [editedDescription, setEditedDescription] = useState(description);
        const [saving, setSaving] = useState(false);
        const [error, setError] = useState(null);

        // Update local state when description prop changes
        useEffect(() => {
            setEditedDescription(description);
        }, [description]);

        const handleSave = useCallback(async () => {
            if (!onSave) return;
            
            setSaving(true);
            setError(null);
            
            try {
                await onSave(editedDescription.trim());
                setIsEditing(false);
            } catch (err) {
                setError(`Failed to save description: ${err.message}`);
                console.error('Error saving description:', err);
            } finally {
                setSaving(false);
            }
        }, [editedDescription, onSave]);

        const handleCancel = useCallback(() => {
            setEditedDescription(description);
            setIsEditing(false);
            setError(null);
        }, [description]);

        const handleKeyDown = useCallback((e) => {
            if (e.key === 'Escape') {
                handleCancel();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSave();
            }
        }, [handleCancel, handleSave]);

        const containerClass = inTaskCard 
            ? "p-3 bg-gray-50 border-t" 
            : "p-4 bg-white border border-gray-200 rounded-lg";

        return h('div', { className: containerClass },
            // Header
            h('div', { className: "flex items-center justify-between mb-2" },
                h('h4', { className: "font-medium text-gray-900" }, "Beschrijving"),
                
                // Action buttons
                h('div', { className: "flex gap-2" },
                    editable && !isEditing && h('button', {
                        onClick: () => setIsEditing(true),
                        className: "text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors",
                        disabled: saving
                    }, "Bewerken"),
                    
                    onClose && h('button', {
                        onClick: onClose,
                        className: "text-lg text-gray-400 hover:text-gray-600 leading-none",
                        disabled: saving
                    }, "×")
                )
            ),
            
            // Error display
            error && h('div', { className: "mb-3 p-2 bg-red-100 text-red-700 text-sm rounded" },
                error
            ),
            
            // Content
            isEditing ? h('div', { className: "space-y-3" },
                // Textarea for editing
                h('div', { className: "relative" },
                    h('textarea', {
                        value: editedDescription,
                        onChange: (e) => {
                            if (e.target.value.length <= maxLength) {
                                setEditedDescription(e.target.value);
                            }
                        },
                        onKeyDown: handleKeyDown,
                        className: "w-full p-3 border border-gray-300 rounded-lg resize-vertical min-h-[100px] text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        placeholder: "Voer taakbeschrijving in...",
                        disabled: saving
                    }),
                    h('div', { className: "absolute bottom-2 right-2 text-xs text-gray-400" },
                        `${editedDescription.length}/${maxLength}`
                    )
                ),
                
                // Help text
                h('p', { className: "text-xs text-gray-500" },
                    "Tip: Druk Ctrl+Enter om op te slaan, Escape om te annuleren"
                ),
                
                // Save/Cancel buttons
                h('div', { className: "flex gap-2 justify-end" },
                    h('button', {
                        onClick: handleCancel,
                        className: "px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors",
                        disabled: saving
                    }, "Annuleren"),
                    h('button', {
                        onClick: handleSave,
                        className: `px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors ${saving ? 'opacity-50 cursor-not-allowed' : ''}`,
                        disabled: saving || editedDescription.trim() === description.trim()
                    }, saving ? "Opslaan..." : "Opslaan")
                )
            ) : h('div', { className: "text-sm text-gray-700" },
                description ? 
                    h('div', { 
                        className: "whitespace-pre-wrap break-words",
                        dangerouslySetInnerHTML: { 
                            __html: description
                                .replace(/\n/g, '<br>')
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        }
                    }) :
                    h('p', { className: "text-gray-500 italic" }, "Geen beschrijving beschikbaar")
            )
        );
    };

    /**
     * Task status badge component with enhanced styling
     */
    const TaskStatusBadge = ({ isOverdue, daysUntil, isCompleted = false, className = '' }) => {
        if (isCompleted) {
            return h('span', { 
                className: `text-xs px-2 py-1 bg-green-500 text-white rounded font-medium ${className}` 
            }, '✓ Voltooid');
        }
        
        if (isOverdue) {
            return h('span', { 
                className: `text-xs px-2 py-1 bg-red-500 text-white rounded font-medium ${className}` 
            }, '⚠ Te laat');
        }
        
        if (daysUntil !== null && daysUntil <= 0) {
            return h('span', { 
                className: `text-xs px-2 py-1 bg-orange-500 text-white rounded font-medium ${className}` 
            }, '🔥 Vandaag');
        }
        
        if (daysUntil === 1) {
            return h('span', { 
                className: `text-xs px-2 py-1 bg-yellow-500 text-white rounded font-medium ${className}` 
            }, '⏰ Morgen');
        }
        
        if (daysUntil > 1 && daysUntil <= 7) {
            return h('span', { 
                className: `text-xs px-2 py-1 bg-blue-500 text-white rounded font-medium ${className}` 
            }, `📅 Over ${daysUntil} dagen`);
        }
        
        return null;
    };

    /**
     * Task frequency display component with enhanced formatting
     */
    const TaskFrequencyBadge = ({ frequencyType, frequencyDays, className = '' }) => {
        let displayText = '';
        let icon = '🔄';
        
        switch (frequencyType?.toLowerCase()) {
            case 'daily':
            case 'dagelijks':
                displayText = 'Dagelijks';
                icon = '📅';
                break;
            case 'weekly':
            case 'wekelijks':
                displayText = 'Wekelijks';
                icon = '📆';
                break;
            case 'monthly':
            case 'maandelijks':
                displayText = 'Maandelijks';
                icon = '🗓️';
                break;
            case 'yearly':
            case 'jaarlijks':
                displayText = 'Jaarlijks';
                icon = '📊';
                break;
            case 'custom':
            case 'aangepast':
                if (frequencyDays) {
                    if (frequencyDays === 1) {
                        displayText = 'Dagelijks';
                        icon = '📅';
                    } else if (frequencyDays === 7) {
                        displayText = 'Wekelijks';
                        icon = '📆';
                    } else if (frequencyDays < 7) {
                        displayText = `Elke ${frequencyDays} dagen`;
                        icon = '🔄';
                    } else if (frequencyDays < 30) {
                        const weeks = Math.round(frequencyDays / 7);
                        displayText = `Elke ${weeks} weken`;
                        icon = '📆';
                    } else {
                        const months = Math.round(frequencyDays / 30);
                        displayText = `Elke ${months} maanden`;
                        icon = '🗓️';
                    }
                } else {
                    displayText = 'Aangepast';
                    icon = '⚙️';
                }
                break;
            default:
                displayText = frequencyDays ? `Elke ${frequencyDays} dagen` : 'Eenmalig';
                icon = frequencyDays ? '🔄' : '📋';
        }
        
        return h('span', { 
            className: `text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded border ${className}`,
            title: `Frequentie: ${displayText}`
        }, `${icon} ${displayText}`);
    };

    /**
     * Task assignee badge component with enhanced visuals
     */
    const TaskAssigneeBadge = ({ assignedTo = 'Wie kan', userColor = null, className = '' }) => {
        // Generate a consistent color based on assignee name if no color provided
        const getAssigneeColor = (name) => {
            if (userColor) return userColor;
            if (!name || name === 'Wie kan') return '#e5e7eb'; // gray-200
            
            const colors = [
                '#dbeafe', '#fef3c7', '#d1fae5', '#fde2e8', 
                '#e0e7ff', '#fed7d7', '#f0fff4', '#fefcbf',
                '#e0f2fe', '#f3e8ff', '#fef7cd', '#ecfdf5'
            ];
            
            const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return colors[hash % colors.length];
        };

        const backgroundColor = getAssigneeColor(assignedTo);
        const isDark = backgroundColor === '#fed7d7' || backgroundColor === '#fde2e8';

        return h('span', {
            className: `text-xs px-2 py-1 rounded border font-medium ${className}`,
            style: { 
                backgroundColor,
                color: isDark ? '#7f1d1d' : '#374151',
                borderColor: backgroundColor.replace('0.1', '0.3')
            },
            title: `Toegewezen aan: ${assignedTo}`
        }, `👤 ${assignedTo}`);
    };

    /**
     * Enhanced subtask progress indicator
     */
    const SubtaskProgress = ({ subtasks = [], showDetails = false, className = '' }) => {
        if (!subtasks || subtasks.length === 0) return null;
        
        const completedCount = subtasks.filter(st => st.completed || st.status === 'completed').length;
        const totalCount = subtasks.length;
        const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        
        const getProgressColor = (percent) => {
            if (percent === 100) return 'bg-green-500';
            if (percent >= 75) return 'bg-blue-500';
            if (percent >= 50) return 'bg-yellow-500';
            if (percent >= 25) return 'bg-orange-500';
            return 'bg-red-500';
        };

        return h('div', { className: `space-y-2 ${className}` },
            h('div', { className: 'flex justify-between items-center' },
                h('span', { className: 'text-xs text-gray-600 font-medium' }, 
                    `📝 Subtaken: ${completedCount}/${totalCount}`
                ),
                h('span', { className: 'text-xs text-gray-600' }, 
                    `${Math.round(percentage)}%`
                )
            ),
            h('div', { className: 'w-full bg-gray-200 rounded-full h-2' },
                h('div', {
                    className: `h-2 rounded-full transition-all duration-300 ${getProgressColor(percentage)}`,
                    style: { width: `${percentage}%` }
                })
            ),
            
            // Optional detailed subtask list
            showDetails && h('div', { className: 'mt-2 space-y-1' },
                subtasks.map((subtask, index) => {
                    const name = subtask.name || subtask;
                    const completed = subtask.completed || subtask.status === 'completed';
                    
                    return h('div', { 
                        key: index, 
                        className: `flex items-center text-xs ${completed ? 'text-green-600' : 'text-gray-600'}` 
                    },
                        h('span', { className: 'mr-2' }, completed ? '✓' : '○'),
                        h('span', { className: completed ? 'line-through' : '' }, name)
                    );
                })
            )
        );
    };

    /**
     * Task metadata summary component
     */
    const TaskMetadata = ({ 
        priority, 
        frequencyType, 
        frequencyDays, 
        assignedTo, 
        userColor,
        isOverdue, 
        daysUntil, 
        isCompleted,
        subtasks,
        className = ''
    }) => {
        return h('div', { className: `flex flex-wrap gap-2 ${className}` },
            h(PriorityIndicator, { priority }),
            h(TaskFrequencyBadge, { frequencyType, frequencyDays }),
            h(TaskAssigneeBadge, { assignedTo, userColor }),
            h(TaskStatusBadge, { isOverdue, daysUntil, isCompleted }),
            subtasks && subtasks.length > 0 && h(SubtaskProgress, { subtasks })
        );
    };

    /**
     * Task duration indicator
     */
    const TaskDuration = ({ duration, className = '' }) => {
        if (!duration) return null;
        
        const formatDuration = (minutes) => {
            if (minutes < 60) return `${minutes}min`;
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0 ? `${hours}u ${remainingMinutes}min` : `${hours}u`;
        };

        return h('span', {
            className: `text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border ${className}`,
            title: `Geschatte duur: ${formatDuration(duration)}`
        }, `⏱️ ${formatDuration(duration)}`);
    };

    // Export all components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        TaskDescription,
        PriorityIndicator,
        TaskStatusBadge,
        TaskFrequencyBadge,
        TaskAssigneeBadge,
        SubtaskProgress,
        TaskMetadata,
        TaskDuration
    });
    
    console.log('✅ FIXED Task utility components loaded successfully (TaskCard excluded - managed separately)');
})();