# Chores Manager - Technical Project Description

## Project Overview

The Chores Manager is a comprehensive Home Assistant custom component that provides advanced task management and scheduling capabilities. It combines a robust Python backend with a modern React-based frontend dashboard to create a complete household chore management system.

## Architecture

### System Components

```
Chores Manager System
├── Backend (Python/Home Assistant)
│   ├── Custom Component Integration
│   ├── Database Layer (SQLite)
│   ├── API Endpoints
│   ├── Service Layer
│   └── Notification System
└── Frontend (React/JavaScript)
    ├── Dashboard UI
    ├── Component System
    ├── API Client
    ├── Theme Integration
    └── Real-time Updates
```

## Backend Architecture

### Home Assistant Integration
- **Platform**: Home Assistant Custom Component
- **Language**: Python 3.9+
- **Integration Type**: Custom integration with dashboard UI
- **Configuration**: YAML-based setup through Home Assistant

### Database Layer
- **Database**: SQLite with modular schema design
- **Location**: `custom_components/chores_manager/db/`
- **Modules**:
  - `base.py` - Core database operations
  - `chores.py` - Task management operations
  - `users.py` - User management operations
  - `subtasks.py` - Subtask operations
  - `history.py` - Completion history tracking
  - `notifications.py` - Notification management

### API Architecture
- **REST API**: Home Assistant API integration
- **Authentication**: Home Assistant token-based authentication
- **Endpoints**: CRUD operations for chores, users, and statistics
- **Real-time**: WebSocket support for live updates

### Service Layer
Services available through Home Assistant:
- `add_chore` - Create new chores with scheduling
- `mark_chore_complete` - Complete tasks with user assignment
- `add_user` - User management
- `delete_user` - User removal
- `force_due` - Force chores to appear as due
- `get_ha_users` - Integration with HA user system

## Frontend Architecture

### Technology Stack
- **Framework**: React 18+ (loaded via CDN)
- **Styling**: Tailwind CSS
- **State Management**: React Hooks (useState, useEffect)
- **Build System**: No build step - direct browser execution
- **Module System**: ES6 modules with manual dependency management

### Component Architecture

```
Frontend Structure
├── index.html                    # Main entry point
├── js/
│   ├── app.js                   # Main application component
│   ├── auth-helper.js           # Authentication utilities
│   ├── utils.js                 # General utilities
│   ├── theme-integration.js     # Theme system integration
│   ├── components/
│   │   ├── index.js            # Component loader
│   │   ├── base.js             # Base UI components
│   │   ├── tasks.js            # Task-related components
│   │   ├── forms.js            # Form components
│   │   ├── stats.js            # Statistics components
│   │   └── dialogs.js          # Dialog components
│   └── api/
│       ├── index.js            # API loader
│       ├── base.js             # Base API functionality
│       ├── chores.js           # Chores API endpoints
│       ├── users.js            # User management API
│       └── theme.js            # Theme API
└── css/
    └── styles.css              # Custom styles
```

### Component System

#### Base Components (`components/base.js`)
Core reusable UI elements:
- `Loading` - Loading spinner with message
- `ErrorMessage` - Error display with retry functionality
- `Alert` - Info/success/warning/error alerts
- `Modal` - Modal dialog wrapper
- `EmptyState` - Empty state placeholder
- `Badge` - Status badges with color coding
- `ProgressBar` - Progress indicators
- `Tooltip` - Hover tooltips

#### Task Components (`components/tasks.js`)
Task-specific display components:
- `TaskCard` - Main task display with completion controls
- `TaskDescription` - Rich text description viewer/editor
- `PriorityIndicator` - Visual priority level indicator

#### Form Components (`components/forms.js`)
Input and form handling:
- `TaskForm` - Complete create/edit task form
- `UserManagement` - User CRUD interface
- `IconSelector` - Task icon picker with preview
- `WeekDayPicker` - Weekly schedule selection
- `MonthDayPicker` - Monthly schedule selection

#### Statistics Components (`components/stats.js`)
Data visualization and metrics:
- `StatsCard` - Basic statistics display
- `UserStatsCard` - User-specific performance metrics
- `ThemeSettings` - Theme customization interface

#### Dialog Components (`components/dialogs.js`)
Modal dialog system:
- `ConfirmDialog` - Basic confirmation dialog
- `CompletionConfirmDialog` - Task completion with user selection
- `SubtaskCompletionDialog` - Subtask completion interface
- `ErrorDialog` - Error display dialog
- `SuccessDialog` - Success confirmation

### State Management

#### Centralized State Pattern
```javascript
// Main application state structure
const appState = {
    core: {
        chores: [],
        assignees: [],
        subtasks: {}
    },
    ui: {
        selectedView: 'overview',
        showCompleted: false,
        searchQuery: ''
    },
    dialogs: {
        editing: null,
        confirming: null,
        userManagement: false
    },
    status: {
        loading: false,
        error: null,
        lastUpdated: null
    }
};
```

#### Event Handling System
- Centralized event handlers in `useEventHandlers`
- Async operations with proper loading states
- Error handling with user feedback
- Optimistic updates for better UX

## Database Schema

### Core Tables

#### Chores Table
```sql
CREATE TABLE chores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    frequency_type TEXT,  -- daily, weekly, monthly, custom
    frequency_value TEXT, -- schedule definition
    priority INTEGER,     -- 1-5 priority level
    icon TEXT,           -- task icon identifier
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,          -- hex color code
    active BOOLEAN,
    ha_user_id TEXT,     -- Home Assistant user ID
    created_at TIMESTAMP
);
```

#### Assignments Table
```sql
CREATE TABLE assignments (
    chore_id TEXT,
    user_id TEXT,
    assigned_at TIMESTAMP,
    FOREIGN KEY (chore_id) REFERENCES chores (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

#### Completion History
```sql
CREATE TABLE completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id TEXT,
    user_id TEXT,
    completed_at TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (chore_id) REFERENCES chores (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## Key Features

### Task Management
- **Flexible Scheduling**: Daily, weekly, monthly, and custom intervals
- **Priority System**: 1-5 priority levels with visual indicators
- **Subtasks**: Hierarchical task breakdown
- **Rich Descriptions**: Markdown support for task details
- **Icon System**: Visual task categorization

### User Management
- **Multi-user Support**: Household member management
- **Home Assistant Integration**: Link to HA user accounts
- **Color Coding**: Personal color schemes for visual identification
- **Assignment Tracking**: Who completed what and when

### Dashboard Features
- **Real-time Updates**: Live task status updates
- **Statistics**: Completion rates, streaks, user performance
- **Responsive Design**: Mobile and desktop optimized
- **Theme Integration**: Home Assistant theme compatibility
- **Search and Filtering**: Advanced task discovery

### Notification System
- **Smart Notifications**: Due date reminders
- **Multi-channel**: Home Assistant notifications, mobile alerts
- **Customizable**: User-defined notification preferences
- **History Tracking**: Notification delivery logs

## Development Considerations

### Performance Optimizations
- **Lazy Loading**: Components loaded on demand
- **Caching**: API response caching with invalidation
- **Batch Operations**: Bulk database operations
- **Efficient Rendering**: React optimization patterns

### Security
- **Authentication**: Home Assistant token validation
- **Input Sanitization**: XSS prevention
- **SQL Injection Protection**: Parameterized queries
- **CSRF Protection**: Request validation

### Scalability
- **Modular Architecture**: Easy feature additions
- **Database Indexing**: Optimized query performance
- **Component Reusability**: DRY principle implementation
- **API Versioning**: Backward compatibility support

## File Size Guidelines
- Keep individual files under 600 lines
- Split large components into smaller, focused modules
- Use composition over inheritance
- Maintain clear separation of concerns

## Browser Compatibility
- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+
- **ES6+ Features**: Native support required
- **CSS Grid/Flexbox**: Modern layout support
- **WebSocket**: Real-time communication support

## Integration Points

### Home Assistant
- **Entity System**: Task status as HA entities
- **Automation Integration**: Trigger tasks from automations
- **User System**: Leverage HA user management
- **Frontend Integration**: Embedded dashboard support

### External Services
- **Calendar Integration**: Sync with calendar applications
- **Notification Services**: Push notification support
- **Backup System**: Database export/import capabilities
- **API Webhooks**: External system integration

## Development Workflow

### Local Development
1. Set up Home Assistant development environment
2. Install component in custom_components directory
3. Configure YAML integration
4. Access dashboard via Home Assistant frontend
5. Use browser DevTools for frontend debugging

### Testing Strategy
- Testing in production - we'll see it as it goes.

### Deployment
- **Version Management**: Semantic versioning
- **Database Migrations**: Schema update handling
- **Cache Invalidation**: Frontend update deployment
- **Backward Compatibility**: Legacy support maintenance

This modular, scalable architecture provides a solid foundation for a comprehensive household task management system while maintaining clean separation of concerns and following modern web development best practices.