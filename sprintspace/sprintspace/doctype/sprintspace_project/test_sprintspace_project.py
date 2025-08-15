import frappe
import unittest
import json
from sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project import SprintspaceProject


class TestSprintspaceProject(unittest.TestCase):
    def setUp(self):
        self.test_project = frappe.get_doc({
            "doctype": "Sprintspace Project",
            "title": "Test Project",
            "status": "Active",
            "content_json": json.dumps({
                "time": 1234567890,
                "blocks": [
                    {
                        "type": "header",
                        "data": {
                            "text": "Test Header",
                            "level": 2
                        }
                    }
                ]
            })
        })

    def test_create_project(self):
        """Test creating a new SprintSpace project."""
        self.test_project.insert()
        self.assertTrue(self.test_project.name)
        self.assertEqual(self.test_project.title, "Test Project")
        self.assertEqual(self.test_project.status, "Active")
        
        # Clean up
        self.test_project.delete()

    def test_json_validation(self):
        """Test that invalid JSON content raises error."""
        self.test_project.content_json = "invalid json content"
        
        with self.assertRaises(frappe.ValidationError):
            self.test_project.insert()

    def test_valid_json(self):
        """Test that valid JSON content is accepted."""
        valid_json = json.dumps({"blocks": []})
        self.test_project.content_json = valid_json
        
        # This should not raise any exceptions
        self.test_project.insert()
        
        # Clean up
        self.test_project.delete()

    def tearDown(self):
        """Clean up any test data."""
        try:
            if self.test_project.name:
                self.test_project.delete()
        except:
            pass
