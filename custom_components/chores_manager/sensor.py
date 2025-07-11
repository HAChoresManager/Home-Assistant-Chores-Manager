"""Sensor for chores manager."""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity import generate_entity_id

from . import DOMAIN
from .utils.date_utils import is_today, format_date
from .utils.frequency_calculator import FrequencyCalculator
from .database import (
    get_all_chores,
    get_chore_stats,
    get_all_assignees,
    get_subtasks_for_chore,
    get_today_completions
)
from .theme_service import get_theme_settings

_LOGGER = logging.getLogger(__name__)

ENTITY_ID_FORMAT = 'sensor.{}'


async def async_setup_entry(
    hass: HomeAssistant, 
    entry: ConfigEntry, 
    async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the sensor platform."""
    database_path = hass.data[DOMAIN][entry.entry_id]["database_path"]
    _LOGGER.info("Setting up ChoresOverviewSensor with database: %s", database_path)
    
    # Create and add the sensor entity
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
            "chores_overview",
            hass=hass
        )
        
        self._state = 0
        self._attrs = {}
        
        _LOGGER.info(
            "Initialized ChoresOverviewSensor with path: %s and entity_id: %s",
            database_path, self.entity_id
        )

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
        _LOGGER.debug("Starting update for ChoresOverviewSensor")
        
        try:
            # Get all data from database
            data = await self._fetch_sensor_data()
            
            # Process and update state
            self._process_sensor_data(data)
            
            _LOGGER.info(
                "Updated sensor with %d tasks, %d completed today",
                len(self._attrs.get('overdue_tasks', [])),
                self._state
            )
            
        except Exception as e:
            _LOGGER.error("Error updating sensor: %s", str(e))
            # Keep previous state on error

    async def _fetch_sensor_data(self) -> Dict[str, Any]:
        """Fetch all required data from database."""
        return await self.hass.async_add_executor_job(self._get_sensor_data)

    def _get_sensor_data(self) -> Dict[str, Any]:
        """Get all sensor data from database (sync)."""
        _LOGGER.info("Fetching sensor data from %s", self._database_path)
        
        # Get all chores
        all_chores = get_all_chores(self._database_path)
        
        # Get assignees
        assignees = get_all_assignees(self._database_path, active_only=True)
        
        # Get stats
        stats = get_chore_stats(self._database_path, period="today")
        
        # Get theme settings
        theme_settings = get_theme_settings(self._database_path)
        
        # Get today's completions
        completed_count, completed_tasks = get_today_completions(self._database_path)
        
        # Get subtasks for chores that have them
        for chore in all_chores:
            if chore.get('has_subtasks'):
                chore['subtasks'] = get_subtasks_for_chore(
                    self._database_path, 
                    chore['id']
                )
            else:
                chore['subtasks'] = []
        
        return {
            'chores': all_chores,
            'assignees': assignees,
            'stats': stats,
            'theme_settings': theme_settings,
            'completed_today': completed_count,
            'completed_tasks': completed_tasks
        }

    def _process_sensor_data(self, data: Dict[str, Any]) -> None:
        """Process fetched data and update sensor state."""
        # Process chores
        processed_chores = self._process_chores(data['chores'])
        
        # Filter and enhance stats
        filtered_stats = self._process_stats(data['stats'])
        
        # Calculate overdue count
        overdue_count = sum(
            1 for chore in processed_chores
            if self._is_task_actionable(chore)
        )
        
        # Update state and attributes
        self._state = data['completed_today']
        self._attrs = {
            'overdue_tasks': processed_chores,
            'stats': filtered_stats,
            'assignees': data['assignees'],
            'completed_today': data['completed_today'],
            'theme_settings': data['theme_settings']
        }

    def _process_chores(self, chores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process and enhance chore data."""
        processed = []
        
        for chore in chores:
            # Skip empty chores
            if not chore.get('name') or not chore['name'].strip():
                continue
            
            # Enhance chore data
            enhanced_chore = self._enhance_chore_data(chore)
            processed.append(enhanced_chore)
        
        # Sort by due date
        processed.sort(key=lambda x: FrequencyCalculator.calculate_next_due_date(x))
        
        return processed

    def _enhance_chore_data(self, chore: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance a single chore with calculated fields."""
        # Ensure chore_id is set
        chore['chore_id'] = chore.get('chore_id') or chore.get('id')
        
        # Calculate next due date
        next_due_date = FrequencyCalculator.calculate_next_due_date(chore)
        
        # Calculate days since last done
        if chore.get('last_done'):
            try:
                last_done = datetime.fromisoformat(
                    chore['last_done'].replace('Z', '+00:00')
                )
                days_since = (datetime.now() - last_done).days
            except:
                days_since = 999
        else:
            days_since = 999
        
        # Add calculated fields
        chore['days_since'] = days_since
        chore['next_due_date'] = next_due_date
        chore['is_due_today'] = FrequencyCalculator.is_due_today(chore)
        chore['is_overdue'] = FrequencyCalculator.is_overdue(chore)
        chore['days_until_due'] = FrequencyCalculator.get_days_until_due(chore)
        
        # Process subtasks if present
        if chore.get('subtasks'):
            chore['subtasks_completed_count'] = sum(
                1 for s in chore['subtasks'] if s.get('completed')
            )
            chore['subtasks_total_count'] = len(chore['subtasks'])
        else:
            chore['subtasks_completed_count'] = 0
            chore['subtasks_total_count'] = 0
        
        # Ensure all required fields exist
        chore.setdefault('icon', '📋')
        chore.setdefault('description', '')
        chore.setdefault('priority', 'Middel')
        chore.setdefault('duration', 15)
        
        return chore

    def _process_stats(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Process and filter statistics."""
        # Remove "Wie kan" from stats
        filtered_stats = {
            k: v for k, v in stats.items() 
            if k != "Wie kan"
        }
        
        # Ensure all assignees have complete stats
        for assignee, assignee_stats in filtered_stats.items():
            # Ensure all required fields exist
            assignee_stats.setdefault('total_tasks', 0)
            assignee_stats.setdefault('total_time', 0)
            assignee_stats.setdefault('tasks_completed', 0)
            assignee_stats.setdefault('time_completed', 0)
            assignee_stats.setdefault('streak', 0)
            assignee_stats.setdefault('monthly_completed', 0)
            assignee_stats.setdefault('monthly_percentage', 0)
            assignee_stats.setdefault('due_tasks', [])
        
        return filtered_stats

    def _is_task_actionable(self, chore: Dict[str, Any]) -> bool:
        """Check if a task is actionable (due or overdue and not completed today)."""
        # Skip if completed today
        if chore.get('last_done') and is_today(chore['last_done']):
            return False
        
        # Check if due or overdue
        return chore.get('is_due_today') or chore.get('is_overdue')

    @property
    def icon(self):
        """Return the icon of the sensor."""
        return "mdi:clipboard-check"

    @property
    def unit_of_measurement(self):
        """Return the unit of measurement."""
        return "tasks"

    @property
    def should_poll(self):
        """Return True as this sensor should be polled."""
        return True

    @property
    def device_class(self):
        """Return the device class."""
        return None

    @property
    def state_class(self):
        """Return the state class."""
        return "measurement"
