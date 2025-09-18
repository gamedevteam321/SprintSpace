# Copyright (c) 2024, Cursor-Auto and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now


class SprintSpaceWorkspace(Document):
    def validate(self):
        if not self.owner_user:
            self.owner_user = frappe.session.user
        # Normalize company if visibility is Company
        if getattr(self, "visibility", None) == "Company" and not getattr(self, "company", None):
            # Try to infer company from user's default company if available
            default_company = frappe.db.get_default("company")
            if default_company:
                self.company = default_company
    
    def before_insert(self):
        self.created_date = now()
        self.modified_date = now()
    
    def on_update(self):
        self.modified_date = now()

    def has_user_access(self, user: str, write: bool = False) -> bool:
        """Check if user has read/write access based on visibility and collaborators.
        - Private: only owner
        - Company: any user with same company (via User->company or Default company)
        - Specific Users: owner or collaborator (Editor for write, any for read)
        """
        if user == self.owner_user:
            return True

        visibility = getattr(self, "visibility", "Private")
        if visibility == "Private":
            return False

        if visibility == "Company":
            company = getattr(self, "company", None) or frappe.db.get_default("company")
            if not company:
                return False
            # Basic check: allow if user has any Employee/Company assignment matching
            user_company = frappe.db.get_value("User", user, "company") or frappe.db.get_default("company")
            return user_company == company

        if visibility == "Specific Users":
            # Look up collaborators child table
            rows = self.get("collaborators") or []
            for r in rows:
                if r.user == user:
                    return True if not write else (r.access == "Editor")
        return False


@frappe.whitelist()
def get_user_workspaces():
    """Get all workspaces accessible to the current user"""
    user = frappe.session.user
    # Owned workspaces
    owned = frappe.get_all(
        "SprintSpace Workspace",
        filters={"owner_user": user},
        fields=["name", "title", "description", "created_date", "modified_date", "owner_user"],
    )

    # Company-visible workspaces for user's company
    default_company = frappe.db.get_default("company")
    company_ws = []
    if default_company:
        company_ws = frappe.get_all(
            "SprintSpace Workspace",
            filters={"visibility": "Company", "company": default_company},
            fields=["name", "title", "description", "created_date", "modified_date", "owner_user"],
        )

    # Specific user collaborations
    # Fetch child rows where current user is collaborator
    collab_ws = frappe.get_all(
        "SprintSpace Workspace Collaborator",
        filters={"user": user},
        fields=["parent as name"],
    )
    collab_names = [r.name for r in collab_ws]
    collab_ws_full = []
    if collab_names:
        collab_ws_full = frappe.get_all(
            "SprintSpace Workspace",
            filters={"name": ["in", collab_names]},
            fields=["name", "title", "description", "created_date", "modified_date", "owner_user"],
        )

    # Merge unique by name
    seen = set()
    result = []
    for ws in owned + company_ws + collab_ws_full:
        if ws.name not in seen:
            result.append(ws)
            seen.add(ws.name)
    # Sort by modified desc
    result.sort(key=lambda x: x.get("modified_date") or x.get("created_date"), reverse=True)
    return result


@frappe.whitelist()
def create_workspace(title, description="", visibility="Private", company: str | None = None, collaborators=None):
    """Create a new workspace with visibility/collaborators for the current user.
    collaborators: list[{user, access}]
    """
    if isinstance(collaborators, str):
        try:
            collaborators = frappe.parse_json(collaborators)
        except Exception:
            collaborators = None

    workspace = frappe.get_doc({
        "doctype": "SprintSpace Workspace",
        "title": title,
        "description": description,
        "owner_user": frappe.session.user,
        "visibility": visibility,
        "company": company,
    })
    if collaborators:
        for c in collaborators:
            workspace.append("collaborators", {
                "user": c.get("user"),
                "access": c.get("access", "Viewer"),
            })
    workspace.insert()

    # Create a default "Getting Started" page
    from sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page import create_page
    create_page(workspace.name, "Getting Started", get_default_page_content())

    return workspace.name


@frappe.whitelist()
def get_workspace_settings(workspace_name: str):
    ws = frappe.get_doc("SprintSpace Workspace", workspace_name)
    if not ws.has_user_access(frappe.session.user, write=False):
        frappe.throw("Not permitted", frappe.PermissionError)
    return {
        "name": ws.name,
        "title": ws.title,
        "visibility": getattr(ws, "visibility", "Private"),
        "company": getattr(ws, "company", None),
        "owner_user": ws.owner_user,
        "collaborators": [
            {"user": r.user, "access": r.access} for r in (ws.get("collaborators") or [])
        ],
    }


@frappe.whitelist()
def update_workspace_settings(workspace_name: str, visibility: str, company: str | None = None, collaborators=None):
    """Only the workspace owner can change settings"""
    ws = frappe.get_doc("SprintSpace Workspace", workspace_name)
    if frappe.session.user != ws.owner_user:
        frappe.throw("Only the workspace owner can change settings", frappe.PermissionError)

    if isinstance(collaborators, str):
        try:
            collaborators = frappe.parse_json(collaborators)
        except Exception:
            collaborators = None

    ws.visibility = visibility
    ws.company = company
    # reset collaborators
    ws.set("collaborators", [])
    if collaborators:
        for c in collaborators:
            ws.append("collaborators", {"user": c.get("user"), "access": c.get("access", "Viewer")})
    ws.save()
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist()
def get_current_user_company():
    """Return current user's company; fallback to system default company if user's is blank."""
    user = frappe.session.user
    company = frappe.db.get_value("User", user, "company") or frappe.db.get_default("company")
    return {"company": company}


@frappe.whitelist()
def delete_workspace(workspace_name):
    """Delete workspace with proper validation and cascade delete of pages"""
    # Check if workspace exists and user has permission
    workspace = frappe.get_doc("SprintSpace Workspace", workspace_name)
    
    # Check if user can delete this workspace
    if workspace.owner_user != frappe.session.user:
        frappe.throw("You don't have permission to delete this workspace")
    
    # Get all pages for this workspace
    pages = frappe.get_all(
        "SprintSpace Page",
        filters={"workspace": workspace_name},
        pluck="name"
    )
    
    page_count = len(pages)
    
    # First delete all pages
    for page_name in pages:
        try:
            frappe.delete_doc("SprintSpace Page", page_name, ignore_permissions=True, force=True)
        except Exception as e:
            frappe.log_error(f"Error deleting page {page_name}: {str(e)}")
    
    # Commit page deletions
    frappe.db.commit()
    
    # Now delete the workspace
    frappe.delete_doc("SprintSpace Workspace", workspace_name, ignore_permissions=True, force=True)
    
    return {
        "message": f"Workspace deleted successfully along with {page_count} page(s)",
        "page_count": page_count
    }


def get_default_page_content():
    """Return default content for the first page in a workspace"""
    return {
        "time": frappe.utils.now(),
        "blocks": [
            {
                "type": "header",
                "data": {
                    "text": "Welcome to SprintSpace!",
                    "level": 1
                }
            },
            {
                "type": "paragraph", 
                "data": {
                    "text": "This is your first page. Type <strong>/</strong> to add blocks and start building your workspace."
                }
            },
            {
                "type": "paragraph",
                "data": {
                    "text": "You can:"
                }
            },
            {
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "Add pages to organize your content",
                        "Use headings, lists, and checklists",
                        "Create kanban boards for task management",
                        "Share your workspace with team members"
                    ]
                }
            }
        ],
        "version": "2.30.7"
    }
