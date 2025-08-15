import frappe

def get_context(context):
    # Ensure user is logged in
    if frappe.session.user == "Guest":
        frappe.throw("Please login to access SprintSpace", frappe.AuthenticationError)
    
    # Set page context
    context.no_cache = 1
    context.show_sidebar = False
    
    # Page metadata
    context.title = "SprintSpace"
    context.page_name = "sprintspace"
    
    # Include required assets
    context.include_js = [
        "/assets/frappe/js/frappe-web.bundle.js",
        "/assets/sprintspace/js/workspace.js"
    ]
    
    context.include_css = [
        "/assets/sprintspace/css/editor.css"
    ]
    
    return context
