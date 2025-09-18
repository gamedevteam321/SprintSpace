import frappe
from frappe import _
from frappe.utils import validate_email_address
from urllib.parse import urlparse
import requests


@frappe.whitelist()
def upload(page_name: str):
    """Upload a file and attach to the SprintSpace Page. Expects a file in request (doctype-style upload).
    Returns {file_doc, file_url, filename, mime_type, file_size}.
    """
    # Use Frappe's file uploader helper
    file = frappe.get_doc({
        "doctype": "File",
        "attached_to_doctype": "SprintSpace Page",
        "attached_to_name": page_name,
        "is_private": 0
    })
    file.save(ignore_permissions=True)
    # The actual content is handled by Frappe uploader middleware; fetch last saved file for this request
    # Fallback: query latest file attached to this page by current user
    f = frappe.get_all("File", filters={"attached_to_doctype": "SprintSpace Page", "attached_to_name": page_name},
                      fields=["name", "file_url", "file_name", "mime_type", "file_size"], order_by="creation desc", limit=1)
    if not f:
        frappe.throw(_("File upload failed"))
    info = f[0]
    return {
        "file_doc": info.name,
        "file_url": info.file_url,
        "filename": info.file_name,
        "mime_type": info.mime_type,
        "file_size": info.file_size,
    }


@frappe.whitelist()
def link_preview(url: str):
    """Fetch OpenGraph/HTML meta for a bookmark card.
    Returns {title, description, image, favicon, site_name, url}.
    """
    try:
        r = requests.get(url, timeout=4)
        r.raise_for_status()
    except Exception:
        frappe.throw(_("Unable to fetch preview"))

    from bs4 import BeautifulSoup  # requires bs4 already present in bench env
    soup = BeautifulSoup(r.text, "html.parser")

    def og(name, fallback=None):
        tag = soup.find("meta", property=f"og:{name}") or soup.find("meta", attrs={"name": f"og:{name}"})
        return tag.get("content") if tag and tag.has_attr("content") else fallback

    def meta(name, fallback=None):
        tag = soup.find("meta", attrs={"name": name})
        return tag.get("content") if tag and tag.has_attr("content") else fallback

    parsed = urlparse(url)
    site = parsed.hostname or ""
    favicon = soup.find("link", rel=lambda v: v and "icon" in v)
    preview = {
        "url": url,
        "title": og("title", meta("title", soup.title.string if soup.title else site)),
        "description": og("description", meta("description", "")),
        "image": og("image", None),
        "favicon": favicon.get("href") if favicon and favicon.has_attr("href") else None,
        "site_name": og("site_name", site),
    }
    return preview


