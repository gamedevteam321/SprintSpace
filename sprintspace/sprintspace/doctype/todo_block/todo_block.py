import frappe
from frappe.model.document import Document


class TodoBlock(Document):
    def validate(self):
        if not (self.content or '').strip():
            frappe.throw('Content cannot be empty')

    def on_update(self):
        update_parent_progress(self)


def update_parent_progress(doc: Document):
    parent_name = doc.parent_block
    if not parent_name:
        return
    total = frappe.db.count('Todo Block', {
        'parent_block': parent_name
    })
    if not total:
        frappe.db.set_value('Todo Block', parent_name, 'progress', 0)
        return
    checked = frappe.db.count('Todo Block', {
        'parent_block': parent_name,
        'is_checked': 1
    })
    progress = int((checked / total) * 100)
    frappe.db.set_value('Todo Block', parent_name, 'progress', progress)


@frappe.whitelist()
def create_todo(page: str, content: str, parent_block: str | None = None, order: int | None = None):
    if not (content or '').strip():
        frappe.throw('Content cannot be empty')
    doc = frappe.new_doc('Todo Block')
    doc.page = page
    doc.content = content
    doc.parent_block = parent_block
    if order is not None:
        doc.order = order
    doc.insert()
    return doc.as_dict()


@frappe.whitelist()
def toggle_checked(name: str, is_checked: int):
    doc = frappe.get_doc('Todo Block', name)
    doc.is_checked = 1 if int(is_checked) else 0
    doc.save()
    return doc.as_dict()


@frappe.whitelist()
def update_content(name: str, content: str):
    if not (content or '').strip():
        frappe.throw('Content cannot be empty')
    doc = frappe.get_doc('Todo Block', name)
    doc.content = content
    doc.save()
    return doc.as_dict()


@frappe.whitelist()
def delete_todo(name: str):
    doc = frappe.get_doc('Todo Block', name)
    parent = doc.parent_block
    doc.delete()
    if parent:
        # recompute parent progress
        update_parent_progress(frappe.get_doc('Todo Block', parent))
    return {'ok': True}


@frappe.whitelist()
def reorder(name: str, new_order: int, new_parent: str | None = None):
    doc = frappe.get_doc('Todo Block', name)
    if new_parent:
        doc.parent_block = new_parent
    doc.order = int(new_order)
    doc.save()
    return doc.as_dict()


@frappe.whitelist()
def list_by_page(page: str):
    rows = frappe.get_all('Todo Block', filters={'page': page}, fields=['name', 'content', 'is_checked', 'parent_block', 'order', 'progress'], order_by='order asc, creation asc')
    return rows


