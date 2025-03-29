# Home Assistant Chores Manager

A comprehensive chores management system for Home Assistant that helps families track, assign, and complete household tasks.

## Features

- Task tracking with configurable frequencies and alternating assignments
- Automated task scheduling and due date calculation
- Task completion tracking with history
- Overdue task monitoring and notifications
- Assignment management across family members
- Real-time state updates and statistics
- Streaks and performance metrics
- Mobile-friendly dashboard
- Home Assistant theme integration
- Integration with Home Assistant users for notifications

## Installation

### HACS Installation (Recommended)
1. Make sure [HACS](https://hacs.xyz/) is installed
2. Add this repository as a custom repository in HACS:
   - Go to HACS → Integrations → ⋮ → Custom repositories
   - Add URL `https://github.com/HomeTaskManager/ha-chores-manager`
   - Category: Integration
3. Install "Chores Manager" from HACS
4. Restart Home Assistant

### Manual Installation
1. Download the latest release
2. Copy the `custom_components/chores_manager` folder to your Home Assistant `/config/custom_components` directory
3. Restart Home Assistant

## Configuration

Add the following to your `configuration.yaml`:

```yaml
# Enable Chores Manager
chores_manager:
  database: chores_manager.db  # Optional, defaults to chores_manager.db
  notification_time: "08:00"   # Optional, time for daily notifications (HH:MM)

# Required for the custom services
sqlite_db: