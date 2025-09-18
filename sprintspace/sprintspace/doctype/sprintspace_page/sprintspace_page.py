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
        # Normalize visibility defaults
        if getattr(self, "visibility", None) == "Company" and not getattr(self, "company", None):
            self.company = frappe.db.get_default("company")
    
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

    def has_user_access(self, user: str, write: bool = False) -> bool:
        # Owner always
        if user == (self.created_by or self.last_edited_by):
            return True
        # Page visibility override
        visibility = getattr(self, "visibility", "Use Workspace")
        if visibility == "Use Workspace":
            ws = frappe.get_doc("SprintSpace Workspace", self.workspace)
            return ws.has_user_access(user, write)
        if visibility == "Private":
            return False
        if visibility == "Company":
            company = getattr(self, "company", None) or frappe.db.get_default("company")
            if not company:
                return False
            user_company = frappe.db.get_value("User", user, "company") or frappe.db.get_default("company")
            return user_company == company
        if visibility == "Specific Users":
            rows = self.get("collaborators") or []
            for r in rows:
                if r.user == user:
                    return True if not write else (r.access == "Editor")
        return False


@frappe.whitelist()
def get_workspace_pages(workspace):
    """Get all pages for a workspace"""
    user = frappe.session.user
    # Filter pages based on per-page visibility logic
    all_pages = frappe.get_all(
        "SprintSpace Page",
        filters={"workspace": workspace, "is_archived": 0},
        fields=["name", "title", "page_order", "last_edited_date", "last_edited_by", "visibility", "company", "created_by"],
        order_by="page_order asc, created_date asc",
    )
    pages = []
    ws = frappe.get_doc("SprintSpace Workspace", workspace)
    for p in all_pages:
        if p.visibility == "Use Workspace":
            if ws.has_user_access(user, write=False):
                pages.append({k: p.get(k) for k in ["name", "title", "page_order", "last_edited_date", "last_edited_by", "visibility"]})
        elif p.visibility == "Private":
            if p.created_by == user:
                pages.append({k: p.get(k) for k in ["name", "title", "page_order", "last_edited_date", "last_edited_by", "visibility"]})
        elif p.visibility == "Company":
            user_company = frappe.db.get_value("User", user, "company") or frappe.db.get_default("company")
            if user_company and user_company == (p.company or frappe.db.get_default("company")):
                pages.append({k: p.get(k) for k in ["name", "title", "page_order", "last_edited_date", "last_edited_by", "visibility"]})
        elif p.visibility == "Specific Users":
            is_collab = frappe.db.exists("SprintSpace Page Collaborator", {"parent": p.name, "user": user})
            if is_collab:
                pages.append({k: p.get(k) for k in ["name", "title", "page_order", "last_edited_date", "last_edited_by", "visibility"]})
    
    return pages


@frappe.whitelist()
def get_page_content(page_name):
    """Get the content of a specific page"""
    page = frappe.get_doc("SprintSpace Page", page_name)
    if not page.has_user_access(frappe.session.user, write=False):
        frappe.throw("Not permitted", frappe.PermissionError)
    ws = frappe.get_doc("SprintSpace Workspace", page.workspace)
    return {
        "name": page.name,
        "title": page.title,
        "workspace": page.workspace,
        "content_json": page.content_json,
        "last_edited_date": page.last_edited_date,
        "last_edited_by": page.last_edited_by,
        "created_by": page.created_by,
        "workspace_owner": ws.owner_user
    }


@frappe.whitelist()
def create_page(workspace, title, content_json=None, visibility: str = "Use Workspace", company: str | None = None, collaborators=None):
    """Create a new page in a workspace with visibility/collaborators"""
    ws = frappe.get_doc("SprintSpace Workspace", workspace)
    if not ws.has_user_access(frappe.session.user, write=True):
        frappe.throw("Not permitted", frappe.PermissionError)
    
    if not content_json:
        content_json = get_default_page_content()
    
    if isinstance(content_json, dict):
        content_json = json.dumps(content_json)
    if isinstance(collaborators, str):
        try:
            collaborators = frappe.parse_json(collaborators)
        except Exception:
            collaborators = None
    
    page = frappe.get_doc({
        "doctype": "SprintSpace Page",
        "workspace": workspace,
        "title": title,
        "content_json": content_json,
        "visibility": visibility,
        "company": company,
    })
    if collaborators:
        for c in collaborators:
            page.append("collaborators", {"user": c.get("user"), "access": c.get("access", "Viewer")})
    # Ensure creator is always a collaborator with Editor when using Specific Users
    if visibility == "Specific Users":
        creator = frappe.session.user
        has_creator = any(r.user == creator for r in (page.get("collaborators") or []))
        if not has_creator:
            page.append("collaborators", {"user": creator, "access": "Editor"})
    page.insert()
    
    return page.name


@frappe.whitelist()
def get_page_settings(page_name: str):
    page = frappe.get_doc("SprintSpace Page", page_name)
    if not page.has_user_access(frappe.session.user, write=False):
        frappe.throw("Not permitted", frappe.PermissionError)
    return {
        "name": page.name,
        "title": page.title,
        "visibility": getattr(page, "visibility", "Use Workspace"),
        "company": getattr(page, "company", None),
        "owner_user": page.created_by,
        "collaborators": [
            {"user": r.user, "access": r.access} for r in (page.get("collaborators") or [])
        ],
    }


@frappe.whitelist()
def update_page_settings(page_name: str, visibility: str, company: str | None = None, collaborators=None):
    page = frappe.get_doc("SprintSpace Page", page_name)
    # Only page creator can change page settings
    if frappe.session.user != page.created_by:
        frappe.throw("Only the page creator can change settings", frappe.PermissionError)

    if isinstance(collaborators, str):
        try:
            collaborators = frappe.parse_json(collaborators)
        except Exception:
            collaborators = None

    page.visibility = visibility
    page.company = company
    page.set("collaborators", [])
    if collaborators:
        for c in collaborators:
            page.append("collaborators", {"user": c.get("user"), "access": c.get("access", "Viewer")})
    # Ensure creator always present with Editor when Specific Users is chosen
    if visibility == "Specific Users":
        creator = page.created_by or frappe.session.user
        if not any(r.user == creator for r in (page.get("collaborators") or [])):
            page.append("collaborators", {"user": creator, "access": "Editor"})
    page.save()
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist()
def get_company_users():
    """Return enabled system users from the current user's company (fallback: all enabled system users)."""
    user_company = frappe.db.get_value("User", frappe.session.user, "company") or frappe.db.get_default("company")
    filters = {"enabled": 1, "user_type": "System User"}
    if user_company:
        filters["company"] = user_company
    users = frappe.get_all("User", filters=filters, fields=["name", "full_name", "email"], order_by="full_name")
    return users


@frappe.whitelist()
def update_page_content(page_name, content_json):
    """Update the content of a page"""
    page = frappe.get_doc("SprintSpace Page", page_name)
    if not page.has_user_access(frappe.session.user, write=True):
        frappe.throw("Not permitted", frappe.PermissionError)
    page.content_json = content_json
    page.save()
    
    return True


@frappe.whitelist()
def update_page_title(page_name, title):
    """Update the title of a page"""
    page = frappe.get_doc("SprintSpace Page", page_name)
    if not page.has_user_access(frappe.session.user, write=True):
        frappe.throw("Not permitted", frappe.PermissionError)
    page.title = title
    page.save()
    
    return True


@frappe.whitelist()
def delete_page(page_name):
    """Delete a page (mark as archived)"""
    page = frappe.get_doc("SprintSpace Page", page_name)
    if not page.has_user_access(frappe.session.user, write=True):
        frappe.throw("Not permitted", frappe.PermissionError)
    page.is_archived = 1
    page.save()
    
    return True


@frappe.whitelist()
def reorder_pages(workspace, page_orders):
    """Update the order of pages in a workspace"""
    ws = frappe.get_doc("SprintSpace Workspace", workspace)
    if not ws.has_user_access(frappe.session.user, write=True):
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
