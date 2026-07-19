# Personal Recurring Reminder Bot — Bot specification

**Archetype:** workflow

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for creating, managing, and receiving private recurring reminders (daily/weekly) with snooze and mark-done actions. Delivers notifications via private chat with inline buttons for actions.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual Telegram users
- non-technical users
- users needing medication/workflow reminders

## Success criteria

- Users can create and manage reminders without errors
- Notifications delivered at scheduled times with actionable buttons
- Snooze/mark-done actions update reminders correctly

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with create/list/help options
- **/new** (command, actor: user, command: /new) — Start guided reminder creation flow
- **/list** (command, actor: user, command: /list) — Show active reminders with management buttons
- **/help** (command, actor: user, command: /help) — Display command explanations and quick buttons
- **/settings** (command, actor: user, command: /settings) — Configure snooze defaults and timezone

## Flows

### onboarding
_Trigger:_ /start

1. Display greeting
2. Show quick-action buttons for create/list/help

_Data touched:_ User

### reminder_creation
_Trigger:_ /new or /remind

1. Collect reminder text
2. Select schedule type (daily/weekly)
3. Set time/weekdays
4. Confirm timezone
5. Save reminder

_Data touched:_ Reminder

### notification_delivery
_Trigger:_ Scheduled time

1. Send reminder message
2. Attach snooze/mark-done buttons
3. Track last-fired timestamp

_Data touched:_ Notification

### snooze_handling
_Trigger:_ Snooze button or command

1. Reschedule occurrence
2. Confirm snooze duration
3. Update last-fired timestamp

_Data touched:_ Reminder

### completion_tracking
_Trigger:_ Mark done button

1. Mark occurrence as completed
2. Log completion timestamp
3. Optionally show completion history

_Data touched:_ Reminder

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram account with preferences and timezone
  - fields: telegram_id, timezone, snooze_defaults
- **Reminder** _(retention: persistent)_ — Recurring reminder configuration and state
  - fields: title, schedule_type, time, weekdays, timezone, enabled, snooze_state, last_fired, end_date
- **Notification** _(retention: session)_ — Scheduled delivery instance with actions
  - fields: reminder_id, payload, scheduled_time, actions

## Integrations

- **Telegram** (required) — Private chat notifications and inline buttons
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Create/edit/delete reminders
- Pause/reactivate reminders
- Configure snooze defaults
- View completion history

## Notifications

- Scheduled reminder messages with Snooze/Mark done buttons
- Confirmation messages for snooze/completion actions

## Permissions & privacy

- Store reminders and user preferences securely
- Only send notifications to the user's private chat
- Comply with Telegram's privacy policies

## Edge cases

- Timezone conversion errors
- Conflicting reminder schedules
- Invalid snooze duration inputs
- Missing Telegram-provided timezone

## Required tests

- End-to-end reminder creation and notification flow
- Button click handling for snooze/mark-done
- Timezone-aware scheduling validation
- Persistence across bot restarts

## Assumptions

- Users want simple daily/weekly recurrence only
- Notifications should match local timezone
- Snooze defaults cover most use cases
- No external calendar sync needed
