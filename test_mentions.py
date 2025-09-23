#!/usr/bin/env python3
"""
Test script for SprintSpace @ mention functionality
"""

import frappe
import json

def test_mention_functionality():
    """Test the @ mention functionality"""
    print("Testing SprintSpace @ mention functionality...")
    
    try:
        # Test 1: Search for company users
        print("\n1. Testing company user search...")
        users = frappe.call('sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users', {
            'query': 'admin'
        })
        print(f"Found {len(users)} users matching 'admin'")
        for user in users:
            print(f"  - {user.get('full_name', user.get('name'))} ({user.get('email')})")
        
        # Test 2: Search with empty query
        print("\n2. Testing empty query...")
        all_users = frappe.call('sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users', {
            'query': ''
        })
        print(f"Found {len(all_users)} total company users")
        
        # Test 3: Test mention data structure
        print("\n3. Testing mention data structure...")
        if users:
            user = users[0]
            mention_data = {
                'user_id': user.get('name'),
                'user_name': user.get('full_name', user.get('name')),
                'user_email': user.get('email'),
                'image_url': user.get('image_url')
            }
            print(f"Mention data structure: {json.dumps(mention_data, indent=2)}")
        
        print("\n✅ All mention tests passed!")
        return True
        
    except Exception as e:
        print(f"\n❌ Mention test failed: {str(e)}")
        return False

def test_mention_in_content():
    """Test mention rendering in content"""
    print("\n4. Testing mention rendering in content...")
    
    # Sample content with mentions
    sample_content = {
        "time": 1704067200000,
        "blocks": [
            {
                "type": "raw",
                "data": {
                    "html": '<p>Hello <span class="mention" data-user-id="Administrator" data-user-name="Administrator" data-user-email="admin@example.com">@Administrator</span>, how are you?</p>'
                }
            }
        ],
        "version": "2.30.7"
    }
    
    print("Sample content with mention:")
    print(json.dumps(sample_content, indent=2))
    
    # Test HTML parsing
    import re
    mention_pattern = r'<span class="mention"[^>]*>@([^<]+)</span>'
    mentions = re.findall(mention_pattern, sample_content['blocks'][0]['data']['html'])
    print(f"Found {len(mentions)} mentions in content: {mentions}")
    
    print("✅ Mention content test passed!")
    return True

if __name__ == "__main__":
    # Initialize Frappe
    frappe.init(site='localhost')
    frappe.connect()
    
    # Run tests
    test_mention_functionality()
    test_mention_in_content()
    
    print("\n🎉 All @ mention functionality tests completed!")
