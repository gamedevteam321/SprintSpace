import frappe
from frappe.model.document import Document
from frappe.utils import now


class SprintSpacePageCollaborator(Document):
    def before_insert(self):
        if not self.added_by:
            self.added_by = frappe.session.user
        if not self.added_on:
            self.added_on = now()


