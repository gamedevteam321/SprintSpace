# Copyright (c) 2024, Cursor-Auto and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
import json


class TestSprintSpacePage(FrappeTestCase):
    def setUp(self):
        # Create a test workspace
        self.workspace = frappe.get_doc({
            "doctype": "SprintSpace Workspace",
            "title": "Test Workspace Page",
            "description": "Test workspace for page testing"
        })
        self.workspace.insert()
    
    def tearDown(self):
        # Clean up
        frappe.db.delete("SprintSpace Page", {"workspace": self.workspace.name})
        self.workspace.delete()
    
    def test_page_creation(self):
        """Test that page is created with proper defaults"""
        page = frappe.get_doc({
            "doctype": "SprintSpace Page",
            "workspace": self.workspace.name,
            "title": "Test Page"
        })
        page.insert()
        
        self.assertEqual(page.workspace, self.workspace.name)
        self.assertEqual(page.page_order, 1)
        self.assertIsNotNone(page.created_date)
        self.assertEqual(page.created_by, frappe.session.user)
    
    def test_page_ordering(self):
        """Test that pages are ordered correctly"""
        page1 = frappe.get_doc({
            "doctype": "SprintSpace Page",
            "workspace": self.workspace.name,
            "title": "First Page"
        })
        page1.insert()
        
        page2 = frappe.get_doc({
            "doctype": "SprintSpace Page",
            "workspace": self.workspace.name,
            "title": "Second Page"
        })
        page2.insert()
        
        self.assertEqual(page1.page_order, 1)
        self.assertEqual(page2.page_order, 2)
