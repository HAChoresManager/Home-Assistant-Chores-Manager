/**
 * Statistics Components
 */
(function() {
    'use strict';
    
    if (!window.React) return;
    const h = React.createElement;
    
    const StatsCard = ({ title, value, icon = '📊', variant = 'default' }) => {
        const variants = {
            default: 'bg-white',
            success: 'bg-green-50',
            warning: 'bg-yellow-50',
            error: 'bg-red-50'
        };
        
        return h('div', { className: `${variants[variant]} p-6 rounded-lg shadow border` },
            h('div', { className: 'flex items-center justify-between' },
                h('div', null,
                    h('p', { className: 'text-sm text-gray-600' }, title),
                    h('p', { className: 'text-3xl font-bold mt-2' }, value)
                ),
                h('span', { className: 'text-4xl' }, icon)
            )
        );
    };
    
    const UserStatsCard = ({ user, stats = {} }) => {
        return h('div', { className: 'bg-white p-4 rounded-lg shadow border' },
            h('h3', { className: 'font-medium mb-2' }, user),
            h('div', { className: 'grid grid-cols-2 gap-2 text-sm' },
                h('div', null, `Voltooid: ${stats.completed || 0}`),
                h('div', null, `Te doen: ${stats.pending || 0}`)
            )
        );
    };
    
    const ThemeSettings = ({ onSave, onClose }) => {
        const [settings, setSettings] = React.useState({});
        
        return h('div', { className: 'p-4' },
            h('h2', { className: 'text-xl font-bold mb-4' }, 'Thema Instellingen'),
            h('p', { className: 'text-gray-600' }, 'Thema aanpassingen komen binnenkort...'),
            h('button', {
                onClick: onClose,
                className: 'mt-4 px-4 py-2 bg-gray-300 rounded'
            }, 'Sluiten')
        );
    };
    
    window.choreComponents = window.choreComponents || {};
    Object.assign(window.choreComponents, { StatsCard, UserStatsCard, ThemeSettings });
    
    console.log('✅ Stats components loaded');
})();