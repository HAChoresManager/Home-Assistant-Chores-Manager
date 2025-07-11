"""Frequency calculation utilities for Chores Manager."""
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, Optional
import calendar

from .date_utils import parse_date, parse_active_days, get_next_occurrence_of_weekday, get_next_occurrence_of_monthday

_LOGGER = logging.getLogger(__name__)


class FrequencyCalculator:
    """Calculate next due dates for chores based on frequency settings."""
    
    @staticmethod
    def calculate_next_due_date(chore: Dict[str, Any]) -> date:
        """
        Calculate the next due date for a chore.
        
        Args:
            chore: Dictionary containing chore data
            
        Returns:
            Next due date as a date object
        """
        if not chore.get('last_done'):
            return datetime.now().date()
        
        last_done = parse_date(chore['last_done']).date()
        frequency_type = chore.get('frequency_type', 'Wekelijks')
        
        calculator_map = {
            'Dagelijks': FrequencyCalculator._calculate_daily,
            'Wekelijks': FrequencyCalculator._calculate_weekly,
            'Meerdere keren per week': FrequencyCalculator._calculate_multiple_weekly,
            'Maandelijks': FrequencyCalculator._calculate_monthly,
            'Meerdere keren per maand': FrequencyCalculator._calculate_multiple_monthly,
            'Per kwartaal': FrequencyCalculator._calculate_quarterly,
            'Halfjaarlijks': FrequencyCalculator._calculate_semiannual,
            'Jaarlijks': FrequencyCalculator._calculate_yearly,
            'Flexibel': FrequencyCalculator._calculate_flexible
        }
        
        calculator = calculator_map.get(frequency_type)
        if calculator:
            return calculator(chore, last_done)
        else:
            # Default fallback
            frequency_days = chore.get('frequency_days', 7)
            return last_done + timedelta(days=frequency_days)
    
    @staticmethod
    def _calculate_daily(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for daily tasks."""
        next_due = last_done + timedelta(days=1)
        
        # Handle day exclusions if set
        active_days = parse_active_days(chore.get('active_days'))
        if active_days:
            day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            
            # Keep advancing until we find an active day
            max_iterations = 8  # Prevent infinite loop
            iterations = 0
            while iterations < max_iterations:
                day_name = day_names[next_due.weekday()]
                if active_days.get(day_name, True):  # Default to True if not specified
                    break
                next_due = next_due + timedelta(days=1)
                iterations += 1
        
        return next_due
    
    @staticmethod
    def _calculate_weekly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for weekly tasks."""
        weekday = chore.get('weekday', -1)
        
        if weekday >= 0:
            # Use specified weekday
            return get_next_occurrence_of_weekday(weekday, datetime.combine(last_done, datetime.min.time()))
        else:
            # Simple weekly: add 7 days
            return last_done + timedelta(days=7)
    
    @staticmethod
    def _calculate_multiple_weekly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for multiple times per week tasks."""
        active_days = parse_active_days(chore.get('active_days'))
        times_per_week = chore.get('frequency_times', 3)
        
        if active_days:
            day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            
            # Find next active day
            next_due = last_done + timedelta(days=1)
            max_iterations = 8
            iterations = 0
            
            while iterations < max_iterations:
                day_name = day_names[next_due.weekday()]
                if active_days.get(day_name, True):
                    break
                next_due = next_due + timedelta(days=1)
                iterations += 1
            
            return next_due
        else:
            # Divide week by frequency_times to get interval
            interval = max(1, round(7 / times_per_week))
            return last_done + timedelta(days=interval)
    
    @staticmethod
    def _calculate_monthly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for monthly tasks."""
        monthday = chore.get('monthday', -1)
        
        if monthday > 0:
            # Use specified day of month
            return get_next_occurrence_of_monthday(monthday, datetime.combine(last_done, datetime.min.time()))
        else:
            # Add one month to last completion date
            if last_done.month == 12:
                next_due = date(last_done.year + 1, 1, last_done.day)
            else:
                # Handle month length issues
                next_month = last_done.month + 1
                days_in_month = calendar.monthrange(last_done.year, next_month)[1]
                day = min(last_done.day, days_in_month)
                next_due = date(last_done.year, next_month, day)
            
            return next_due
    
    @staticmethod
    def _calculate_multiple_monthly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for multiple times per month tasks."""
        active_monthdays = parse_active_days(chore.get('active_monthdays'))
        times_per_month = chore.get('frequency_times', 4)
        
        if active_monthdays:
            # Find the next active day after last_done
            curr_date = last_done + timedelta(days=1)
            max_days = 31
            
            for _ in range(max_days):
                day_str = str(curr_date.day)
                if active_monthdays.get(day_str, False):
                    return curr_date
                curr_date += timedelta(days=1)
            
            # If no active day found, use standard calculation
            interval = max(1, round(30 / times_per_month))
            return last_done + timedelta(days=interval)
        else:
            # Divide month by frequency_times to get interval
            interval = max(1, round(30 / times_per_month))
            return last_done + timedelta(days=interval)
    
    @staticmethod
    def _calculate_quarterly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for quarterly tasks."""
        # Add 3 months
        month = last_done.month + 3
        year = last_done.year
        
        if month > 12:
            month = month - 12
            year += 1
        
        # Handle month length issues
        days_in_month = calendar.monthrange(year, month)[1]
        day = min(last_done.day, days_in_month)
        
        return date(year, month, day)
    
    @staticmethod
    def _calculate_semiannual(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for semi-annual tasks."""
        # Add 6 months
        month = last_done.month + 6
        year = last_done.year
        
        if month > 12:
            month = month - 12
            year += 1
        
        # Handle month length issues
        days_in_month = calendar.monthrange(year, month)[1]
        day = min(last_done.day, days_in_month)
        
        return date(year, month, day)
    
    @staticmethod
    def _calculate_yearly(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for yearly tasks."""
        # Add 1 year, handling leap years
        try:
            return date(last_done.year + 1, last_done.month, last_done.day)
        except ValueError:
            # February 29 to February 28
            return date(last_done.year + 1, last_done.month, 28)
    
    @staticmethod
    def _calculate_flexible(chore: Dict[str, Any], last_done: date) -> date:
        """Calculate next due date for flexible tasks."""
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
            days_in_current_month = calendar.monthrange(last_done.year, last_done.month)[1]
            period_end = last_done.replace(day=days_in_current_month)
        else:
            period_end = last_done + timedelta(days=1)
        
        return period_end
    
    @staticmethod
    def is_due_today(chore: Dict[str, Any]) -> bool:
        """Check if a chore is due today."""
        if not chore or not chore.get('chore_id') or not chore.get('name', '').strip():
            return False
        
        if not chore.get('last_done'):
            return True
        
        next_due = FrequencyCalculator.calculate_next_due_date(chore)
        today = date.today()
        
        return next_due <= today
    
    @staticmethod
    def is_overdue(chore: Dict[str, Any]) -> bool:
        """Check if a chore is overdue."""
        if not chore.get('last_done'):
            return True
        
        next_due = FrequencyCalculator.calculate_next_due_date(chore)
        today = date.today()
        
        return next_due < today
    
    @staticmethod
    def get_days_until_due(chore: Dict[str, Any]) -> int:
        """Get the number of days until a chore is due (negative if overdue)."""
        next_due = FrequencyCalculator.calculate_next_due_date(chore)
        today = date.today()
        
        return (next_due - today).days
