"""Database package for Chores Manager."""
from .base import init_database, verify_database
from .chores import (
    add_chore_to_db,
    delete_chore,
    update_chore_description,
    reset_chore,
    force_chore_due,
    get_chore_by_id
)
from .users import (
    add_user,
    delete_user,
    get_ha_user_id_for_assignee,
    get_all_assignees,
    get_default_assignees
)
from .subtasks import (
    add_subtask,
    delete_subtask,
    complete_subtask,
    get_subtasks_for_chore,
    update_chore_completion_status
)
from .history import (
    mark_chore_done,
    get_completion_history,
    get_chore_stats,
    get_streaks
)
from .notifications import (
    log_notification_sent,
    get_pending_notifications,
    cleanup_old_notifications
)

__all__ = [
    # Base
    'init_database',
    'verify_database',
    # Chores
    'add_chore_to_db',
    'delete_chore',
    'update_chore_description',
    'reset_chore',
    'force_chore_due',
    'get_chore_by_id',
    # Users
    'add_user',
    'delete_user',
    'get_ha_user_id_for_assignee',
    'get_all_assignees',
    'get_default_assignees',
    # Subtasks
    'add_subtask',
    'delete_subtask',
    'complete_subtask',
    'get_subtasks_for_chore',
    'update_chore_completion_status',
    # History
    'mark_chore_done',
    'get_completion_history',
    'get_chore_stats',
    'get_streaks',
    # Notifications
    'log_notification_sent',
    'get_pending_notifications',
    'cleanup_old_notifications'
]
