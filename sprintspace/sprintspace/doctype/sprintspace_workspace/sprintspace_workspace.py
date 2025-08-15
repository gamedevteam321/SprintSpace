# Copyright (c) 2024, Cursor-Auto and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now


class SprintSpaceWorkspace(Document):
    def validate(self):
        if not self.owner_user:
            self.owner_user = frappe.session.user
    
    def before_insert(self):
        self.created_date = now()
        self.modified_date = now()
    
    def on_update(self):
        self.modified_date = now()


@frappe.whitelist()
def get_user_workspaces():
    """Get all workspaces accessible to the current user"""
    user = frappe.session.user
    
    # Get workspaces owned by user or public workspaces
    workspaces = frappe.get_all(
        "SprintSpace Workspace",
        or_filters=[
            ["owner_user", "=", user],
            ["is_public", "=", 1]
        ],
        fields=["name", "title", "description", "created_date", "modified_date"],
        order_by="modified_date desc"
    )
    
    return workspaces


@frappe.whitelist()
def create_workspace(title, description=""):
    """Create a new workspace for the current user"""
    workspace = frappe.get_doc({
        "doctype": "SprintSpace Workspace",
        "title": title,
        "description": description,
        "owner_user": frappe.session.user
    })
    workspace.insert()
    
    # Create a default "Getting Started" page
    from sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page import create_page
    create_page(workspace.name, "Getting Started", get_default_page_content())
    
    return workspace.name


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
