import frappe

def get_context(context):
    # Redirect to login if not logged in
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/sprintspace"
        raise frappe.Redirect
    
    # Allow all logged-in users (no role restrictions)
    # SprintSpace is accessible to all authenticated users
    
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
