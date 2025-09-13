/**
 * Fallback components for the Chores Manager
 * These minimal components prevent crashes when core components fail to load
 */
(function() {
    'use strict';

    if (!window.React) {
        console.error('Fallback components require React');
        return;
    }

    const h = React.createElement;

    // Simple loading spinner fallback
    const Loading = () => h('div', { className: 'p-4 text-gray-600' }, 'Loading...');

    // Simple error message fallback
    const ErrorMessage = ({ message = 'Er is een fout opgetreden' }) =>
        h('div', { className: 'p-4 bg-red-100 text-red-700 rounded' }, message);

    // Minimal completion confirm dialog fallback
    const CompletionConfirmDialog = ({ isOpen, onCancel }) => {
        if (!isOpen) return null;
        return h('div', { className: 'modal-container' },
            h('div', { className: 'modal-content max-w-md' },
                h('p', { className: 'mb-4' }, 'Component niet beschikbaar'),
                h('div', { className: 'flex justify-end' },
                    h('button', {
                        className: 'px-4 py-2 bg-gray-300 rounded',
                        onClick: onCancel
                    }, 'Sluiten')
                )
            )
        );
    };

    // Minimal subtask completion dialog fallback
    const SubtaskCompletionDialog = ({ isOpen, onCancel }) => {
        if (!isOpen) return null;
        return h('div', { className: 'modal-container' },
            h('div', { className: 'modal-content max-w-md' },
                h('p', { className: 'mb-4' }, 'Component niet beschikbaar'),
                h('div', { className: 'flex justify-end' },
                    h('button', {
                        className: 'px-4 py-2 bg-gray-300 rounded',
                        onClick: onCancel
                    }, 'Sluiten')
                )
            )
        );
    };

    // Export fallbacks
    window.choreComponents = window.choreComponents || {};
    const fallbackExports = {
        Loading,
        ErrorMessage,
        CompletionConfirmDialog,
        SubtaskCompletionDialog
    };
    Object.assign(window.choreComponents, fallbackExports);

    console.warn('Fallback components loaded:', Object.keys(fallbackExports));
})();
