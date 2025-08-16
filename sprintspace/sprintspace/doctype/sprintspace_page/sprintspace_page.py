# Copyright (c) 2024, Cursor-Auto and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now
import json


class SprintSpacePage(Document):
    def validate(self):
        if self.content_json:
            try:
                json.loads(self.content_json)
            except Exception:
                frappe.throw('Content JSON is not valid JSON.')
    
    def before_insert(self):
        self.created_date = now()
        self.created_by = frappe.session.user
        self.last_edited_date = now()
        self.last_edited_by = frappe.session.user
        
        # Set page order if not specified
        if not self.page_order:
            max_order = frappe.db.sql("""
                SELECT COALESCE(MAX(page_order), 0) 
                FROM `tabSprintSpace Page` 
                WHERE workspace = %s AND is_archived = 0
            """, self.workspace)[0][0]
            self.page_order = max_order + 1
    
    def on_update(self):
        self.last_edited_date = now()
        self.last_edited_by = frappe.session.user


@frappe.whitelist()
def get_workspace_pages(workspace):
    """Get all pages for a workspace"""
    if not frappe.has_permission("SprintSpace Page", "read"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    pages = frappe.get_all(
        "SprintSpace Page",
        filters={
            "workspace": workspace,
            "is_archived": 0
        },
        fields=["name", "title", "page_order", "last_edited_date", "last_edited_by"],
        order_by="page_order asc, created_date asc"
    )
    
    return pages


@frappe.whitelist()
def get_page_content(page_name):
    """Get the content of a specific page"""
    if not frappe.has_permission("SprintSpace Page", "read"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    page = frappe.get_doc("SprintSpace Page", page_name)
    return {
        "name": page.name,
        "title": page.title,
        "workspace": page.workspace,
        "content_json": page.content_json,
        "last_edited_date": page.last_edited_date,
        "last_edited_by": page.last_edited_by
    }


@frappe.whitelist()
def create_page(workspace, title, content_json=None):
    """Create a new page in a workspace"""
    if not frappe.has_permission("SprintSpace Page", "create"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    if not content_json:
        content_json = get_default_page_content()
    
    if isinstance(content_json, dict):
        content_json = json.dumps(content_json)
    
    page = frappe.get_doc({
        "doctype": "SprintSpace Page",
        "workspace": workspace,
        "title": title,
        "content_json": content_json
    })
    page.insert()
    
    return page.name


@frappe.whitelist()
def update_page_content(page_name, content_json):
    """Update the content of a page"""
    if not frappe.has_permission("SprintSpace Page", "write"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    page = frappe.get_doc("SprintSpace Page", page_name)
    page.content_json = content_json
    page.save()
    
    return True


@frappe.whitelist()
def update_page_title(page_name, title):
    """Update the title of a page"""
    if not frappe.has_permission("SprintSpace Page", "write"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    page = frappe.get_doc("SprintSpace Page", page_name)
    page.title = title
    page.save()
    
    return True


@frappe.whitelist()
def delete_page(page_name):
    """Delete a page (mark as archived)"""
    if not frappe.has_permission("SprintSpace Page", "delete"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    page = frappe.get_doc("SprintSpace Page", page_name)
    page.is_archived = 1
    page.save()
    
    return True


@frappe.whitelist()
def reorder_pages(workspace, page_orders):
    """Update the order of pages in a workspace"""
    if not frappe.has_permission("SprintSpace Page", "write"):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    # page_orders should be a list of {"name": "PAGE-00001", "order": 1}
    if isinstance(page_orders, str):
        page_orders = json.loads(page_orders)
    
    for item in page_orders:
        frappe.db.set_value("SprintSpace Page", item["name"], "page_order", item["order"])
    
    frappe.db.commit()
    return True


@frappe.whitelist()
def get_frappe_users():
    """Get list of Frappe users for assignment in todo lists"""
    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        fields=["name", "full_name", "email"],
        order_by="full_name"
    )
    
    return users

def get_default_page_content():
    """Return default content for a new page"""
    return {
        "time": frappe.utils.now(),
        "blocks": [
            {
                "type": "paragraph",
                "data": {
                    "text": "Type <strong>/</strong> for commands or start writing your content here..."
                }
            }
        ],
        "version": "2.30.7"
    }
