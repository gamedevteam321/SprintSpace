// SprintSpace Workspace App
class SprintSpaceWorkspaceApp {
    constructor() {
        this.currentWorkspace = null;
        this.currentPage = null;
        this.pages = [];
        this.workspaces = [];
        this.editor = null;
        this.autoSaveTimeout = null;
        this.workspaceEditorState = {
            isShowingCommands: false,
            selectedCommandIndex: 0,
            currentCommands: [],
            slashPosition: null // Store slash location for removal
        };
    }

    async init() {
        console.log('SprintSpace Workspace App Initializing...');
        
        // Check if we have the required DOM elements
        if (!document.getElementById('workspace-list')) {
            console.error('Required DOM elements not found');
            return;
        }
        
        await this.loadCSS("/assets/sprintspace/css/editor.css");
        await this.loadEditorScripts();
        
        this.setupEventListeners();
        await this.loadWorkspaces();
    }

    setupEventListeners() {
        // Add workspace button
        const addWorkspaceBtn = document.getElementById('add-workspace-btn');
        if (addWorkspaceBtn) {
            addWorkspaceBtn.addEventListener('click', () => {
                this.showCreateWorkspaceModal();
            });
        }

        // Add page button
        const addPageBtn = document.getElementById('add-page-btn');
        if (addPageBtn) {
            addPageBtn.addEventListener('click', () => {
                this.showCreatePageModal();
            });
        }

        // Page title editor
        const pageTitleEditor = document.getElementById('page-title-editor');
        if (pageTitleEditor) {
            pageTitleEditor.addEventListener('blur', (e) => {
                this.updatePageTitle(e.target.value);
            });
            
            pageTitleEditor.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });
        }
    }

    // ==================== WORKSPACE MANAGEMENT ====================

    async loadWorkspaces() {
        try {
            const workspaceList = document.getElementById('workspace-list');
            workspaceList.innerHTML = '<li class="empty-state"><div class="loading-spinner"></div> Loading workspaces...</li>';
            
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_workspace.sprintspace_workspace.get_user_workspaces'
            });
            
            this.workspaces = response.message || [];
            this.renderWorkspaceList();
            
            // Auto-select first workspace if available
            if (this.workspaces.length > 0) {
                this.selectWorkspace(this.workspaces[0].name);
            } else {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading workspaces:', error);
            this.showError('Failed to load workspaces');
            const workspaceList = document.getElementById('workspace-list');
            workspaceList.innerHTML = '<li class="empty-state" style="color: red;">Failed to load workspaces</li>';
        }
    }

    renderWorkspaceList() {
        const workspaceList = document.getElementById('workspace-list');
        
        if (this.workspaces.length === 0) {
            workspaceList.innerHTML = `
                <li class="empty-state">
                    <div style="text-align: center;">
                        <p style="margin-bottom: 12px;">No workspaces yet</p>
                        <button onclick="window.sprintSpaceApp.showCreateWorkspaceModal()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 12px; cursor: pointer;">
                            Create First Workspace
                        </button>
                    </div>
                </li>
            `;
            return;
        }

        const workspaceItems = this.workspaces.map(workspace => `
            <li class="workspace-item ${workspace.name === this.currentWorkspace ? 'selected' : ''}" 
                style="display: flex; align-items: center; padding: 8px 12px; margin: 2px 0; border-radius: 6px; cursor: pointer; transition: background-color 0.15s; font-size: 14px; color: #374151; ${workspace.name === this.currentWorkspace ? 'background: rgba(79, 70, 229, 0.12); color: #4f46e5; font-weight: 500;' : ''}"
                onclick="window.sprintSpaceApp.selectWorkspace('${workspace.name}')">
                <span class="workspace-item-icon" style="margin-right: 8px; font-size: 16px;">📁</span>
                <span class="workspace-item-title">${workspace.title}</span>
                <div class="item-actions" style="margin-left: auto; opacity: 0; transition: opacity 0.15s;">
                    <button class="item-action-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.deleteWorkspace('${workspace.name}')" title="Delete" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; margin-left: 4px; border-radius: 4px; font-size: 12px;">
                        🗑️
                    </button>
                </div>
            </li>
        `).join('');
        
        workspaceList.innerHTML = workspaceItems;
        
        // Add hover effect for workspace actions
        const workspaceItemElements = workspaceList.querySelectorAll('.workspace-item');
        workspaceItemElements.forEach(item => {
            item.addEventListener('mouseenter', () => {
                const actions = item.querySelector('.item-actions');
                if (actions) actions.style.opacity = '1';
            });
            item.addEventListener('mouseleave', () => {
                const actions = item.querySelector('.item-actions');
                if (actions) actions.style.opacity = '0';
            });
        });
    }

    async selectWorkspace(workspaceName) {
        if (this.currentWorkspace === workspaceName) return;
        
        try {
            this.currentWorkspace = workspaceName;
            const workspace = this.workspaces.find(w => w.name === workspaceName);
            
            if (workspace) {
                // Show add page button
                const addPageBtn = document.getElementById('add-page-btn');
                if (addPageBtn) addPageBtn.style.display = 'block';
                
                await this.loadPages();
                this.renderWorkspaceList(); // Re-render to update active state
            }
        } catch (error) {
            console.error('Error selecting workspace:', error);
            this.showError('Failed to load workspace');
        }
    }

    async createWorkspace(title, description = '') {
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_workspace.sprintspace_workspace.create_workspace',
                args: { title, description }
            });
            
            await this.loadWorkspaces();
            this.selectWorkspace(response.message);
            this.hideModal();
            
            this.showSuccess('Workspace created successfully!');
        } catch (error) {
            console.error('Error creating workspace:', error);
            this.showError('Failed to create workspace');
        }
    }

    async deleteWorkspace(workspaceName) {
        console.log('deleteWorkspace called with:', workspaceName);
        if (!confirm('Are you sure you want to delete this workspace and all its pages?')) {
            console.log('User cancelled deletion');
            return;
        }
        
        try {
            console.log('Attempting to delete workspace:', workspaceName);
            const response = await frappe.call({
                method: 'frappe.client.delete',
                args: {
                    doctype: 'SprintSpace Workspace',
                    name: workspaceName
                }
            });
            console.log('Delete response:', response);
            
            if (this.currentWorkspace === workspaceName) {
                this.currentWorkspace = null;
                this.currentPage = null;
                this.showEmptyState();
            }
            
            await this.loadWorkspaces();
            
            this.showSuccess('Workspace deleted!');
        } catch (error) {
            console.error('Error deleting workspace:', error);
            this.showError('Failed to delete workspace: ' + error.message);
        }
    }

    // ==================== PAGE MANAGEMENT ====================

    async loadPages() {
        if (!this.currentWorkspace) return;
        
        try {
            console.log('Loading pages for workspace:', this.currentWorkspace);
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_workspace_pages',
                args: { workspace: this.currentWorkspace }
            });
            
            this.pages = response.message || [];
            console.log('Loaded pages:', this.pages);
            this.renderPageList();
            
            // Auto-select first page if available and no page is currently selected
            if (this.pages.length > 0 && !this.currentPage) {
                console.log('Auto-selecting first page:', this.pages[0].name);
                this.selectPage(this.pages[0].name);
            } else if (this.pages.length === 0) {
                console.log('No pages found, showing empty state');
                this.showNoPages();
            }
        } catch (error) {
            console.error('Error loading pages:', error);
            this.showError('Failed to load pages');
        }
    }

    renderPageList() {
        const pageList = document.getElementById('page-list');
        
        if (this.pages.length === 0) {
            pageList.innerHTML = `
                <li class="empty-state">
                    <div style="text-align: center;">
                        <p style="margin-bottom: 12px;">No pages yet</p>
                        <button onclick="window.sprintSpaceApp.showCreatePageModal()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 12px; cursor: pointer;">
                            Create First Page
                        </button>
                    </div>
                </li>
            `;
            return;
        }

        const pageItems = this.pages.map(page => `
            <li class="page-item ${page.name === this.currentPage ? 'selected' : ''}" 
                style="display: flex; align-items: center; padding: 8px 12px; margin: 2px 0; border-radius: 6px; cursor: pointer; transition: background-color 0.15s; font-size: 14px; color: #374151; ${page.name === this.currentPage ? 'background: rgba(79, 70, 229, 0.12); color: #4f46e5; font-weight: 500;' : ''}"
                onclick="window.sprintSpaceApp.selectPage('${page.name}')">
                <span class="page-item-icon" style="margin-right: 8px; font-size: 16px;">📄</span>
                <span class="page-item-title">${page.title}</span>
                <div class="item-actions" style="margin-left: auto; opacity: 0; transition: opacity 0.15s;">
                    <button class="item-action-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.renamePage('${page.name}')" title="Rename" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; margin-left: 4px; border-radius: 4px; font-size: 12px;">
                        ✏️
                    </button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.deletePage('${page.name}')" title="Delete" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; margin-left: 4px; border-radius: 4px; font-size: 12px;">
                        🗑️
                    </button>
                </div>
            </li>
        `).join('');
        
        pageList.innerHTML = pageItems;
        
        // Add hover effect for page actions
        const pageItemElements = pageList.querySelectorAll('.page-item');
        pageItemElements.forEach(item => {
            item.addEventListener('mouseenter', () => {
                const actions = item.querySelector('.item-actions');
                if (actions) actions.style.opacity = '1';
            });
            item.addEventListener('mouseleave', () => {
                const actions = item.querySelector('.item-actions');
                if (actions) actions.style.opacity = '0';
            });
        });
    }

    async selectPage(pageName) {
        if (this.currentPage === pageName) return;
        
        try {
            // Save current page before switching
            if (this.currentPage && this.editor) {
                await this.savePage();
            }
            
            this.currentPage = pageName;
            
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_page_content',
                args: { page_name: pageName }
            });
            
            const pageData = response.message;
            this.renderPageContent(pageData);
            this.renderPageList(); // Re-render to update active state
        } catch (error) {
            console.error('Error loading page:', error);
            this.showError('Failed to load page');
        }
    }

    async createPage(title) {
        if (!this.currentWorkspace) {
            this.showError('Please select a workspace first');
            return;
        }
        
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.create_page',
                args: { 
                    workspace: this.currentWorkspace, 
                    title: title 
                }
            });
            
            await this.loadPages();
            this.selectPage(response.message);
            this.hideModal();
            
            this.showSuccess('Page created successfully!');
        } catch (error) {
            console.error('Error creating page:', error);
            this.showError('Failed to create page');
        }
    }

    async savePage() {
        if (!this.currentPage || !this.editor) return;
        
        try {
            const content = this.getEditorContent();
            
            await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.update_page_content',
                args: { 
                    page_name: this.currentPage, 
                    content_json: JSON.stringify(content)
                }
            });
            
        } catch (error) {
            console.error('Error saving page:', error);
            this.showError('Failed to save page');
        }
    }

    async deletePage(pageName) {
        if (!confirm('Are you sure you want to delete this page?')) return;
        
        try {
            await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.delete_page',
                args: { page_name: pageName }
            });
            
            if (this.currentPage === pageName) {
                this.currentPage = null;
                this.showNoPages();
            }
            
            await this.loadPages();
            
            this.showSuccess('Page deleted!');
        } catch (error) {
            console.error('Error deleting page:', error);
            this.showError('Failed to delete page');
        }
    }

    async renamePage(pageName) {
        const currentPage = this.pages.find(p => p.name === pageName);
        if (!currentPage) return;
        
        const newTitle = prompt('Enter new page title:', currentPage.title);
        if (!newTitle || newTitle === currentPage.title) return;
        
        try {
            await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.update_page_title',
                args: { 
                    page_name: pageName, 
                    title: newTitle.trim()
                }
            });
            
            await this.loadPages();
            
            this.showSuccess('Page renamed!');
        } catch (error) {
            console.error('Error renaming page:', error);
            this.showError('Failed to rename page');
        }
    }

    async updatePageTitle(newTitle) {
        if (!this.currentPage || !newTitle.trim()) return;
        
        try {
            await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.update_page_title',
                args: { 
                    page_name: this.currentPage, 
                    title: newTitle.trim()
                }
            });
            
            await this.loadPages(); // Refresh page list
        } catch (error) {
            console.error('Error updating page title:', error);
            this.showError('Failed to update page title');
        }
    }

    // ==================== EDITOR INTEGRATION ====================

    async loadEditorScripts() {
        // Initialize basic SprintSpace functions for web context
        console.log('Editor scripts loaded');
        this.initBasicSprintSpaceFunctions();
    }

    initBasicSprintSpaceFunctions() {
        // Initialize basic SprintSpace functions for workspace
        window.SprintSpace = window.SprintSpace || {};
        
        if (!SprintSpace.setupNotionEditor) {
            SprintSpace.setupNotionEditor = (mockFrm, editor, commandMenu) => {
                this.setupWorkspaceEditor(editor, commandMenu);
            };
        }
        
        SprintSpace.convertMarkdownToHTML = SprintSpace.convertMarkdownToHTML || ((md) => md);
        SprintSpace.convertHTMLToMarkdown = SprintSpace.convertHTMLToMarkdown || ((html) => html);
    }

    renderPageContent(pageData) {
        const pageTitleEditor = document.getElementById('page-title-editor');
        const editorElement = document.getElementById('sprintspace-editor');
        
        if (pageTitleEditor) {
            pageTitleEditor.value = pageData.title;
            pageTitleEditor.disabled = false;
        }
        
        if (editorElement) {
            // Load content
            let initialContent = '';
            if (pageData.content_json) {
                try {
                    const contentData = JSON.parse(pageData.content_json);
                    if (contentData.blocks) {
                        initialContent = this.convertBlocksToHTML(contentData.blocks);
                    }
                } catch (error) {
                    console.error('Error parsing content JSON:', error);
                }
            }
            
            if (!initialContent) {
                initialContent = '<p>Type \'/\' for commands or start writing...</p>';
            }
            
            editorElement.innerHTML = initialContent;
            editorElement.contentEditable = true;
            
            // Initialize the editor functionality
            this.setupPageEditor();
        }
    }

    setupPageEditor() {
        const editor = document.getElementById('sprintspace-editor');
        const commandMenu = document.getElementById('sprintspace-command-menu');
        
        console.log('Setting up page editor:', {
            editor: !!editor,
            commandMenu: !!commandMenu,
            currentPage: this.currentPage
        });
        
        if (!editor || !commandMenu) {
            console.error('Editor or command menu not found');
            return;
        }
        
        // Initialize SprintSpace editor if available
        if (window.SprintSpace && SprintSpace.setupNotionEditor) {
            console.log('Using SprintSpace.setupNotionEditor');
            const mockFrm = {
                doc: { name: this.currentPage },
                save: () => this.savePage()
            };
            
            SprintSpace.setupNotionEditor(mockFrm, editor, commandMenu);
            this.editor = editor;
        } else {
            console.log('Using setupWorkspaceEditor fallback');
            this.setupWorkspaceEditor(editor, commandMenu);
        }
        
        // Set up auto-save
        this.setupAutoSave();
        console.log('Page editor setup complete');
    }

    setupWorkspaceEditor(editor, commandMenu) {
        if (!editor || !commandMenu) return;
        
        console.log('Setting up workspace editor, removing any existing event listeners');
        
        // Remove any existing mutation observers or event listeners that might interfere
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
        
        const commands = [
            {
                title: 'Text',
                subtitle: 'Just start writing with plain text.',
                icon: 'T',
                keywords: ['text', 'paragraph', 'p'],
                action: () => this.insertBlock(editor, 'paragraph', '')
            },
            {
                title: 'Heading 1',
                subtitle: 'Big section heading.',
                icon: 'H1',
                keywords: ['heading', 'header', 'h1', 'title'],
                action: () => this.insertBlock(editor, 'heading', '', 1)
            },
            {
                title: 'Heading 2',
                subtitle: 'Medium section heading.',
                icon: 'H2',
                keywords: ['heading', 'header', 'h2', 'subtitle'],
                action: () => this.insertBlock(editor, 'heading', '', 2)
            },
            {
                title: 'Heading 3',
                subtitle: 'Small section heading.',
                icon: 'H3',
                keywords: ['heading', 'header', 'h3'],
                action: () => this.insertBlock(editor, 'heading', '', 3)
            },
            {
                title: 'Bulleted list',
                subtitle: 'Create a simple bulleted list.',
                icon: '•',
                keywords: ['list', 'bullet', 'ul'],
                action: () => this.insertBlock(editor, 'list', '')
            },
            {
                title: 'Numbered list',
                subtitle: 'Create a list with numbering.',
                icon: '1.',
                keywords: ['list', 'number', 'ol', 'numbered'],
                action: () => this.insertBlock(editor, 'numbered', '')
            },
            {
                title: 'Checklist',
                subtitle: 'Track tasks with a to-do list.',
                icon: '☑',
                keywords: ['todo', 'task', 'checklist', 'check'],
                action: () => this.insertBlock(editor, 'checklist', '')
            },
            {
                title: 'Divider',
                subtitle: 'Visually divide blocks.',
                icon: '―',
                keywords: ['divider', 'separator', 'hr', 'line'],
                action: () => this.insertBlock(editor, 'divider', '')
            }
        ];

        this.setupSlashCommands(editor, commandMenu, commands);
        this.editor = editor;
    }

    setupSlashCommands(editor, commandMenu, commands) {
        editor.addEventListener('input', (e) => {
            setTimeout(() => {
                this.checkForSlashCommand(editor, commandMenu, commands);
            }, 10);
        });

        editor.addEventListener('keydown', (e) => {
            if (this.workspaceEditorState.isShowingCommands) {
                if (e.key === 'Escape') {
                    this.hideCommandMenu(commandMenu);
                    this.workspaceEditorState.isShowingCommands = false;
                    e.preventDefault();
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    this.navigateCommandMenu(e.key === 'ArrowDown' ? 1 : -1);
                    e.preventDefault();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.workspaceEditorState.currentCommands[this.workspaceEditorState.selectedCommandIndex]) {
                        this.workspaceEditorState.currentCommands[this.workspaceEditorState.selectedCommandIndex].action();
                        this.hideCommandMenu(commandMenu);
                        this.workspaceEditorState.isShowingCommands = false;
                    }
                } else if (e.key === 'Backspace') {
                    setTimeout(() => {
                        this.checkForSlashCommand(editor, commandMenu, commands);
                    }, 10);
                }
            }
        });

        commandMenu.addEventListener('click', (e) => {
            const commandItem = e.target.closest('.command-item');
            if (commandItem) {
                const index = parseInt(commandItem.dataset.index);
                if (this.workspaceEditorState.currentCommands[index]) {
                    this.workspaceEditorState.currentCommands[index].action();
                    this.hideCommandMenu(commandMenu);
                    this.workspaceEditorState.isShowingCommands = false;
                }
            }
        });

        editor.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.workspaceEditorState.isShowingCommands && !commandMenu.contains(document.activeElement)) {
                    this.hideCommandMenu(commandMenu);
                    this.workspaceEditorState.isShowingCommands = false;
                }
            }, 200);
        });

        document.addEventListener('click', (e) => {
            if (this.workspaceEditorState.isShowingCommands &&
                !editor.contains(e.target) &&
                !commandMenu.contains(e.target)) {
                this.hideCommandMenu(commandMenu);
                this.workspaceEditorState.isShowingCommands = false;
            }
        });
    }

    checkForSlashCommand(editor, commandMenu, commands) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const textNode = range.startContainer;
        const offset = range.startOffset;

        if (textNode.nodeType !== Node.TEXT_NODE) {
            // If we're not in a text node, hide the menu
            if (this.workspaceEditorState.isShowingCommands) {
                this.hideCommandMenu(commandMenu);
                this.workspaceEditorState.isShowingCommands = false;
            }
            return;
        }

        const textContent = textNode.textContent;
        const beforeCursor = textContent.substring(0, offset);
        const slashIndex = beforeCursor.lastIndexOf('/');

        console.log('Checking for slash command:', {
            beforeCursor,
            slashIndex,
            offset,
            textContent
        });

        if (slashIndex !== -1) {
            const charBeforeSlash = slashIndex > 0 ? beforeCursor[slashIndex - 1] : ' ';
            if (charBeforeSlash === ' ' || charBeforeSlash === '\n' || slashIndex === 0) {
                const query = beforeCursor.substring(slashIndex + 1);
                console.log('Found valid slash command with query:', query);
                
                // Store slash position for later removal
                this.workspaceEditorState.slashPosition = {
                    textNode: textNode,
                    slashIndex: slashIndex,
                    endIndex: offset
                };
                
                this.showCommandMenu(commandMenu, commands, query);
                this.workspaceEditorState.isShowingCommands = true;
                return;
            }
        }

        // Hide menu if no valid slash command found
        if (this.workspaceEditorState.isShowingCommands) {
            console.log('No valid slash command, hiding menu');
            this.hideCommandMenu(commandMenu);
            this.workspaceEditorState.isShowingCommands = false;
            this.workspaceEditorState.slashPosition = null; // Clear stored position
        }
    }

    showCommandMenu(menuElement, commands, query) {
        const filteredCommands = commands.filter(cmd => 
            cmd.title.toLowerCase().includes(query.toLowerCase()) ||
            cmd.keywords.some(k => k.includes(query.toLowerCase()))
        );

        if (filteredCommands.length === 0) {
            this.hideCommandMenu(menuElement);
            return;
        }

        const sectionsHtml = filteredCommands.map((cmd, index) => `
            <div class="command-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                <div class="command-icon">${cmd.icon}</div>
                <div class="command-content">
                    <div class="command-text">
                        <div class="command-title">${cmd.title}</div>
                        <div class="command-subtitle">${cmd.subtitle}</div>
                    </div>
                </div>
            </div>
        `).join('');

        menuElement.innerHTML = sectionsHtml + '<div class="command-menu-footer">Type / on the page · esc</div>';
        menuElement.style.display = 'block';

        // Position menu
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            menuElement.style.position = 'fixed';
            menuElement.style.top = (rect.bottom + 5) + 'px';
            menuElement.style.left = rect.left + 'px';
        }

        this.workspaceEditorState.currentCommands = filteredCommands;
        this.workspaceEditorState.selectedCommandIndex = 0;
    }

    hideCommandMenu(menuElement) {
        menuElement.style.display = 'none';
        menuElement.innerHTML = '';
    }

    navigateCommandMenu(direction) {
        const items = document.querySelectorAll('.command-item');
        if (items.length === 0) return;

        items[this.workspaceEditorState.selectedCommandIndex].classList.remove('selected');
        this.workspaceEditorState.selectedCommandIndex = Math.max(0, Math.min(items.length - 1, 
            this.workspaceEditorState.selectedCommandIndex + direction));
        items[this.workspaceEditorState.selectedCommandIndex].classList.add('selected');
    }

    insertBlock(editor, type, content, level = 1) {
        console.log('insertBlock called:', {type, content, level});
        console.log('Editor element:', editor);
        
        // Ensure we're working with the right editor
        if (!editor || editor.id !== 'sprintspace-editor') {
            console.error('Invalid editor element');
            return;
        }
        
        const selection = window.getSelection();
        if (selection.rangeCount === 0) {
            console.log('No selection found, focusing editor and trying again');
            editor.focus();
            // Try to create a selection at the end of the editor content
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        const range = selection.getRangeAt(0);
        console.log('Current range:', range);
        console.log('Range container:', range.startContainer);
        
        // Ensure the range is within the editor
        if (!editor.contains(range.startContainer)) {
            console.log('Range not in editor, repositioning');
            const newRange = document.createRange();
            newRange.selectNodeContents(editor);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
        
        // Remove the slash command using stored position information
        let slashRemoved = false;
        
        if (this.workspaceEditorState.slashPosition) {
            const slashPos = this.workspaceEditorState.slashPosition;
            const textNode = slashPos.textNode;
            
            console.log('Using stored slash position:', slashPos);
            
            try {
                if (textNode && textNode.parentNode) {
                    const textContent = textNode.textContent;
                    const beforeSlash = textContent.substring(0, slashPos.slashIndex);
                    const afterQuery = textContent.substring(slashPos.endIndex);
                    const newText = beforeSlash + afterQuery;
                    
                    console.log('Removing slash using stored position:', {
                        originalText: textContent,
                        beforeSlash,
                        afterQuery,
                        newText,
                        slashIndex: slashPos.slashIndex,
                        endIndex: slashPos.endIndex
                    });
                    
                    textNode.textContent = newText;
                    
                    // Position cursor where the slash was
                    const newRange = document.createRange();
                    newRange.setStart(textNode, slashPos.slashIndex);
                    newRange.setEnd(textNode, slashPos.slashIndex);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Update our range reference
                    range = newRange;
                    
                    slashRemoved = true;
                    console.log('Successfully removed slash command using stored position');
                }
            } catch (error) {
                console.error('Error removing slash using stored position:', error);
            }
            
            // Clear the stored position
            this.workspaceEditorState.slashPosition = null;
        }
        
        if (!slashRemoved) {
            console.log('Could not remove slash - no stored position or position invalid');
        }

        let html = '';
        switch (type) {
            case 'paragraph':
                html = '<p>Type your content here...</p>';
                break;
            case 'heading':
                html = `<h${level}>Your heading here</h${level}>`;
                break;
            case 'list':
                html = '<ul><li>List item</li></ul>';
                break;
            case 'numbered':
                html = '<ol><li>Numbered item</li></ol>';
                break;
            case 'checklist':
                html = '<div class="checklist"><div class="checklist-item"><input type="checkbox"> <span>Task item</span></div></div>';
                break;
            case 'divider':
                html = '<hr><p><br></p>';
                break;
        }

        console.log('Generated HTML:', html);

        if (html) {
            try {
                console.log('Editor content before insertion:', editor.innerHTML);
                
                // Check if editor is empty or has placeholder text
                const editorContent = editor.innerHTML.trim();
                if (editorContent === '' || 
                    editorContent === '<p>Type \'/\' for commands or start writing...</p>' ||
                    editorContent === '<p><br></p>' ||
                    editorContent === '<p></p>') {
                    // Replace empty content
                    editor.innerHTML = html;
                    console.log('Replaced empty editor content with:', html);
                } else {
                    // Insert at the current cursor position (after slash removal)
                    const updatedRange = selection.getRangeAt(0);
                    const fragment = updatedRange.createContextualFragment(html);
                    updatedRange.insertNode(fragment);
                    console.log('Inserted fragment at cursor position');
                    
                    // Move cursor to after the inserted content safely
                    try {
                        const insertedNode = fragment.lastChild || fragment.firstChild;
                        if (insertedNode && insertedNode.nodeType === Node.ELEMENT_NODE) {
                            updatedRange.setStartAfter(insertedNode);
                            updatedRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(updatedRange);
                            console.log('Positioned cursor after inserted element');
                        } else {
                            console.log('Could not position cursor, using fallback');
                            // Fallback: position at end of editor
                            const fallbackRange = document.createRange();
                            fallbackRange.selectNodeContents(editor);
                            fallbackRange.collapse(false);
                            selection.removeAllRanges();
                            selection.addRange(fallbackRange);
                        }
                    } catch (error) {
                        console.error('Error positioning cursor:', error);
                        // Fallback: position at end of editor
                        const fallbackRange = document.createRange();
                        fallbackRange.selectNodeContents(editor);
                        fallbackRange.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(fallbackRange);
                    }
                }
                
                // Give it a moment to settle
                setTimeout(() => {
                    console.log('Editor content 100ms after insertion:', editor.innerHTML);
                }, 100);
                
                // Position cursor inside the new element and select the placeholder text
                setTimeout(() => {
                    console.log('Editor content after insertion:', editor.innerHTML);
                    
                    let selector;
                    switch (type) {
                        case 'heading':
                            selector = `h${level}:last-of-type`;
                            break;
                        case 'list':
                        case 'numbered':
                            selector = 'li:last-of-type';
                            break;
                        case 'checklist':
                            selector = '.checklist-item:last-of-type span';
                            break;
                        default:
                            selector = 'p:last-of-type';
                    }
                    
                    console.log('Looking for element with selector:', selector);
                    let newElement = editor.querySelector(selector);
                    
                    // Fallback: try without :last-of-type
                    if (!newElement) {
                        const fallbackSelector = selector.replace(':last-of-type', '');
                        console.log('Trying fallback selector:', fallbackSelector);
                        const elements = editor.querySelectorAll(fallbackSelector);
                        newElement = elements[elements.length - 1]; // Get the last one
                    }
                    
                    console.log('Found new element:', newElement, 'with final selector used');
                    
                    if (newElement) {
                        const newRange = document.createRange();
                        
                        // Select all text content in the element for immediate editing
                        if (newElement.firstChild && newElement.firstChild.nodeType === Node.TEXT_NODE) {
                            newRange.setStart(newElement.firstChild, 0);
                            newRange.setEnd(newElement.firstChild, newElement.firstChild.textContent.length);
                            console.log('Selected text node content:', newElement.firstChild.textContent);
                        } else {
                            newRange.selectNodeContents(newElement);
                            console.log('Selected entire element contents');
                        }
                        
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        
                        // Ensure the editor is focused
                        editor.focus();
                        console.log('Positioned cursor and selected text in new element');
                    } else {
                        console.log('New element still not found, positioning cursor after insertion');
                        // Fallback: position cursor after the last inserted content
                        const range = document.createRange();
                        range.selectNodeContents(editor);
                        range.collapse(false); // Move to end
                        selection.removeAllRanges();
                        selection.addRange(range);
                        editor.focus();
                        
                        // Add a new paragraph after the inserted element for continued typing
                        const br = document.createElement('p');
                        br.innerHTML = '<br>';
                        editor.appendChild(br);
                        
                        // Position cursor in the new paragraph
                        const newRange = document.createRange();
                        newRange.selectNodeContents(br);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                    }
                }, 50);
                
                // Focus the editor
                editor.focus();
                
            } catch (error) {
                console.error('Error inserting block:', error);
                // Fallback: just replace the content
                editor.innerHTML = html;
                editor.focus();
            }
        }
    }

    convertBlocksToHTML(blocks) {
        if (!blocks || !Array.isArray(blocks)) return '';
        
        return blocks.map(block => {
            switch (block.type) {
                case 'header':
                    const level = block.data.level || 1;
                    return `<h${level}>${block.data.text}</h${level}>`;
                case 'paragraph':
                    return `<p>${block.data.text}</p>`;
                case 'list':
                    const listType = block.data.style === 'ordered' ? 'ol' : 'ul';
                    const items = block.data.items.map(item => `<li>${item}</li>`).join('');
                    return `<${listType}>${items}</${listType}>`;
                default:
                    return `<p>${block.data.text || ''}</p>`;
            }
        }).join('');
    }

    setupAutoSave() {
        if (!this.editor) return;
        
        console.log('Setting up auto-save with input listener');
        
        this.editor.addEventListener('input', (e) => {
            console.log('Input event triggered, content length:', this.editor.innerHTML.length);
            
            clearTimeout(this.autoSaveTimeout);
            
            // Re-enable auto-save with longer delay
            this.autoSaveTimeout = setTimeout(() => {
                console.log('Auto-saving page...');
                this.savePage();
            }, 3000); // Auto-save after 3 seconds of inactivity
        });
    }

    getEditorContent() {
        if (!this.editor) return { blocks: [] };
        
        const html = this.editor.innerHTML;
        
        return {
            time: Date.now(),
            blocks: [
                {
                    type: 'paragraph',
                    data: {
                        text: html || ''
                    }
                }
            ],
            version: '2.30.7'
        };
    }

    // ==================== UI STATES ====================

    showEmptyState() {
        const editorArea = document.getElementById('editor-area');
        editorArea.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: #6b7280;">
                <h3 style="font-size: 18px; margin-bottom: 8px; color: #374151;">Welcome to SprintSpace</h3>
                <p style="font-size: 14px; text-align: center; max-width: 400px;">Create a workspace to get started with your Notion-like pages and kanban boards.</p>
                <button onclick="window.sprintSpaceApp.showCreateWorkspaceModal()" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 16px; transition: background-color 0.15s;">
                    Create Your First Workspace
                </button>
            </div>
        `;
    }

    showNoPages() {
        const editorArea = document.getElementById('editor-area');
        const pageTitleEditor = document.getElementById('page-title-editor');
        
        // Disable page title editor
        if (pageTitleEditor) {
            pageTitleEditor.value = '';
            pageTitleEditor.disabled = true;
            pageTitleEditor.placeholder = 'No page selected';
        }
        
        editorArea.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: #6b7280;">
                <h3 style="font-size: 18px; margin-bottom: 8px; color: #374151;">No Pages Yet</h3>
                <p style="font-size: 14px; text-align: center; max-width: 400px;">Create your first page to start building your workspace content.</p>
                <button onclick="window.sprintSpaceApp.showCreatePageModal()" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 16px; transition: background-color 0.15s;">
                    Create Your First Page
                </button>
            </div>
        `;
    }

    showError(message) {
        console.error(message);
        this.showToast(message, '#ef4444');
    }

    showSuccess(message) {
        console.log(message);
        this.showToast(message, '#10b981');
    }

    showToast(message, backgroundColor) {
        // Create a simple toast notification for web context
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Add CSS animation
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }
        }, 4000);
    }

    // ==================== MODALS ====================

    showCreateWorkspaceModal() {
        console.log('showCreateWorkspaceModal called');
        this.showModal({
            title: 'Create New Workspace',
            fields: [
                { label: 'Workspace Title', name: 'title', type: 'text', required: true },
                { label: 'Description', name: 'description', type: 'text' }
            ],
            onSubmit: (data) => {
                console.log('Modal submitted with data:', data);
                this.createWorkspace(data.title, data.description);
            }
        });
    }

    showCreatePageModal() {
        this.showModal({
            title: 'Create New Page',
            fields: [
                { label: 'Page Title', name: 'title', type: 'text', required: true }
            ],
            onSubmit: (data) => {
                this.createPage(data.title);
            }
        });
    }

    showModal(config) {
        console.log('showModal called with config:', config);
        
        const modalOverlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        
        console.log('Modal elements found:', {
            overlay: !!modalOverlay,
            modal: !!modal,
            title: !!modalTitle,
            content: !!modalContent
        });
        
        if (!modalOverlay || !modal || !modalTitle || !modalContent) {
            console.error('Modal elements not found');
            return;
        }
        
        modalTitle.textContent = config.title;
        
        const fieldsHTML = config.fields.map(field => `
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                ${field.label}${field.required ? ' *' : ''}
            </label>
            <input type="${field.type}" 
                   name="${field.name}" 
                   placeholder="${field.label}"
                   style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 16px; outline: none; box-sizing: border-box;"
                   ${field.required ? 'required' : ''}>
        `).join('');
        
        modalContent.innerHTML = `
            <form id="modal-form">
                ${fieldsHTML}
                <div class="modal-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">
                        Cancel
                    </button>
                    <button type="submit" class="btn btn-primary">
                        Create
                    </button>
                </div>
            </form>
        `;
        
        // Show modal with animation
        console.log('Adding show class to modal overlay');
        modalOverlay.classList.add('show');
        console.log('Modal overlay classes:', modalOverlay.className);
        console.log('Modal overlay display:', window.getComputedStyle(modalOverlay).display);
        
        // Force modal visibility as backup
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.right = '0';
        modalOverlay.style.bottom = '0';
        modalOverlay.style.zIndex = '10000';
        modalOverlay.style.background = 'rgba(0,0,0,0.5)';
        
        // Force modal content visibility
        modal.style.display = 'block';
        modal.style.background = 'white';
        modal.style.minWidth = '400px';
        modal.style.minHeight = '300px';
        modal.style.zIndex = '10001';
        modal.style.padding = '24px';
        modal.style.borderRadius = '12px';
        modal.style.position = 'relative';
        
        // Debug modal content visibility
        console.log('After forcing styles - Modal element styles:', {
            background: window.getComputedStyle(modal).background,
            display: window.getComputedStyle(modal).display,
            position: window.getComputedStyle(modal).position,
            zIndex: window.getComputedStyle(modal).zIndex,
            width: window.getComputedStyle(modal).width,
            height: window.getComputedStyle(modal).height,
            opacity: window.getComputedStyle(modal).opacity,
            visibility: window.getComputedStyle(modal).visibility
        });
        
        // Also log the overlay
        console.log('Modal overlay styles:', {
            display: window.getComputedStyle(modalOverlay).display,
            position: window.getComputedStyle(modalOverlay).position,
            zIndex: window.getComputedStyle(modalOverlay).zIndex,
            top: window.getComputedStyle(modalOverlay).top,
            left: window.getComputedStyle(modalOverlay).left
        });
        
        // Focus first input
        setTimeout(() => {
            const firstInput = modalContent.querySelector('input');
            if (firstInput) {
                console.log('Focusing first input');
                firstInput.focus();
            } else {
                console.log('No input found to focus');
            }
        }, 100);
        
        // Handle form submission
        const form = document.getElementById('modal-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                config.onSubmit(data);
            });
        }
        
        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                this.hideModal();
            }
        });
    }

    hideModal() {
        console.log('hideModal called');
        const modalOverlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        
        if (modalOverlay) {
            modalOverlay.classList.remove('show');
            // Clear all inline styles that were set for debugging
            modalOverlay.style.display = '';
            modalOverlay.style.alignItems = '';
            modalOverlay.style.justifyContent = '';
            modalOverlay.style.position = '';
            modalOverlay.style.top = '';
            modalOverlay.style.left = '';
            modalOverlay.style.right = '';
            modalOverlay.style.bottom = '';
            modalOverlay.style.zIndex = '';
            modalOverlay.style.background = '';
        }
        
        if (modal) {
            // Clear all inline styles that were set for debugging
            modal.style.display = '';
            modal.style.background = '';
            modal.style.border = '';
            modal.style.minWidth = '';
            modal.style.minHeight = '';
            modal.style.zIndex = '';
            modal.style.padding = '';
            modal.style.borderRadius = '';
            modal.style.position = '';
        }
        
        console.log('Modal hidden and styles cleared');
    }

    // ==================== UTILITY FUNCTIONS ====================

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src + '?v=' + Date.now(); // Cache busting
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    loadCSS(href) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href*="${href.split('?')[0]}"]`)) {
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
    }
}

// Export for global access
window.SprintSpaceWorkspaceApp = SprintSpaceWorkspaceApp;