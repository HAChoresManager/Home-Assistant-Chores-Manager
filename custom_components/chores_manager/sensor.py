"""Sensor for chores manager."""
import logging
from datetime import datetime, timedelta
import re
import json

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity import generate_entity_id

from . import DOMAIN

_LOGGER = logging.getLogger(__name__)

ENTITY_ID_FORMAT = 'sensor.{}'

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Set up the sensor platform."""
    database_path = hass.data[DOMAIN][entry.entry_id]["database_path"]
    _LOGGER.info("Setting up ChoresOverviewSensor with database: %s", database_path)

    # Create and add the sensor entity with explicit entity_id
    sensor = ChoresOverviewSensor(hass, database_path, entry.entry_id)
    async_add_entities([sensor], True)


class ChoresOverviewSensor(SensorEntity):
    """Representation of a Chores Overview sensor."""

    def __init__(self, hass: HomeAssistant, database_path: str, entry_id: str):
        """Initialize the sensor."""
        self._database_path = database_path
        self._entry_id = entry_id
        self._attr_name = "Chores Overview"
        self._attr_unique_id = f"chores_manager_{entry_id}"

        # Explicitly set entity_id
        self.entity_id = generate_entity_id(
            ENTITY_ID_FORMAT,
            f"chores_overview",
            hass=hass
        )

        self._state = 0
        self._attrs = {}
        _LOGGER.info("Initialized ChoresOverviewSensor with path: %s and entity_id: %s",
                   database_path, self.entity_id)

    @property
    def native_value(self):
        """Return the state of the sensor."""
        return self._state

    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        return self._attrs

    async def async_update(self) -> None:
        """Update the sensor."""
        _LOGGER.debug("Starting update for ChoresOverviewSensor with entity_id: %s", self.entity_id)

        def get_data():
            import sqlite3

            _LOGGER.info("Updating sensor data from %s", self._database_path)

            conn = sqlite3.connect(self._database_path)
            cursor = conn.cursor()

            try:
                # Get all assignees
                cursor.execute('SELECT id, name, color, active FROM assignees WHERE active = 1')
                assignees_data = cursor.fetchall()
                assignees = []
                assignee_names = []
                for row in assignees_data:
                    assignees.append({
                        'id': row[0],
                        'name': row[1],
                        'color': row[2],
                        'active': bool(row[3])
                    })
                    assignee_names.append(row[1])

                # Initialize stats for all assignees
                stats = {}
                for name in assignee_names:
                    stats[name] = {
                        'total_tasks': 0,          # Will now store tasks due today
                        'total_time': 0,           # Will now store time for tasks due today
                        'tasks_completed': 0,      # Tasks completed today
                        'time_completed': 0,       # Time for tasks completed today
                        'streak': 0,
                        'monthly_completed': 0,
                        'monthly_percentage': 0,
                        'due_tasks': []            # List of tasks due today for this assignee
                    }

                # Get all tasks with their current status
                cursor.execute('''
                    SELECT
                        id, name, frequency_type, frequency_days, frequency_times,
                        assigned_to, priority, duration, last_done, last_done_by,
                        CASE
                            WHEN last_done IS NULL THEN 999
                            ELSE round((julianday('now') - julianday(last_done)), 2)
                        END as days_since_last_done,
                        icon, description, alternate_with, use_alternating,
                        COALESCE(startMonth, 0) as startMonth,
                        COALESCE(startDay, 1) as startDay,
                        COALESCE(weekday, -1) as weekday,
                        COALESCE(monthday, -1) as monthday,
                        active_days, active_monthdays, has_subtasks,
                        subtasks_completion_type, subtasks_streak_type, subtasks_period,
                        notify_when_due
                    FROM chores
                ''')

                all_tasks = []
                today = datetime.now().date()

                for row in cursor.fetchall():
                    # Calculate stats for each task
                    task_data = {
                        'chore_id': row[0],
                        'name': row[1],
                        'frequency_type': row[2],
                        'frequency_days': row[3],
                        'frequency_times': row[4],
                        'assigned_to': row[5],
                        'priority': row[6],
                        'duration': row[7],
                        'last_done': row[8],
                        'last_done_by': row[9],
                        'days_since': row[10],
                        'icon': row[11] or '📋',
                        'description': row[12] or '',
                        'alternate_with': row[13] or '',
                        'use_alternating': bool(row[14]),
                        'startMonth': row[15],
                        'startDay': row[16],
                        'weekday': row[17],
                        'monthday': row[18],
                        'active_days': row[19],
                        'active_monthdays': row[20],
                        'has_subtasks': bool(row[21]),
                        'subtasks_completion_type': row[22] or 'all',
                        'subtasks_streak_type': row[23] or 'period',
                        'subtasks_period': row[24] or 'week',
                        'notify_when_due': bool(row[25])
                    }

                    all_tasks.append(task_data)

                    # Determine if task is due today
                    is_due_today = False
                    completed_today = False

                    # Check if it was completed today
                    if task_data['last_done']:
                        last_done_date = self.parse_date(task_data['last_done']).date()
                        if last_done_date == today:
                            completed_today = True

                    # Check if it's due today
                    if not task_data['last_done']:
                        # Never completed tasks are due today
                        is_due_today = True
                    else:
                        next_due_date = self.calculate_next_due_date(task_data)
                        if next_due_date <= today:
                            is_due_today = True

                    # Add to assignee's counts
                    assignee = task_data['assigned_to']
                    if assignee in stats:
                        if is_due_today and not completed_today:
                            # Add to due tasks count
                            stats[assignee]['total_tasks'] += 1
                            stats[assignee]['total_time'] += task_data['duration']
                            stats[assignee]['due_tasks'].append(task_data['chore_id'])

                # Get today's date
                today_str = today.strftime('%Y-%m-%d')

                # Get completions for today with historical assigned_to info from history
                cursor.execute('''
                    SELECT h.id, h.chore_id, h.done_by, c.duration, c.name, h.done_at, c.assigned_to, c.use_alternating, c.alternate_with
                    FROM chore_history h
                    JOIN chores c ON h.chore_id = c.id
                    WHERE date(h.done_at) = date('now')
                    ORDER BY h.done_at ASC
                ''')

                today_completions = cursor.fetchall()
                completed_tasks_count = len(today_completions)
                completed_task_ids = set()

                # Process completions and track them against the correct person who did the task
                for row in today_completions:
                    history_id, chore_id, done_by, duration, name, done_at, current_assignee, use_alternating, alternate_with = row

                    # Credit the stats to the person who actually did the task (done_by)
                    # NOT the person it was assigned to
                    if done_by in stats:
                        stats[done_by]['tasks_completed'] += 1
                        stats[done_by]['time_completed'] += duration

                        # Also add to total tasks for this person
                        stats[done_by]['total_tasks'] += 1
                        stats[done_by]['total_time'] += duration

                    # Track completed task IDs
                    completed_task_ids.add(chore_id)

                # Get subtasks for any task that has them
                for task in all_tasks:
                    if task.get('has_subtasks'):
                        cursor.execute("""
                            SELECT s.id, s.name, s.position,
                                (SELECT COUNT(*) FROM subtask_completions sc
                                WHERE sc.subtask_id = s.id
                                AND date(sc.done_at) = date('now')) > 0 as completed_today
                            FROM subtasks s
                            WHERE s.chore_id = ?
                            ORDER BY s.position
                        """, (task['chore_id'],))

                        subtasks = []
                        for row in cursor.fetchall():
                            subtasks.append({
                                'id': row[0],
                                'name': row[1],
                                'position': row[2],
                                'completed': bool(row[3])
                            })

                        task['subtasks'] = subtasks

                        # Get completion statistics for this period
                        period = task.get('subtasks_period', 'week')
                        if period == 'day':
                            period_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                        elif period == 'week':
                            days_since_monday = datetime.now().weekday()
                            period_start = (datetime.now() - timedelta(days=days_since_monday)).replace(
                                hour=0, minute=0, second=0, microsecond=0
                            )
                        elif period == 'month':
                            period_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

                        # Count subtask completions in the current period
                        if len(subtasks) > 0:
                            subtask_ids = [s['id'] for s in subtasks]
                            placeholders = ','.join(['?'] * len(subtask_ids))
                            cursor.execute(f"""
                                SELECT COUNT(DISTINCT sc.subtask_id)
                                FROM subtask_completions sc
                                JOIN subtasks s ON sc.subtask_id = s.id
                                WHERE s.chore_id = ? AND sc.done_at >= ?
                                AND sc.subtask_id IN ({placeholders})
                            """, [task['chore_id'], period_start.isoformat()] + subtask_ids)

                            completed_subtasks_count = cursor.fetchone()[0]
                            task['subtasks_completed_count'] = completed_subtasks_count
                            task['subtasks_total_count'] = len(subtasks)
                        else:
                            task['subtasks_completed_count'] = 0
                            task['subtasks_total_count'] = 0
                    else:
                        task['subtasks'] = []
                        task['subtasks_completed_count'] = 0
                        task['subtasks_total_count'] = 0

                    # Parse active_days JSON if it exists and is a string
                    if task.get('active_days') and isinstance(task['active_days'], str):
                        try:
                            task['active_days'] = json.loads(task['active_days'])
                        except json.JSONDecodeError:
                            task['active_days'] = {}

                    # Parse active_monthdays JSON if it exists and is a string
                    if task.get('active_monthdays') and isinstance(task['active_monthdays'], str):
                        try:
                            task['active_monthdays'] = json.loads(task['active_monthdays'])
                        except json.JSONDecodeError:
                            task['active_monthdays'] = {}

                # Calculate streaks
                for assignee in list(stats.keys()):
                    # Calculate streak
                    cursor.execute('''
                        SELECT date(done_at) as completion_date
                        FROM chore_history h
                        WHERE h.done_by = ?
                        GROUP BY date(completion_date)
                        ORDER BY date(completion_date) DESC
                        LIMIT 30
                    ''', (assignee,))

                    dates = [row[0] for row in cursor.fetchall()]

                    if dates:
                        streak = 0
                        current_date = datetime.now().date()

                        # Check if there are tasks due today for this assignee
                        cursor.execute('''
                            SELECT COUNT(*)
                            FROM chores
                            WHERE assigned_to = ?
                        ''', (assignee,))

                        has_assigned_tasks = cursor.fetchone()[0] > 0

                        # Check if there are tasks done today
                        if today_str in dates or current_date.strftime('%Y-%m-%d') in dates:
                            streak = 1
                            # Check consecutive days backwards
                            for i in range(1, 30):
                                prev_date = (current_date - timedelta(days=i)).strftime('%Y-%m-%d')

                                # Check if had assigned tasks for that day
                                cursor.execute('''
                                    SELECT COUNT(*) FROM chores
                                    WHERE assigned_to = ? AND date(last_done) = ?
                                ''', (assignee, prev_date))

                                had_tasks_on_date = cursor.fetchone()[0] > 0

                                # Either completed a task on that day, or had no tasks assigned
                                if prev_date in dates:
                                    streak += 1
                                elif not had_tasks_on_date:
                                    # No tasks assigned for that day, don't break streak
                                    streak += 1
                                else:
                                    # Had tasks but didn't complete any - break streak
                                    break

                        stats[assignee]['streak'] = streak

                # Get monthly completed tasks by assignee (based on who completed them)
                first_day_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
                cursor.execute('''
                    SELECT done_by, COUNT(*) as task_count
                    FROM chore_history
                    WHERE done_at >= ?
                    GROUP BY done_by
                ''', (first_day_of_month,))

                monthly_totals = {}
                for row in cursor.fetchall():
                    monthly_totals[row[0]] = row[1]

                total_monthly = sum(monthly_totals.values()) or 1  # Avoid division by zero

                for assignee in stats:
                    stats[assignee]['monthly_completed'] = monthly_totals.get(assignee, 0)
                    stats[assignee]['monthly_percentage'] = round(
                        monthly_totals.get(assignee, 0) / total_monthly * 100, 1
                    )

                return all_tasks, stats, assignees, completed_tasks_count

            except Exception as e:
                _LOGGER.error("Error querying database: %s", str(e), exc_info=True)
                raise
            finally:
                conn.close()

        try:
            tasks, stats, assignees, completed_tasks_count = await self.hass.async_add_executor_job(get_data)
            self._state = completed_tasks_count
            self._attrs = {
                'overdue_tasks': tasks,
                'stats': stats,
                'assignees': assignees,
                'completed_today': completed_tasks_count
            }
            _LOGGER.info("Updated sensor with %d tasks, %d completed today", len(tasks), completed_tasks_count)
        except Exception as e:
            _LOGGER.error("Error updating sensor: %s", str(e))
            # Don't raise here to prevent sensor from going unavailable
            # Just keep the old state
            pass

    def parse_date(self, date_string):
        """Parse date string in various formats."""
        if not date_string:
            return datetime.now()

        # Handle ISO format with T separator
        if 'T' in date_string:
            try:
                return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
            except ValueError:
                # If fromisoformat fails, try with regex to extract the date part
                date_part = re.match(r'(\d{4}-\d{2}-\d{2})', date_string)
                if date_part:
                    return datetime.strptime(date_part.group(1), '%Y-%m-%d')

        # Try standard format
        try:
            if ' ' in date_string:
                # Format like "2023-01-01 12:30:45"
                return datetime.strptime(date_string, '%Y-%m-%d %H:%M:%S')
            else:
                # Just the date "2023-01-01"
                return datetime.strptime(date_string, '%Y-%m-%d')
        except ValueError:
            # If all else fails, return a safe default
            _LOGGER.warning("Could not parse date: %s - using current date", date_string)
            return datetime.now()

    def calculate_next_due_date(self, chore):
        """Calculate the next due date for a chore with enhanced frequency rules."""
        if not chore['last_done']:
            return datetime.now().date()

        last_done = self.parse_date(chore['last_done']).date()
        next_due = last_done

        frequency_type = chore['frequency_type']

        # Handle the different frequency types
        if frequency_type == 'Dagelijks':
            next_due = last_done + timedelta(days=1)

            # Handle day exclusions if set
            if chore.get('active_days'):
                active_days = {}
                # Convert from string if needed
                if isinstance(chore['active_days'], str):
                    try:
                        active_days = json.loads(chore['active_days'])
                    except:
                        active_days = {}
                else:
                    active_days = chore['active_days']

                # Keep advancing until we find an active day
                while True:
                    # Get day of week (0=Monday, 6=Sunday)
                    day_of_week = next_due.weekday()
                    day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
                    day_name = day_names[day_of_week]

                    # Check if this day is active (default to True if not specified)
                    if active_days.get(day_name, True):
                        break

                    # If not active, advance to next day
                    next_due = next_due + timedelta(days=1)

        elif frequency_type == 'Flexibel':
            # Get completion requirements
            required = chore.get('frequency_times', 1)
            period = chore.get('subtasks_period', 'week')

            # Calculate period end date
            if period == 'day':
                period_end = last_done + timedelta(days=1)
            elif period == 'week':
                # End of week (Sunday)
                days_to_sunday = 6 - last_done.weekday()
                period_end = last_done + timedelta(days=days_to_sunday)
            elif period == 'month':
                # End of month
                if last_done.month == 12:
                    next_month = 1
                    next_year = last_done.year + 1
                else:
                    next_month = last_done.month + 1
                    next_year = last_done.year

                # Last day of current month
                from calendar import monthrange
                days_in_current_month = monthrange(last_done.year, last_done.month)[1]
                period_end = last_done.replace(day=days_in_current_month)

            # Set next due date to period end
            next_due = period_end

        elif frequency_type == 'Wekelijks':
            # Standard weekly logic
            if chore['weekday'] is not None and chore['weekday'] >= 0:
                # Use specified weekday (0=Monday, 6=Sunday)
                target_weekday = int(chore['weekday'])
                days_to_add = (target_weekday - last_done.weekday()) % 7
                if days_to_add == 0:
                    days_to_add = 7  # If today is the target day, go to next week
                next_due = last_done + timedelta(days=days_to_add)
            else:
                # Simple weekly: add 7 days
                next_due = last_done + timedelta(days=7)

        elif frequency_type == 'Meerdere keren per week':
            # Check for active days
            if chore.get('active_days'):
                active_days = {}
                # Convert from string if needed
                if isinstance(chore['active_days'], str):
                    try:
                        active_days = json.loads(chore['active_days'])
                    except:
                        active_days = {}
                else:
                    active_days = chore['active_days']

                # Get number of times required per week
                times_per_week = chore.get('frequency_times', 3)

                # Calculate days needed between completions based on active days count
                active_days_count = sum(1 for v in active_days.values() if v)
                if active_days_count > 0:
                    days_between = max(1, min(7, 7 // times_per_week))
                else:
                    days_between = max(1, min(7, 7 // times_per_week))

                # Start from the day after last_done
                next_due = last_done + timedelta(days=1)

                # Keep advancing until we find an active day
                while True:
                    # Get day of week (0=Monday, 6=Sunday)
                    day_of_week = next_due.weekday()
                    day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
                    day_name = day_names[day_of_week]

                    # Check if this day is active (default to True if not specified)
                    if active_days.get(day_name, True):
                        break

                    # If not active, advance to next day
                    next_due = next_due + timedelta(days=1)
            else:
                # Divide week by frequency_times to get interval
                interval = max(1, round(7 / chore['frequency_times']))
                next_due = last_done + timedelta(days=interval)

        elif frequency_type == 'Maandelijks':
            if chore['monthday'] is not None and chore['monthday'] > 0:
                # Use specified day of month
                target_day = int(chore['monthday'])
                # Move to next month
                if last_done.month == 12:
                    next_month = 1
                    next_year = last_done.year + 1
                else:
                    next_month = last_done.month + 1
                    next_year = last_done.year

                # Handle month length issues
                import calendar
                days_in_month = calendar.monthrange(next_year, next_month)[1]
                actual_day = min(target_day, days_in_month)

                next_due = datetime(next_year, next_month, actual_day).date()
            else:
                # Add one month to last completion date
                if last_done.month == 12:
                    next_due = datetime(last_done.year + 1, 1, last_done.day).date()
                else:
                    # Handle month length issues
                    import calendar
                    next_month = last_done.month + 1
                    days_in_month = calendar.monthrange(last_done.year, next_month)[1]
                    day = min(last_done.day, days_in_month)
                    next_due = datetime(last_done.year, next_month, day).date()

        elif frequency_type == 'Meerdere keren per maand':
            # Check if there are active month days
            if chore.get('active_monthdays'):
                active_days = {}
                # Convert from string if needed
                if isinstance(chore['active_monthdays'], str):
                    try:
                        active_days = json.loads(chore['active_monthdays'])
                    except:
                        active_days = {}
                else:
                    active_days = chore['active_monthdays']

                # Get number of times required per month
                times_per_month = chore.get('frequency_times', 4)

                # Calculate days needed between completions based on specified days
                active_days_count = sum(1 for v in active_days.values() if v)
                if active_days_count > 0:
                    # Find the next active day after last_done
                    found = False
                    curr_date = last_done + timedelta(days=1)

                    # Try days for up to a month (31 days)
                    for _ in range(31):
                        day_str = str(curr_date.day)
                        if active_days.get(day_str, False):
                            next_due = curr_date
                            found = True
                            break

                        # Move to next day
                        curr_date += timedelta(days=1)

                    # If no active day was found, use standard calculation
                    if not found:
                        # Divide month by frequency_times to get interval
                        interval = max(1, round(30 / times_per_month))
                        next_due = last_done + timedelta(days=interval)
                else:
                    # Divide month by frequency_times to get interval
                    interval = max(1, round(30 / times_per_month))
                    next_due = last_done + timedelta(days=interval)
            else:
                # Divide month by frequency_times to get interval
                interval = max(1, round(30 / chore['frequency_times']))
                next_due = last_done + timedelta(days=interval)

        elif frequency_type == 'Per kwartaal':
            # Add 3 months
            next_month = last_done.month + 3
            next_year = last_done.year

            if next_month > 12:
                next_month = next_month - 12
                next_year += 1

            # Handle month length issues
            import calendar
            days_in_month = calendar.monthrange(next_year, next_month)[1]
            day = min(last_done.day, days_in_month)

            next_due = datetime(next_year, next_month, day).date()

        elif frequency_type == 'Halfjaarlijks':
            # Add 6 months
            next_month = last_done.month + 6
            next_year = last_done.year

            if next_month > 12:
                next_month = next_month - 12
                next_year += 1

            # Handle month length issues
            import calendar
            days_in_month = calendar.monthrange(next_year, next_month)[1]
            day = min(last_done.day, days_in_month)

            next_due = datetime(next_year, next_month, day).date()

        elif frequency_type == 'Jaarlijks':
            # Add 1 year
            next_due = datetime(last_done.year + 1, last_done.month, last_done.day).date()

        else:
            # Default to using frequency_days
            next_due = last_done + timedelta(days=chore['frequency_days'] or 7)

        return next_due
