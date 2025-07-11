/**
 * Statistics components for the Chores Manager
 * Includes StatsCard, UserStatsCard, and theme settings
 */

(function() {
    'use strict';

    // Check dependencies
    if (!window.React || !window.choreUtils) {
        console.error('Stats components require React and choreUtils');
        return;
    }

    const h = React.createElement;

    /**
     * Basic statistics card component
     */
    const StatsCard = function({ title, value, color, desc }) {
        return h('div', { className: "bg-white rounded-lg p-4 shadow" },
            h('div', { className: "flex items-center" },
                h('span', { className: "text-gray-500 mr-2" }, desc),
                h('span', { className: "text-gray-500" }, title)
            ),
            h('p', {
                className: "text-3xl font-bold",
                style: { color: color }
            }, value)
        );
    };

    /**
     * User statistics card component
     */
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
            backgroundColor: `${assigneeObj.color}10`,
            borderColor: assigneeObj.color
        } : {};

        return h('div', {
            className: `bg-white rounded-lg p-4 shadow user-stats-card ${bgColorClass}`,
            style: customStyle
        },
            // Header with name and streak
            h('div', { className: "flex items-center justify-between mb-3" },
                h('h3', { className: "font-medium text-lg" }, assignee),
                hasStreak && h('div', {
                    className: "flex items-center text-orange-500",
                    title: `${streak} dagen achter elkaar`
                },
                    h('span', { className: "mr-1" }, "🔥"),
                    h('span', { className: "text-sm font-medium" }, streak)
                )
            ),

            // Task completion stats
            h('div', { className: "mb-3" },
                h('div', { className: "flex justify-between text-sm text-gray-600 mb-1" },
                    h('span', null, "Taken"),
                    h('span', null, `${completed}/${total} (${Math.round(completionPercentage)}%)`)
                ),
                h('div', { className: "progress-container" },
                    h('div', {
                        className: "progress-bar bg-blue-500",
                        style: { width: `${completionPercentage}%` }
                    })
                )
            ),

            // Time stats
            h('div', { className: "mb-3" },
                h('div', { className: "flex justify-between text-sm text-gray-600 mb-1" },
                    h('span', null, "Tijd"),
                    h('span', null, `${window.choreUtils.formatTime(timeCompleted)}/${window.choreUtils.formatTime(totalTime)}`)
                ),
                h('div', { className: "progress-container" },
                    h('div', {
                        className: "progress-bar bg-green-500",
                        style: { width: `${timePercentage}%` }
                    })
                )
            ),

            // Monthly stats
            h('div', { className: "text-xs text-gray-600 mt-2" },
                `Deze maand: ${stats.monthly_completed || 0} taken (${stats.monthly_percentage || 0}%)`
            )
        );
    };

    /**
     * Theme settings component
     */
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

            return h('div', { style: previewStyle, className: 'theme-preview' },
                h('h3', { style: { color: theme.primaryTextColor, marginBottom: '1rem' } }, "Thema Voorbeeld"),
                h('div', { style: cardStyle },
                    h('h4', { style: { color: theme.primaryTextColor } }, "Voorbeeld Taakkaart"),
                    h('p', { style: secondaryTextStyle }, "Dit is een voorbeeld van de secundaire tekst.")
                )
            );
        };

        return h('div', null,
            h('h3', { className: "text-lg font-medium mb-4" }, "Thema Instellingen"),

            // Background color picker
            h('div', { className: "mb-4" },
                h('label', { className: "block text-sm font-medium mb-1" }, "Achtergrondkleur"),
                h('div', { className: "flex items-center" },
                    h('input', {
                        type: "color",
                        name: "backgroundColor",
                        value: theme.backgroundColor,
                        onChange: handleChange,
                        className: "w-10 h-10 mr-2"
                    }),
                    h('input', {
                        type: "text",
                        name: "backgroundColor",
                        value: theme.backgroundColor,
                        onChange: handleChange,
                        className: "flex-1 p-2 border rounded"
                    })
                )
            ),

            // Card color picker
            h('div', { className: "mb-4" },
                h('label', { className: "block text-sm font-medium mb-1" }, "Kaartkleur"),
                h('div', { className: "flex items-center" },
                    h('input', {
                        type: "color",
                        name: "cardColor",
                        value: theme.cardColor,
                        onChange: handleChange,
                        className: "w-10 h-10 mr-2"
                    }),
                    h('input', {
                        type: "text",
                        name: "cardColor",
                        value: theme.cardColor,
                        onChange: handleChange,
                        className: "flex-1 p-2 border rounded"
                    })
                )
            ),

            // Primary text color picker
            h('div', { className: "mb-4" },
                h('label', { className: "block text-sm font-medium mb-1" }, "Primaire tekstkleur"),
                h('div', { className: "flex items-center" },
                    h('input', {
                        type: "color",
                        name: "primaryTextColor",
                        value: theme.primaryTextColor,
                        onChange: handleChange,
                        className: "w-10 h-10 mr-2"
                    }),
                    h('input', {
                        type: "text",
                        name: "primaryTextColor",
                        value: theme.primaryTextColor,
                        onChange: handleChange,
                        className: "flex-1 p-2 border rounded"
                    })
                )
            ),

            // Secondary text color picker
            h('div', { className: "mb-4" },
                h('label', { className: "block text-sm font-medium mb-1" }, "Secundaire tekstkleur"),
                h('div', { className: "flex items-center" },
                    h('input', {
                        type: "color",
                        name: "secondaryTextColor",
                        value: theme.secondaryTextColor,
                        onChange: handleChange,
                        className: "w-10 h-10 mr-2"
                    }),
                    h('input', {
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
            h('div', { className: "mt-6 flex justify-between" },
                h('button', {
                    type: "button",
                    onClick: handleReset,
                    className: "theme-reset-button px-4 py-2"
                }, "Herstel Standaard"),
                h('button', {
                    type: "button",
                    onClick: handleSave,
                    className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                }, "Thema Opslaan")
            )
        );
    };

    // Export components
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, {
        StatsCard,
        UserStatsCard,
        ThemeSettings
    });

    console.log('Stats components loaded successfully');
})();