// Debug script for SprintSpace @ mentions
// Run this in the browser console to test mention functionality

console.log('SprintSpace @ Mention Debug Script');

// Test 1: Check if mention features are initialized
function testMentionInitialization() {
    console.log('=== Testing Mention Initialization ===');
    
    if (window.sprintSpaceApp) {
        console.log('✅ SprintSpace app found');
        console.log('Mention state:', window.sprintSpaceApp.mentionState);
        console.log('Editor element:', window.sprintSpaceApp.editor);
        
        if (window.sprintSpaceApp.mentionState) {
            console.log('✅ Mention state initialized');
        } else {
            console.log('❌ Mention state not initialized');
        }
    } else {
        console.log('❌ SprintSpace app not found');
    }
}

// Test 2: Check if editor has event listeners
function testEventListeners() {
    console.log('=== Testing Event Listeners ===');
    
    const editor = document.getElementById('sprintspace-editor');
    if (editor) {
        console.log('✅ Editor element found');
        
        // Check for mention-related event listeners
        const events = ['input', 'keydown', 'keyup'];
        events.forEach(eventType => {
            const hasListener = editor.on[eventType] || 
                               editor.addEventListener.toString().includes(eventType);
            console.log(`${eventType} listener:`, hasListener ? '✅' : '❌');
        });
    } else {
        console.log('❌ Editor element not found');
    }
}

// Test 3: Test mention detection manually
function testMentionDetection() {
    console.log('=== Testing Mention Detection ===');
    
    if (window.sprintSpaceApp && window.sprintSpaceApp.checkForMention) {
        console.log('Running checkForMention...');
        window.sprintSpaceApp.checkForMention();
    } else {
        console.log('❌ checkForMention method not available');
    }
}

// Test 4: Test API call
async function testMentionAPI() {
    console.log('=== Testing Mention API ===');
    
    try {
        const response = await frappe.call({
            method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users',
            args: { query: 'admin' }
        });
        
        console.log('✅ API call successful');
        console.log('Response:', response);
        console.log('Users found:', response.message ? response.message.length : 0);
    } catch (error) {
        console.log('❌ API call failed:', error);
    }
}

// Test 5: Simulate typing @
function simulateAtTyping() {
    console.log('=== Simulating @ Typing ===');
    
    const editor = document.getElementById('sprintspace-editor');
    if (editor) {
        // Focus the editor
        editor.focus();
        
        // Create a text node with @
        const textNode = document.createTextNode('@');
        editor.appendChild(textNode);
        
        // Set cursor position
        const range = document.createRange();
        range.setStart(textNode, 1);
        range.setEnd(textNode, 1);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        console.log('✅ Simulated typing @');
        console.log('Editor content:', editor.innerHTML);
        
        // Trigger mention check
        if (window.sprintSpaceApp && window.sprintSpaceApp.checkForMention) {
            setTimeout(() => {
                window.sprintSpaceApp.checkForMention();
            }, 100);
        }
    } else {
        console.log('❌ Editor not found');
    }
}

// Run all tests
function runAllTests() {
    console.log('🚀 Running all mention tests...');
    testMentionInitialization();
    testEventListeners();
    testMentionDetection();
    testMentionAPI();
    simulateAtTyping();
    console.log('✅ All tests completed');
}

// Export functions to window for manual testing
window.testMentionInitialization = testMentionInitialization;
window.testEventListeners = testEventListeners;
window.testMentionDetection = testMentionDetection;
window.testMentionAPI = testMentionAPI;
window.simulateAtTyping = simulateAtTyping;
window.runAllTests = runAllTests;

console.log('Debug functions available:');
console.log('- testMentionInitialization()');
console.log('- testEventListeners()');
console.log('- testMentionDetection()');
console.log('- testMentionAPI()');
console.log('- simulateAtTyping()');
console.log('- runAllTests()');
console.log('- debugMentions() (if available)');
