// SprintSpace Project DocType JavaScript

// Utility functions for SprintSpace
window.SprintSpace = window.SprintSpace || {};

SprintSpace.loadScript = function(src) {
    return new Promise(function(resolve, reject) {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

SprintSpace.loadCSS = function(href) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`link[href="${href}"]`)) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href + '?v=' + Date.now(); // Cache busting
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
};

SprintSpace.initEditor = async function(frm) {
    if (frm.__sprintspace_editor_inited) return;
    frm.__sprintspace_editor_inited = true;

    if (!frm.fields_dict.content_json) return;

    const $wrapper = frm.fields_dict.content_json.$wrapper;
    $wrapper.empty();

    // Load CSS and wait for it to load
    try {
        await SprintSpace.loadCSS("/assets/sprintspace/css/editor.css");
    } catch (error) {
        console.error('Failed to load CSS:', error);
    }

    // Add critical CSS inline as backup
    if (!document.getElementById('sprintspace-critical-css')) {
        const style = document.createElement('style');
        style.id = 'sprintspace-critical-css';
        style.textContent = `
            .sprintspace-command-menu {
                position: fixed !important;
                background: #ffffff;
                border: 1px solid rgba(15, 15, 15, 0.1);
                border-radius: 8px;
                box-shadow: 0px 0px 0px 1px rgba(15, 15, 15, 0.05), 0px 3px 6px rgba(15, 15, 15, 0.1), 0px 9px 24px rgba(15, 15, 15, 0.2);
                min-width: 280px;
                max-height: 380px;
                overflow-y: auto;
                z-index: 9999 !important;
                font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: none;
                padding: 8px 0;
            }
            .command-section-header {
                padding: 8px 16px 4px 16px;
                font-size: 11px;
                font-weight: 600;
                color: rgba(55, 53, 47, 0.65);
                text-transform: uppercase;
                letter-spacing: 0.8px;
                margin-top: 8px;
            }
            .command-section-header:first-child { margin-top: 0; }
            .command-item {
                display: flex;
                align-items: center;
                padding: 6px 16px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                margin: 0 8px;
                border-radius: 4px;
                min-height: 32px;
            }
            .command-item:hover { background-color: rgba(55, 53, 47, 0.08); }
            .command-item.selected { background-color: rgba(35, 131, 226, 0.28); }
            .command-icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 12px;
                font-size: 16px;
                flex-shrink: 0;
                color: rgba(55, 53, 47, 0.65);
            }
            .command-content {
                flex: 1;
                min-width: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .command-text { flex: 1; }
            .command-title {
                font-weight: 500;
                color: rgb(55, 53, 47);
                font-size: 14px;
                margin: 0;
                line-height: 1.2;
            }
            .command-subtitle {
                color: rgba(55, 53, 47, 0.65);
                font-size: 12px;
                margin: 0;
                line-height: 1.2;
            }
            .command-shortcut {
                font-size: 11px;
                color: rgba(55, 53, 47, 0.4);
                font-weight: 400;
                margin-left: 8px;
            }
            .command-menu-footer {
                padding: 8px 16px;
                font-size: 11px;
                color: rgba(55, 53, 47, 0.4);
                text-align: center;
                border-top: 1px solid rgba(55, 53, 47, 0.09);
                margin-top: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    // Create basic editor interface
    $wrapper.html(`
        <div class="sprintspace-toolbar-hint">
            <span class="sprintspace-brand">🚀 SprintSpace</span> • 
            <span id="sprintspace-status">Ready</span>
        </div>
        <div class="editor-holder sprintspace-canvas">
            <div id="sprintspace-basic-editor"></div>
        </div>
    `);

    // Get existing content
    let existingContent = '';
    try {
        if (frm.doc.content_json) {
            const parsed = JSON.parse(frm.doc.content_json);
            if (parsed.blocks) {
                existingContent = SprintSpace.convertBlocksToMarkdown(parsed.blocks);
            }
        }
    } catch (e) {
        console.warn('Could not parse existing content:', e);
    }

    // Create Notion-like editor interface
    const editorHtml = `
        <div class="sprintspace-editor-container" style="position: relative;">
            <div 
                id="sprintspace-editor" 
                class="sprintspace-editor"
                contenteditable="true"
                style="
                    min-height: 400px; 
                    padding: 20px; 
                    border: 1px solid #e5e7eb; 
                    border-radius: 8px; 
                    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 16px; 
                    line-height: 1.6;
                    outline: none;
                    background: white;
                "
                placeholder="Type '/' for commands or start writing..."
            >${SprintSpace.convertMarkdownToHTML(existingContent)}</div>
            <div id="sprintspace-command-menu" class="sprintspace-command-menu" style="display: none;"></div>
            <div style="margin-top: 8px; font-size: 11px; color: #6c757d;">
                ✨ Type <strong>/</strong> for commands • Content saves automatically
            </div>
        </div>
    `;

    $('#sprintspace-basic-editor').html(editorHtml);

    // Setup Notion-like editor functionality
    SprintSpace.setupNotionEditor(frm);

    // Initial save if content exists
    if (!frm.doc.content_json && existingContent) {
        SprintSpace.saveContent(frm);
    }

    $('#sprintspace-status').text('Ready - Type to start editing');
};

// Notion-like Editor Functions
SprintSpace.convertMarkdownToHTML = function(markdown) {
    if (!markdown || markdown.trim() === '') {
        return '<p><br></p>';
    }
    
    return markdown
        .split('\n\n')
        .map(block => {
            block = block.trim();
            if (!block) return '';
            
            // Headers
            if (block.startsWith('# ')) {
                return `<h1>${block.substring(2)}</h1>`;
            } else if (block.startsWith('## ')) {
                return `<h2>${block.substring(3)}</h2>`;
            } else if (block.startsWith('### ')) {
                return `<h3>${block.substring(4)}</h3>`;
            }
            // Checklist
            else if (block.includes('- [')) {
                const items = block.split('\n').map(line => {
                    if (line.match(/^- \[([ x])\]/)) {
                        const checked = line.includes('[x]');
                        const text = line.replace(/^- \[([ x])\] /, '');
                        return `<div class="checklist-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled> ${text}</div>`;
                    }
                    return line;
                }).join('');
                return `<div class="checklist">${items}</div>`;
            }
            // Divider
            else if (block === '---') {
                return '<hr>';
            }
            // Kanban
            else if (block.toUpperCase() === 'KANBAN') {
                return '<div class="kanban-placeholder">📋 Kanban Board (Interactive)</div>';
            }
            // Regular paragraph
            else {
                return `<p>${block}</p>`;
            }
        })
        .join('');
};

SprintSpace.setupNotionEditor = function(frm) {
    const editor = document.getElementById('sprintspace-editor');
    const commandMenu = document.getElementById('sprintspace-command-menu');
    let saveTimeout;
    let isShowingCommands = false;
    let commandRange = null;

    // Command definitions
    const commands = [
        {
            title: 'Text',
            subtitle: 'Just start writing with plain text.',
            icon: 'T',
            keywords: ['text', 'paragraph', 'p'],
            shortcut: '',
            action: () => SprintSpace.insertBlock('paragraph', '')
        },
        {
            title: 'Heading 1',
            subtitle: 'Big section heading.',
            icon: 'H1',
            keywords: ['heading', 'header', 'h1', 'title'],
            shortcut: '#',
            action: () => SprintSpace.insertBlock('heading', '', 1)
        },
        {
            title: 'Heading 2',
            subtitle: 'Medium section heading.',
            icon: 'H2',
            keywords: ['heading', 'header', 'h2', 'subtitle'],
            shortcut: '##',
            action: () => SprintSpace.insertBlock('heading', '', 2)
        },
        {
            title: 'Heading 3',
            subtitle: 'Small section heading.',
            icon: 'H3',
            keywords: ['heading', 'header', 'h3'],
            shortcut: '###',
            action: () => SprintSpace.insertBlock('heading', '', 3)
        },
        {
            title: 'Bulleted list',
            subtitle: 'Create a simple bulleted list.',
            icon: '•',
            keywords: ['list', 'bullet', 'ul'],
            shortcut: '-',
            action: () => SprintSpace.insertBlock('list', '')
        },
        {
            title: 'Numbered list',
            subtitle: 'Create a list with numbering.',
            icon: '1.',
            keywords: ['list', 'number', 'ol', 'numbered'],
            shortcut: '1.',
            action: () => SprintSpace.insertBlock('numbered', '')
        },
        {
            title: 'Checklist',
            subtitle: 'Track tasks with a to-do list.',
            icon: '☑',
            keywords: ['todo', 'task', 'checklist', 'check'],
            shortcut: '[]',
            action: () => SprintSpace.insertBlock('checklist', '')
        },
        {
            title: 'Divider',
            subtitle: 'Visually divide blocks.',
            icon: '―',
            keywords: ['divider', 'separator', 'hr', 'line'],
            shortcut: '---',
            action: () => SprintSpace.insertBlock('divider', '')
        },
        {
            title: 'Kanban Board',
            subtitle: 'Interactive task management board.',
            icon: '📋',
            keywords: ['kanban', 'board', 'tasks', 'project'],
            shortcut: '',
            action: () => SprintSpace.insertBlock('kanban', '')
        }
    ];

    // Input event handler
    editor.addEventListener('input', function(e) {
        // Auto-save
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            SprintSpace.saveContentFromEditor(frm);
        }, 1000);

        // Check for slash command
        setTimeout(() => {
            SprintSpace.checkForSlashCommand(editor, commandMenu, commands);
        }, 10);
    });

    // Keydown handler for command menu navigation and backspace detection
    editor.addEventListener('keydown', function(e) {
        if (SprintSpace.isShowingCommands) {
            if (e.key === 'Escape') {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                SprintSpace.navigateCommandMenu(e.key === 'ArrowDown' ? 1 : -1);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                SprintSpace.executeSelectedCommand();
                SprintSpace.isShowingCommands = false;
            } else if (e.key === 'Backspace') {
                // Let backspace happen, then check if slash was removed
                setTimeout(() => {
                    SprintSpace.checkForSlashCommand(editor, commandMenu, commands);
                }, 10);
            }
        } else if (e.key === 'Backspace') {
            // Even when menu is not showing, check for slash command after backspace
            // in case user is navigating near slash commands
            setTimeout(() => {
                SprintSpace.checkForSlashCommand(editor, commandMenu, commands);
            }, 10);
        }
    });

    // Click event for command items
    commandMenu.addEventListener('click', function(e) {
        const commandItem = e.target.closest('.command-item');
        if (commandItem) {
            const index = parseInt(commandItem.dataset.index);
            SprintSpace.selectedCommandIndex = index;
            SprintSpace.executeSelectedCommand();
            SprintSpace.isShowingCommands = false;
        }
    });
    
    // Hide menu when editor loses focus
    editor.addEventListener('blur', function() {
        setTimeout(() => {
            // Use timeout to allow menu click events to fire first
            if (SprintSpace.isShowingCommands && !commandMenu.contains(document.activeElement)) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
        }, 200);
    });
    
    // Hide menu when clicking outside
    document.addEventListener('click', function(e) {
        if (SprintSpace.isShowingCommands && 
            !editor.contains(e.target) && 
            !commandMenu.contains(e.target)) {
            SprintSpace.hideCommandMenu(commandMenu);
            SprintSpace.isShowingCommands = false;
        }
    });
    
    // Handle checkbox interactions in checklists
    editor.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox' && e.target.closest('.checklist-item')) {
            // Auto-save when checkbox state changes
            setTimeout(() => {
                SprintSpace.saveContentFromEditor(frm);
            }, 100);
        }
    });
    
    // Handle Enter key in lists and checklists to create new items
    editor.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const checklistSpan = e.target.closest('.checklist-item span');
            const listItem = e.target.closest('li');
            
            if (checklistSpan) {
                e.preventDefault();
                
                // Create new checklist item
                const newItem = document.createElement('div');
                newItem.className = 'checklist-item';
                newItem.innerHTML = '<input type="checkbox"> <span contenteditable="true">New task</span>';
                
                const currentItem = checklistSpan.closest('.checklist-item');
                currentItem.parentNode.insertBefore(newItem, currentItem.nextSibling);
                
                // Focus the new item and select its text
                const newSpan = newItem.querySelector('span');
                setTimeout(() => {
                    const range = document.createRange();
                    range.selectNodeContents(newSpan);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    newSpan.focus();
                }, 10);
                
            } else if (listItem && !SprintSpace.isShowingCommands) {
                // Handle regular list items (ul/ol)
                const isBulletList = listItem.closest('ul');
                const isNumberedList = listItem.closest('ol');
                
                if (isBulletList || isNumberedList) {
                    e.preventDefault();
                    
                    // Create new list item
                    const newLi = document.createElement('li');
                    newLi.textContent = 'New item';
                    newLi.contentEditable = true;
                    
                    // Insert after current item
                    listItem.parentNode.insertBefore(newLi, listItem.nextSibling);
                    
                    // Focus and select text in new item
                    setTimeout(() => {
                        const range = document.createRange();
                        range.selectNodeContents(newLi);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        newLi.focus();
                    }, 10);
                }
            }
        }
    });

    // Store references for global access
    SprintSpace.currentEditor = editor;
    SprintSpace.commandRange = null;
    SprintSpace.currentFrm = frm;
    SprintSpace.isShowingCommands = false;

    console.log('SprintSpace editor initialized successfully');
};

SprintSpace.checkForSlashCommand = function(editor, commandMenu, commands) {
    try {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            // No selection - hide menu if showing
            if (SprintSpace.isShowingCommands) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
            return;
        }

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            // Text is selected - hide menu
            if (SprintSpace.isShowingCommands) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
            return;
        }

        // Get the text before cursor
        let textNode = range.startContainer;
        let offset = range.startOffset;

        // If we're in an element node, get the text node
        if (textNode.nodeType === Node.ELEMENT_NODE) {
            if (textNode.childNodes[offset - 1] && textNode.childNodes[offset - 1].nodeType === Node.TEXT_NODE) {
                textNode = textNode.childNodes[offset - 1];
                offset = textNode.textContent.length;
            } else {
                // No text node - hide menu if showing
                if (SprintSpace.isShowingCommands) {
                    SprintSpace.hideCommandMenu(commandMenu);
                    SprintSpace.isShowingCommands = false;
                }
                return;
            }
        }

        if (textNode.nodeType !== Node.TEXT_NODE) {
            // Not in text - hide menu if showing
            if (SprintSpace.isShowingCommands) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
            return;
        }

        const textContent = textNode.textContent;
        const beforeCursor = textContent.substring(0, offset);
        
        // Find the last slash in the text before cursor
        const slashIndex = beforeCursor.lastIndexOf('/');
        
        // If no slash found, hide menu
        if (slashIndex === -1) {
            if (SprintSpace.isShowingCommands) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
            return;
        }

        // Check if the slash is valid (at start of line or after space/newline)
        const charBeforeSlash = slashIndex > 0 ? beforeCursor[slashIndex - 1] : ' ';
        const isValidSlash = (charBeforeSlash === ' ' || charBeforeSlash === '\n' || slashIndex === 0);
        
        if (!isValidSlash) {
            // Slash not in valid position - hide menu
            if (SprintSpace.isShowingCommands) {
                SprintSpace.hideCommandMenu(commandMenu);
                SprintSpace.isShowingCommands = false;
            }
            return;
        }

        // Get the query text after the slash
        const query = beforeCursor.substring(slashIndex + 1);
        
        // Store the range that includes the slash and query
        SprintSpace.commandRange = range.cloneRange();
        SprintSpace.commandRange.setStart(textNode, slashIndex);
        
        // Show menu with query
        SprintSpace.showCommandMenu(commandMenu, commands, query);
        SprintSpace.isShowingCommands = true;

    } catch (error) {
        console.log('Error in checkForSlashCommand:', error);
        if (SprintSpace.isShowingCommands) {
            SprintSpace.hideCommandMenu(commandMenu);
            SprintSpace.isShowingCommands = false;
        }
    }
};

SprintSpace.showCommandMenu = function(menuElement, commands, query) {
    const filteredCommands = commands.filter(cmd => 
        cmd.title.toLowerCase().includes(query.toLowerCase()) ||
        cmd.keywords.some(k => k.includes(query.toLowerCase()))
    );

    if (filteredCommands.length === 0) {
        SprintSpace.hideCommandMenu(menuElement);
        return;
    }

    // Group commands by section
    const basicBlocks = filteredCommands.filter(cmd => 
        ['Text', 'Heading 1', 'Heading 2', 'Heading 3'].includes(cmd.title)
    );
    const lists = filteredCommands.filter(cmd => 
        ['Bulleted list', 'Numbered list', 'Checklist'].includes(cmd.title)
    );
    const media = filteredCommands.filter(cmd => 
        ['Divider', 'Kanban Board'].includes(cmd.title)
    );
    
    let sectionsHtml = '';
    let commandIndex = 0;
    
    if (basicBlocks.length > 0) {
        sectionsHtml += `<div class="command-section-header">Basic blocks</div>`;
        sectionsHtml += basicBlocks.map((cmd) => `
            <div class="command-item ${commandIndex === 0 ? 'selected' : ''}" data-index="${commandIndex++}">
                <div class="command-icon">${cmd.icon}</div>
                <div class="command-content">
                    <div class="command-text">
                        <div class="command-title">${cmd.title}</div>
                        <div class="command-subtitle">${cmd.subtitle}</div>
                    </div>
                    ${cmd.shortcut ? `<div class="command-shortcut">${cmd.shortcut}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
    
    if (lists.length > 0) {
        sectionsHtml += `<div class="command-section-header">Lists</div>`;
        sectionsHtml += lists.map((cmd) => `
            <div class="command-item" data-index="${commandIndex++}">
                <div class="command-icon">${cmd.icon}</div>
                <div class="command-content">
                    <div class="command-text">
                        <div class="command-title">${cmd.title}</div>
                        <div class="command-subtitle">${cmd.subtitle}</div>
                    </div>
                    ${cmd.shortcut ? `<div class="command-shortcut">${cmd.shortcut}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
    
    if (media.length > 0) {
        sectionsHtml += `<div class="command-section-header">Media</div>`;
        sectionsHtml += media.map((cmd) => `
            <div class="command-item" data-index="${commandIndex++}">
                <div class="command-icon">${cmd.icon}</div>
                <div class="command-content">
                    <div class="command-text">
                        <div class="command-title">${cmd.title}</div>
                        <div class="command-subtitle">${cmd.subtitle}</div>
                    </div>
                    ${cmd.shortcut ? `<div class="command-shortcut">${cmd.shortcut}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
    
    sectionsHtml += '<div class="command-menu-footer">Type / on the page · esc</div>';

    menuElement.innerHTML = sectionsHtml;
    menuElement.style.display = 'block';
    
    // Position the menu
    try {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Position relative to viewport
            let top = rect.bottom + 5;
            let left = rect.left;
            
            // Ensure menu doesn't go off screen
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            if (left + 280 > viewportWidth) {
                left = viewportWidth - 280 - 10;
            }
            
            if (top + 380 > viewportHeight) {
                top = rect.top - 380 - 5;
            }
            
            menuElement.style.position = 'fixed';
            menuElement.style.top = top + 'px';
            menuElement.style.left = left + 'px';
        }
    } catch (error) {
        console.error('Error positioning menu:', error);
        // Fallback positioning
        menuElement.style.position = 'fixed';
        menuElement.style.top = '100px';
        menuElement.style.left = '100px';
    }

    // Store filtered commands for execution
    SprintSpace.currentCommands = filteredCommands;
    SprintSpace.selectedCommandIndex = 0;
};

SprintSpace.hideCommandMenu = function(menuElement) {
    menuElement.style.display = 'none';
    menuElement.innerHTML = '';
};

SprintSpace.navigateCommandMenu = function(direction) {
    const items = document.querySelectorAll('.command-item');
    if (items.length === 0) return;

    items[SprintSpace.selectedCommandIndex].classList.remove('selected');
    SprintSpace.selectedCommandIndex = Math.max(0, Math.min(items.length - 1, 
        SprintSpace.selectedCommandIndex + direction));
    items[SprintSpace.selectedCommandIndex].classList.add('selected');
};

SprintSpace.executeSelectedCommand = function() {
    if (SprintSpace.currentCommands && SprintSpace.currentCommands[SprintSpace.selectedCommandIndex]) {
        const command = SprintSpace.currentCommands[SprintSpace.selectedCommandIndex];
        command.action();
    }
    SprintSpace.hideCommandMenu(document.getElementById('sprintspace-command-menu'));
};

SprintSpace.insertBlock = function(type, content, level = 1) {
    try {
        const editor = SprintSpace.currentEditor;
        const range = SprintSpace.commandRange;
        
        if (!editor || !range) {
            return;
        }

        // Remove the / command and any query text
        range.deleteContents();

        let html = '';
        let focusElement = null;

        switch (type) {
            case 'paragraph':
                html = '<p>Type / for commands, or start writing your content here...</p>';
                focusElement = 'p';
                break;
            case 'heading':
                const headingTexts = {
                    1: 'Your Main Heading',
                    2: 'Section Heading', 
                    3: 'Subsection Heading'
                };
                html = `<h${level}>${headingTexts[level] || 'Heading'}</h${level}>`;
                focusElement = `h${level}`;
                break;
            case 'list':
                html = `
                    <ul>
                        <li contenteditable="true">First bullet point</li>
                        <li contenteditable="true">Second bullet point</li>
                        <li contenteditable="true">Add more items as needed</li>
                    </ul>
                `;
                focusElement = 'li';
                break;
            case 'numbered':
                html = `
                    <ol>
                        <li contenteditable="true">First numbered item</li>
                        <li contenteditable="true">Second numbered item</li>
                        <li contenteditable="true">Continue your list</li>
                    </ol>
                `;
                focusElement = 'li';
                break;
            case 'checklist':
                html = `
                    <div class="checklist">
                        <div class="checklist-item">
                            <input type="checkbox"> <span contenteditable="true">Task to complete</span>
                        </div>
                        <div class="checklist-item">
                            <input type="checkbox" checked> <span contenteditable="true">Completed task</span>
                        </div>
                        <div class="checklist-item">
                            <input type="checkbox"> <span contenteditable="true">Another task</span>
                        </div>
                    </div>
                `;
                focusElement = '.checklist-item span';
                break;
            case 'divider':
                html = '<hr><p>Content continues below the divider...</p>';
                focusElement = 'p';
                break;
            case 'kanban':
                html = `
                    <div class="kanban-placeholder" style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 16px 0; border: 2px dashed #cbd5e1;">
                        <div style="font-size: 24px; margin-bottom: 8px;">📋</div>
                        <div style="font-weight: 600; color: #475569; margin-bottom: 4px;">Kanban Board</div>
                        <div style="font-size: 14px; color: #64748b;">Interactive task management board will appear here</div>
                        <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">Save the project to enable kanban functionality</div>
                    </div>
                    <p>Continue writing below the kanban board...</p>
                `;
                focusElement = 'p';
                break;
        }

        // Insert the HTML
        const fragment = range.createContextualFragment(html);
        range.insertNode(fragment);
        
        // Position cursor and select content for easy editing
        setTimeout(() => {
            const selection = window.getSelection();
            selection.removeAllRanges();
            
            let targetElement = null;
            
            // Find the element to focus based on type
            if (focusElement) {
                if (focusElement.startsWith('.')) {
                    // CSS selector
                    targetElement = editor.querySelector(focusElement);
                } else {
                    // Tag name - find the last inserted element of this type
                    const elements = editor.querySelectorAll(focusElement);
                    targetElement = elements[elements.length - 1];
                }
            }
            
            if (targetElement) {
                // Select all text content for easy replacement
                const range = document.createRange();
                
                if (targetElement.firstChild && targetElement.firstChild.nodeType === Node.TEXT_NODE) {
                    // Select all text in the element
                    range.selectNodeContents(targetElement);
                } else if (targetElement.textContent) {
                    // For elements with text content
                    range.selectNodeContents(targetElement);
                } else {
                    // Position cursor at start
                    range.setStart(targetElement, 0);
                    range.collapse(true);
                }
                
                selection.addRange(range);
                targetElement.focus();
            }
        }, 50);
        
        // Auto-save
        setTimeout(() => {
            SprintSpace.saveContentFromEditor(SprintSpace.currentFrm);
        }, 100);
        
    } catch (error) {
        console.error('Error inserting block:', error);
        frappe.show_alert({message: 'Error inserting block: ' + error.message, indicator: 'red'});
    }
};

SprintSpace.saveContentFromEditor = function(frm) {
    const editor = document.getElementById('sprintspace-editor');
    if (!editor) return;
    
    const html = editor.innerHTML;
    const markdown = SprintSpace.convertHTMLToMarkdown(html);
    const blocks = SprintSpace.markdownToBlocks(markdown);
    
    const editorData = {
        time: Date.now(),
        blocks: blocks,
        version: "2.30.7"
    };
    
    try {
        frm.set_value('content_json', JSON.stringify(editorData));
        $('#sprintspace-status').text('Content saved automatically');
        
        setTimeout(() => {
            $('#sprintspace-status').text('Ready - Type to start editing');
        }, 2000);
    } catch (error) {
        console.error('Error saving content:', error);
        $('#sprintspace-status').text('Error saving content');
    }
};

SprintSpace.convertHTMLToMarkdown = function(html) {
    // Simple HTML to markdown conversion
    return html
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1')
        .replace(/<hr[^>]*>/gi, '---')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1')
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/<div class="kanban-placeholder"[^>]*>.*?<\/div>/gi, 'KANBAN')
        .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
};

// Helper functions for the basic editor
SprintSpace.convertBlocksToMarkdown = function(blocks) {
    if (!blocks || !Array.isArray(blocks)) return '';
    
    return blocks.map(block => {
        switch (block.type) {
            case 'header':
                const level = block.data.level || 1;
                return '#'.repeat(level) + ' ' + (block.data.text || '');
            case 'paragraph':
                return block.data.text || '';
            case 'checklist':
                if (block.data.items && Array.isArray(block.data.items)) {
                    return block.data.items.map(item => 
                        `- [${item.checked ? 'x' : ' '}] ${item.text || ''}`
                    ).join('\n');
                }
                return '';
            case 'delimiter':
                return '---';
            case 'kanban':
                return 'KANBAN';
            case 'table':
                return '| Table | Content | Here |\n|-------|---------|------|';
            default:
                return JSON.stringify(block.data);
        }
    }).join('\n\n');
};

SprintSpace.markdownToBlocks = function(markdown) {
    if (!markdown) return [];
    
    const lines = markdown.split('\n');
    const blocks = [];
    let currentBlock = null;
    
    for (let line of lines) {
        line = line.trim();
        
        if (!line) {
            if (currentBlock) {
                blocks.push(currentBlock);
                currentBlock = null;
            }
            continue;
        }
        
        // Header
        if (line.startsWith('#')) {
            if (currentBlock) blocks.push(currentBlock);
            const level = line.match(/^#+/)[0].length;
            currentBlock = {
                type: 'header',
                data: {
                    text: line.substring(level).trim(),
                    level: Math.min(level, 6)
                }
            };
        }
        // Checklist
        else if (line.match(/^- \[([ x])\]/)) {
            if (!currentBlock || currentBlock.type !== 'checklist') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = {
                    type: 'checklist',
                    data: { items: [] }
                };
            }
            const checked = line.includes('[x]');
            const text = line.replace(/^- \[([ x])\] /, '');
            currentBlock.data.items.push({ text, checked });
        }
        // Delimiter
        else if (line === '---') {
            if (currentBlock) blocks.push(currentBlock);
            blocks.push({ type: 'delimiter', data: {} });
            currentBlock = null;
        }
        // Kanban
        else if (line.toUpperCase() === 'KANBAN') {
            if (currentBlock) blocks.push(currentBlock);
            blocks.push({ type: 'kanban', data: {} });
            currentBlock = null;
        }
        // Regular paragraph
        else {
            if (!currentBlock || currentBlock.type !== 'paragraph') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = {
                    type: 'paragraph',
                    data: { text: line }
                };
            } else {
                currentBlock.data.text += '\n' + line;
            }
        }
    }
    
    if (currentBlock) blocks.push(currentBlock);
    return blocks;
};

// Legacy functions - kept for compatibility
SprintSpace.saveContent = function(frm) {
    // Fallback to new editor save function
    SprintSpace.saveContentFromEditor(frm);
};

// Enhanced Kanban functionality for saved projects
SprintSpace.renderKanban = async function(frm) {
    if (frm.is_new() || !frm.doc.title) return;
    
    try {
        const response = await frappe.call({
            method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.get_tasks_for_project",
            args: { 
                project_name: frm.doc.title, 
                project_field: "project", 
                status_field: "status" 
            }
        });

        return SprintSpace.createKanbanHTML(response.message || {}, frm.doc.title);
    } catch (error) {
        console.error('Error loading kanban:', error);
        return `<div class="kanban-error">Failed to load kanban. Error: ${error.message}</div>`;
    }
};

SprintSpace.createKanbanHTML = function(tasksByStatus, projectName) {
    const statuses = ["Open", "Working", "Pending Review", "Completed", "Cancelled"];
    let html = '<div class="kanban-wrap" data-project="' + projectName + '">';
    
    statuses.forEach(status => {
        const tasks = tasksByStatus[status] || [];
        html += `
            <div class="kanban-col" data-status="${status}">
                <h4>${status} (${tasks.length})</h4>
                <div class="kanban-list">
        `;
        
        if (tasks.length === 0) {
            html += '<div class="empty-state">No tasks</div>';
        } else {
            tasks.forEach(task => {
                html += `
                    <div class="kanban-card" draggable="true" data-name="${task.name}">
                        <div class="title">${frappe.utils.escape_html(task.subject || task.name)}</div>
                        <div class="meta">
                            <span>${task.owner || 'Unassigned'}</span>
                            <span>${task.exp_end_date ? frappe.datetime.str_to_user(task.exp_end_date) : ''}</span>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div></div>';
    });
    
    // Add sample tasks button if no tasks exist
    const totalTasks = Object.values(tasksByStatus).reduce((sum, tasks) => sum + tasks.length, 0);
    if (totalTasks === 0) {
        html += `
            <div style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);">
                <button class="btn btn-sm btn-primary" onclick="SprintSpace.createSampleTasks('${projectName}')">
                    Create Sample Tasks
                </button>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
};

SprintSpace.createSampleTasks = async function(projectName) {
    try {
        await frappe.call({
            method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.create_sample_tasks",
            args: { project_name: projectName }
        });
        
        frappe.show_alert({message: 'Sample tasks created!', indicator: 'green'});
        // Refresh the form to reload kanban
        setTimeout(() => {
            cur_frm.refresh();
        }, 1000);
        
    } catch (error) {
        frappe.show_alert({message: 'Failed to create tasks: ' + error.message, indicator: 'red'});
    }
};

SprintSpace.setupKanbanDragDrop = function() {
    const kanbanWrap = document.querySelector('.kanban-wrap');
    if (!kanbanWrap) return;
    
    // Drag start
    kanbanWrap.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('kanban-card')) {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    // Drag end
    kanbanWrap.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('kanban-card')) {
            e.target.classList.remove('dragging');
        }
        kanbanWrap.querySelectorAll('.kanban-col').forEach(col => {
            col.classList.remove('drag-over');
        });
    });

    // Drag over
    kanbanWrap.addEventListener('dragover', (e) => {
        e.preventDefault();
        const column = e.target.closest('.kanban-col');
        if (column) {
            kanbanWrap.querySelectorAll('.kanban-col').forEach(col => {
                col.classList.remove('drag-over');
            });
            column.classList.add('drag-over');
        }
    });

    // Drop
    kanbanWrap.addEventListener('drop', async (e) => {
        e.preventDefault();
        const column = e.target.closest('.kanban-col');
        const draggingCard = kanbanWrap.querySelector('.kanban-card.dragging');

        if (column && draggingCard) {
            const newStatus = column.dataset.status;
            const taskName = draggingCard.dataset.name;
            const list = column.querySelector('.kanban-list');

            // Remove empty state if exists
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            // Move card visually
            list.appendChild(draggingCard);

            try {
                await frappe.call({
                    method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.update_task_status",
                    args: { task_name: taskName, new_status: newStatus, status_field: "status" }
                });

                frappe.show_alert({message: `Moved ${taskName} → ${newStatus}`, indicator: 'green'});
                SprintSpace.updateKanbanCounts();

            } catch (error) {
                frappe.show_alert({message: 'Failed to update task', indicator: 'red'});
                // Reload kanban on error
                cur_frm.refresh();
            }
        }

        kanbanWrap.querySelectorAll('.kanban-col').forEach(col => {
            col.classList.remove('drag-over');
        });
    });
};

SprintSpace.updateKanbanCounts = function() {
    document.querySelectorAll('.kanban-col').forEach(column => {
        const status = column.dataset.status;
        const taskCount = column.querySelectorAll('.kanban-card').length;
        const header = column.querySelector('h4');
        if (header) {
            header.textContent = `${status} (${taskCount})`;
        }
    });
};

SprintSpace.enhanceKanbanBlocks = async function(frm) {
    // Look for KANBAN text in the editor and replace with interactive kanban
    const editor = document.getElementById('sprintspace-editor');
    if (!editor) return;
    
    const content = editor.innerText || editor.textContent;
    if (content.includes('KANBAN')) {
        const lines = content.split('\n');
        let newContent = '';
        let foundKanban = false;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().toUpperCase() === 'KANBAN') {
                if (!foundKanban) {
                    // Replace first KANBAN with actual kanban board
                    const kanbanHTML = await SprintSpace.renderKanban(frm);
                    
                    // Create a container div for the kanban
                    const kanbanContainer = document.createElement('div');
                    kanbanContainer.innerHTML = kanbanHTML;
                    kanbanContainer.style.margin = '20px 0';
                    
                    // Insert kanban after the editor
                    const editorContainer = editor.parentElement;
                    if (editorContainer && !editorContainer.querySelector('.kanban-wrap')) {
                        editorContainer.appendChild(kanbanContainer);
                        
                        // Setup drag and drop
                        setTimeout(() => {
                            SprintSpace.setupKanbanDragDrop();
                        }, 100);
                    }
                    
                    foundKanban = true;
                }
                newContent += '📋 Kanban Board (Interactive)\n';
            } else {
                newContent += lines[i] + '\n';
            }
        }
        
        if (foundKanban) {
            editor.innerHTML = SprintSpace.convertMarkdownToHTML(newContent.trim());
        }
    }
};

frappe.ui.form.on('Sprintspace Project', {
    refresh: async function(frm) {
        // Initialize SprintSpace editor
        await SprintSpace.initEditor(frm);
        
        // Setup kanban functionality for saved projects
        if (!frm.is_new()) {
            setTimeout(() => {
                SprintSpace.enhanceKanbanBlocks(frm);
            }, 1000);
        }
        
        // Add custom buttons
        frm.add_custom_button(__('View Tasks'), function() {
            frappe.route_options = {
                "project": frm.doc.title
            };
            frappe.set_route("List", "Task");
        }, __("Actions"));

        frm.add_custom_button(__('Create Task'), function() {
            frappe.new_doc("Task", {
                "project": frm.doc.title,
                "sprintspace_project": frm.doc.name
            });
        }, __("Actions"));

        // Add quick status change
        if (!frm.is_new()) {
            frm.add_custom_button(__('Archive'), function() {
                frm.set_value('status', 'Archived');
                frm.save();
            }, __("Actions"));

            if (frm.doc.status === 'Archived') {
                frm.add_custom_button(__('Reactivate'), function() {
                    frm.set_value('status', 'Active');
                    frm.save();
                }, __("Actions"));
            }
        }

        // Show project statistics in sidebar
        if (!frm.is_new()) {
            show_project_stats(frm);
        }
    },

    onload: function(frm) {
        // Start with clean content for new documents
        if (frm.is_new() && !frm.doc.content_json) {
            const cleanContent = {
                time: Date.now(),
                blocks: [],
                version: "2.30.7"
            };
            frm.set_value('content_json', JSON.stringify(cleanContent));
        }
    },

    title: function(frm) {
        // Update the header in content if it exists
        if (frm.doc.content_json) {
            try {
                const content = JSON.parse(frm.doc.content_json);
                if (content.blocks && content.blocks.length > 0 && content.blocks[0].type === 'header') {
                    content.blocks[0].data.text = frm.doc.title;
                    frm.set_value('content_json', JSON.stringify(content));
                }
            } catch (e) {
                // Ignore JSON parsing errors
            }
        }
    },

    status: function(frm) {
        // Refresh form when status changes to update buttons
        if (!frm.is_new()) {
            frm.refresh();
        }
    }
});

function show_project_stats(frm) {
    frappe.call({
        method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.get_tasks_for_project",
        args: {
            project_name: frm.doc.title,
            project_field: "project",
            status_field: "status"
        },
        callback: function(r) {
            if (r.message) {
                const stats = calculate_project_stats(r.message);
                display_project_stats(frm, stats);
            }
        }
    });
}

function calculate_project_stats(tasksByStatus) {
    const stats = {
        total: 0,
        completed: 0,
        in_progress: 0,
        pending: 0,
        statuses: {}
    };

    Object.keys(tasksByStatus).forEach(status => {
        const count = tasksByStatus[status].length;
        stats.statuses[status] = count;
        stats.total += count;

        if (status === 'Completed') {
            stats.completed += count;
        } else if (status === 'Working') {
            stats.in_progress += count;
        } else if (status === 'Cancelled') {
            // Don't count cancelled tasks in pending
        } else {
            stats.pending += count;
        }
    });

    stats.completion_percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return stats;
}

function display_project_stats(frm, stats) {
    // Use the form's sidebar container properly
    const $sidebar = frm.$wrapper.find('.form-sidebar');
    if (!$sidebar.length) return;

    // Remove existing stats section
    $sidebar.find('.sprintspace-stats').remove();

    const statsHtml = `
        <div class="sprintspace-stats" style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h6 style="margin-bottom: 10px; color: #495057;">📊 Project Statistics</h6>
            
            <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 5px;">Progress</div>
                <div style="background: #e9ecef; border-radius: 10px; height: 8px; overflow: hidden;">
                    <div style="background: #28a745; height: 100%; width: ${stats.completion_percentage}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 11px; color: #6c757d; margin-top: 2px;">${stats.completion_percentage}% Complete</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                <div>
                    <span style="color: #6c757d;">Total:</span>
                    <strong>${stats.total}</strong>
                </div>
                <div>
                    <span style="color: #28a745;">Done:</span>
                    <strong>${stats.completed}</strong>
                </div>
                <div>
                    <span style="color: #ffc107;">In Progress:</span>
                    <strong>${stats.in_progress}</strong>
                </div>
                <div>
                    <span style="color: #6c757d;">Pending:</span>
                    <strong>${stats.pending}</strong>
                </div>
            </div>

            ${Object.keys(stats.statuses).length > 0 ? `
                <div style="margin-top: 10px; font-size: 11px;">
                    <div style="color: #6c757d; margin-bottom: 5px;">By Status:</div>
                    ${Object.keys(stats.statuses).map(status => 
                        `<div style="display: flex; justify-content: space-between;">
                            <span>${status}:</span>
                            <span>${stats.statuses[status]}</span>
                        </div>`
                    ).join('')}
                </div>
            ` : ''}
        </div>
    `;

    $sidebar.append(statsHtml);
}
