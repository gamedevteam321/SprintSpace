# SprintSpace Guide

This guide explains what the SprintSpace app does, how access works, and how to use every editor block.

## What SprintSpace Is

SprintSpace is a Notion‑like workspace built on Frappe. It provides:

- Workspaces with pages (rich text editor with slash‑commands)
- Page visibility that can override workspace visibility
- Task management blocks: Kanban and Timeline
- Company‑aware collaboration (Viewer/Editor)

Route: `/sprintspace` (authenticated users only)

---

## Access & Visibility

### Workspace
- Visibility options: `Private`, `Company`, `Specific Users`.
- Only the **workspace owner** can change workspace settings.
- Company visibility shows the workspace to users in the same company (`User.company` or default company).

### Page
- Visibility options: `Use Workspace`, `Private`, `Company`, `Specific Users`.
- Page **creator only** can change page settings (title, visibility, collaborators).
- For `Specific Users`, the creator is always included as `Editor` automatically.
- Page visibility can be stricter than the workspace (e.g., a Private page inside a Company workspace).

---

## Creating & Editing

1. Go to `/sprintspace` → create a workspace.
2. Add a page → type `/` to open the command menu and insert blocks.
3. Use the page Settings (gear) to set visibility, company, and collaborators (creator only).
4. Kanban/Timeline blocks help manage tasks visually.

Auto‑save updates page content in the background.

---

## Blocks (Slash‑Menu)

Type `/` in a page to open the command menu. Insert any of the following:

### Paragraph
Basic text block. Placeholder appears when empty. Supports inline formatting via the browser’s selection toolbar (bold/italic, etc.).

### Headings (H1, H2, H3)
Larger titles for structure. Placeholders appear until you type.

### Bulleted list
Unordered list for notes and ideas. Each list item is editable; press Enter to add another.

### Numbered list
Ordered list for steps and procedures. Numbering updates automatically.

### Checklist
Simple checklist with checkboxes. Items strike through when checked.

### Todo list (with assignees)
Task list that supports:
- Assignee (select from company users)
- Priority (cycles Low → Medium → High)
- Due date (optional)
Press Enter on a task to add a new one; use the "Add Todo" action to insert items.

### @ Mentions
Mention users from your company in any text content:
- Type `@` followed by a name or email to search for users
- Use arrow keys to navigate the mention menu
- Press Enter to select a user or click to choose
- Mentions are highlighted and stored with user information
- Only shows users from your company for security

### Table
Lightweight table for tabular notes. Add rows/columns using the inline buttons. Cells are directly editable.

### Toggle
Collapsible content section. Helpful for FAQs or hiding details. Click the toggle header to expand/collapse.

### Divider
Thin horizontal line to visually separate sections.

### Kanban Board
Project/task board that groups `Task` documents by status.

Features:
- Columns are derived from the `Task.status` options.
- Drag a card between columns to update status (server checks permissions).
- “Create Sample Tasks” button shows behavior when a board is empty.

Use cases:
- Team task tracking at a high level.
- Visual progress across statuses (e.g., Backlog, To Do, In Progress, Review, Done).

### Timeline (Notion‑style)
Plan tasks on a date grid.

Layout:
- **Left**: task list (click a task to edit details in a drawer)
- **Right**: timeline grid with month/year header and day columns; bars span start→due

Toolbar:
- `+ Add task` creates a new task and opens the details drawer
- Range selector: 7/14/30 days

Details drawer (opens from the **right**):
- Title, Status (Not Started/In Progress/Done)
- Start date, Due date
- Assignee (company users)
- Notes
- Save / Delete

Notes:
- The grid is read‑only (no inputs there); edits happen in the drawer.
- Task bars re‑render automatically when dates change.

---

## Collaboration & Company Users

- `Company` visibility uses the current user’s company (`User.company`) or the site’s default company.
- When choosing assignees or specific collaborators, the user list is populated from enabled system users in the same company.
- Permissions are enforced server‑side on every API call.

---

## Where Things Live (APIs)

### Workspace
- `create_workspace(title, description, visibility, company, collaborators)`
- `get_user_workspaces()`
- `get_workspace_settings(workspace_name)` / `update_workspace_settings(...)`
- Helper: `get_current_user_company()`

### Pages
- `get_workspace_pages(workspace)` (filters by visibility/collaboration)
- `get_page_content(page_name)`
- `create_page(workspace, title, content_json?, visibility?, company?, collaborators?)`
- `update_page_content(page_name, content_json)`
- `update_page_settings(page_name, visibility, company, collaborators)` (creator only)
- `get_company_users()` (assignees/collaborators list)

### Kanban Tasks
- `get_tasks_for_project(project_name, project_field, status_field)`
- `update_task_status(task_name, new_status, status_field)`

---

## Tips & Conventions

- Use page Settings to rename (centralized naming). Inline rename can be disabled if desired.
- Prefer `Specific Users` for pages that need tight control while keeping a workspace discoverable to the company.
- Timeline + Kanban complement each other: use Kanban for status flows, Timeline for scheduling.

---

## Roadmap Ideas

- Persist Timeline tasks into page JSON or a child DocType for reloading and reporting.
- Drag‑to‑resize timeline bars and “Today” indicator line.
- Inline quick actions (e.g., /task quick entry) that also create Frappe `Task` documents.

