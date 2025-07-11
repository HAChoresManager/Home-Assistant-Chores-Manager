"""Date and time utilities for Chores Manager."""
import re
import logging
from datetime import datetime, date, timedelta
from typing import Optional, Union
import json

_LOGGER = logging.getLogger(__name__)


def parse_date(date_string: Union[str, None]) -> datetime:
    """
    Parse date string in various formats.
    
    Handles:
    - ISO format with T separator
    - Standard datetime format
    - Date only format
    - None/empty values
    """
    if not date_string:
        return datetime.now()
    
    # Handle ISO format with T separator
    if 'T' in date_string:
        try:
            return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
        except ValueError:
            # Try to extract just the date part with regex
            date_match = re.match(r'(\d{4}-\d{2}-\d{2})', date_string)
            if date_match:
                return datetime.strptime(date_match.group(1), '%Y-%m-%d')
    
    # Try standard formats
    try:
        if ' ' in date_string:
            # Format like "2023-01-01 12:30:45"
            return datetime.strptime(date_string, '%Y-%m-%d %H:%M:%S')
        else:
            # Just the date "2023-01-01"
            return datetime.strptime(date_string, '%Y-%m-%d')
    except ValueError:
        # If all else fails, return current datetime
        _LOGGER.warning("Could not parse date: %s - using current date", date_string)
        return datetime.now()


def is_today(date_string: Union[str, None]) -> bool:
    """Check if a date string represents today."""
    if not date_string:
        return False
    
    parsed_date = parse_date(date_string)
    today = date.today()
    
    return (parsed_date.date() == today)


def format_date(date_input: Union[str, datetime, date, None]) -> str:
    """Format a date for display."""
    if not date_input:
        return ''
    
    if isinstance(date_input, str):
        date_obj = parse_date(date_input)
    elif isinstance(date_input, datetime):
        date_obj = date_input
    elif isinstance(date_input, date):
        date_obj = datetime.combine(date_input, datetime.min.time())
    else:
        return ''
    
    return date_obj.strftime('%Y-%m-%d')


def format_date_friendly(date_input: Union[str, datetime, date, None]) -> str:
    """Format a date in a user-friendly way (Dutch locale)."""
    if not date_input:
        return ''
    
    if isinstance(date_input, str):
        date_obj = parse_date(date_input).date()
    elif isinstance(date_input, datetime):
        date_obj = date_input.date()
    elif isinstance(date_input, date):
        date_obj = date_input
    else:
        return ''
    
    # Dutch month names
    months = [
        'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
        'jul', 'aug', 'sep', 'okt', 'nov', 'dec'
    ]
    
    return f"{date_obj.day} {months[date_obj.month - 1]} {date_obj.year}"


def get_start_of_period(period: str) -> datetime:
    """Get the start datetime of a period (day, week, month)."""
    now = datetime.now()
    
    if period == 'day':
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'week':
        # Start of week (Monday)
        days_since_monday = now.weekday()
        start = now - timedelta(days=days_since_monday)
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'month':
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == 'year':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        # Default to start of today
        return now.replace(hour=0, minute=0, second=0, microsecond=0)


def days_between(date1: Union[str, datetime], date2: Union[str, datetime]) -> int:
    """Calculate days between two dates."""
    if isinstance(date1, str):
        date1 = parse_date(date1)
    if isinstance(date2, str):
        date2 = parse_date(date2)
    
    return abs((date2 - date1).days)


def add_days(date_input: Union[str, datetime], days: int) -> datetime:
    """Add days to a date."""
    if isinstance(date_input, str):
        date_input = parse_date(date_input)
    
    return date_input + timedelta(days=days)


def get_next_occurrence_of_weekday(weekday: int, after_date: Optional[datetime] = None) -> date:
    """
    Get the next occurrence of a weekday.
    
    Args:
        weekday: 0=Monday, 6=Sunday
        after_date: Date to start searching from (default: today)
    """
    if after_date is None:
        after_date = datetime.now()
    
    days_ahead = (weekday - after_date.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7  # Next week if today is the target day
    
    return after_date.date() + timedelta(days=days_ahead)


def get_next_occurrence_of_monthday(monthday: int, after_date: Optional[datetime] = None) -> date:
    """
    Get the next occurrence of a day of the month.
    
    Args:
        monthday: Day of month (1-31)
        after_date: Date to start searching from (default: today)
    """
    if after_date is None:
        after_date = datetime.now()
    
    # Start with next month if we've passed this day
    if after_date.day >= monthday:
        if after_date.month == 12:
            next_month = 1
            next_year = after_date.year + 1
        else:
            next_month = after_date.month + 1
            next_year = after_date.year
    else:
        next_month = after_date.month
        next_year = after_date.year
    
    # Handle months with fewer days
    import calendar
    days_in_month = calendar.monthrange(next_year, next_month)[1]
    actual_day = min(monthday, days_in_month)
    
    return date(next_year, next_month, actual_day)


def parse_active_days(active_days_data: Union[str, dict, None]) -> dict:
    """Parse active days from JSON string or dict."""
    if not active_days_data:
        return {}
    
    if isinstance(active_days_data, str):
        try:
            return json.loads(active_days_data)
        except json.JSONDecodeError:
            _LOGGER.warning("Failed to parse active_days JSON: %s", active_days_data)
            return {}
    elif isinstance(active_days_data, dict):
        return active_days_data
    else:
        return {}
