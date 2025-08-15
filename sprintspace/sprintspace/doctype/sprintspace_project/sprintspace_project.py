import frappe
import json
from frappe.model.document import Document
from frappe.utils import now


class SprintspaceProject(Document):
    def validate(self):
        if self.content_json:
            try:
                json.loads(self.content_json)
            except Exception:
                frappe.throw('Content JSON is not valid JSON.')

    def on_update(self):
        self.last_synced = now()


@frappe.whitelist()
def get_tasks_for_project(project_name: str, project_field: str="project", status_field: str="status"):
    """Return tasks grouped by status for kanban rendering. Respects permissions."""
    if not frappe.has_permission("Task", "read"):
        frappe.throw("Not permitted", frappe.PermissionError)

    filters = {project_field: project_name}
    fields = ["name", "subject", f"{status_field} as status", "modified", "owner", "exp_end_date"]
    tasks = frappe.get_all("Task", filters=filters, fields=fields, order_by="modified desc")

    groups = {}
    for t in tasks:
        groups.setdefault(t.get("status") or "Open", []).append(t)
    return groups


@frappe.whitelist()
def update_task_status(task_name: str, new_status: str, status_field: str="status"):
    """Update a single task's status (drag-drop)."""
    if not frappe.has_permission("Task", "write"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    doc = frappe.get_doc("Task", task_name)
    # Check if user has write permission on this specific document
    doc.check_permission("write")
    
    setattr(doc, status_field, new_status)
    doc.save()
    frappe.db.commit()
    
    return {"ok": True}


@frappe.whitelist()
def create_sample_tasks(project_name: str):
    """Create sample tasks for testing the kanban functionality."""
    if not frappe.has_permission("Task", "create"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    sample_tasks = [
        {"subject": "Setup project structure", "status": "Open"},
        {"subject": "Design user interface", "status": "Open"}, 
        {"subject": "Implement authentication", "status": "Working"},
        {"subject": "Write unit tests", "status": "Pending Review"},
        {"subject": "Deploy to production", "status": "Completed"}
    ]
    
    created_tasks = []
    for task_data in sample_tasks:
        task = frappe.get_doc({
            "doctype": "Task",
            "subject": task_data["subject"],
            "status": task_data["status"],
            "project": project_name
        })
        task.insert()
        created_tasks.append(task.name)
    
    frappe.db.commit()
    return {"created_tasks": created_tasks}
