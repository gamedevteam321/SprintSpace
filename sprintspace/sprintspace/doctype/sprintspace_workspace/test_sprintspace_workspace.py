# Copyright (c) 2024, Cursor-Auto and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestSprintSpaceWorkspace(FrappeTestCase):
    def test_workspace_creation(self):
        """Test that workspace is created with proper defaults"""
        workspace = frappe.get_doc({
            "doctype": "SprintSpace Workspace", 
            "title": "Test Workspace",
            "description": "Test workspace description"
        })
        workspace.insert()
        
        self.assertEqual(workspace.owner_user, frappe.session.user)
        self.assertIsNotNone(workspace.created_date)
        self.assertIsNotNone(workspace.modified_date)
        
        # Clean up
        workspace.delete()
