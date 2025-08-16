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
        this.initializeChecklistFeatures(); // Initialize checklist functionality globally
        this.initializeBlockMenuManagement(); // Initialize block menu visibility management
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
        
        try {
            // First get page count for better warning
            const pagesResponse = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_workspace_pages',
                args: { workspace: workspaceName }
            });
            
            const pageCount = pagesResponse.message ? pagesResponse.message.length : 0;
            const warningMessage = pageCount > 0 
                ? `Are you sure you want to delete this workspace and ${pageCount} page(s) inside it? This action cannot be undone.`
                : 'Are you sure you want to delete this workspace? This action cannot be undone.';
            
            if (!confirm(warningMessage)) {
                console.log('User cancelled deletion');
                return;
            }
            
            console.log('Attempting to delete workspace:', workspaceName);
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_workspace.sprintspace_workspace.delete_workspace',
                args: { workspace_name: workspaceName }
            });
            console.log('Delete response:', response);
            
            // Clear current workspace and page if they were deleted
            if (this.currentWorkspace === workspaceName) {
                this.currentWorkspace = null;
                this.currentPage = null;
                this.pages = []; // Clear pages array
                
                // Clear the page list UI
                const pageList = document.getElementById('page-list');
                if (pageList) pageList.innerHTML = '';
                
                // Hide add page button
                const addPageBtn = document.getElementById('add-page-btn');
                if (addPageBtn) addPageBtn.style.display = 'none';
                
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
                // Ensure we show the editor interface before selecting page
                this.showEditorInterface();
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
            console.log('Creating page with title:', title);
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.create_page',
                args: { 
                    workspace: this.currentWorkspace, 
                    title: title 
                }
            });
            
            console.log('Page created:', response.message);
            
            // Hide modal first
            this.hideModal();
            
            // Reload pages and select the new one
            await this.loadPages();
            
            // Give a small delay to ensure UI is updated
            setTimeout(async () => {
                console.log('Selecting new page:', response.message);
                await this.selectPage(response.message);
                
                // Force re-render the page list to show active state
                this.renderPageList();
                
                // Focus the editor
                if (this.editor) {
                    this.editor.focus();
                }
                
                this.showSuccess(`Page "${title}" created and activated!`);
            }, 100);
            
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
        console.log('renderPageContent called with:', pageData);
        
        // First, ensure the editor interface is shown (not the welcome state)
        this.showEditorInterface();
        
        const pageTitleEditor = document.getElementById('page-title-editor');
        const editorElement = document.getElementById('sprintspace-editor');
        
        if (pageTitleEditor) {
            pageTitleEditor.value = pageData.title;
            pageTitleEditor.disabled = false;
            console.log('Page title set to:', pageData.title);
        }
        
        if (editorElement) {
            // Load content
            let initialContent = '';
            if (pageData.content_json) {
                try {
                    const contentData = JSON.parse(pageData.content_json);
                    console.log('Parsed content data:', contentData);
                    console.log('Content data type:', typeof contentData);
                    console.log('Content blocks:', contentData.blocks);
                    if (contentData.blocks && Array.isArray(contentData.blocks)) {
                        console.log('Converting', contentData.blocks.length, 'blocks to HTML');
                        initialContent = this.convertBlocksToHTML(contentData.blocks);
                        console.log('Converted blocks to HTML:', initialContent);
                        console.log('HTML length:', initialContent.length);
                    } else {
                        console.warn('No blocks found or blocks is not an array:', contentData);
                    }
                } catch (error) {
                    console.error('Error parsing content JSON:', error);
                    console.error('Raw content_json:', pageData.content_json);
                }
            } else {
                console.log('No content_json found in pageData:', pageData);
            }
            
            if (!initialContent) {
                initialContent = `<div class="sprintspace-block" data-block-type="paragraph">
                    <div class="block-menu-wrapper">
                        <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                    </div>
                    <p contenteditable="true">Type '/' for commands or start writing...</p>
                </div>`;
                console.log('Using default content:', initialContent);
            }
            
            editorElement.innerHTML = initialContent;
            editorElement.contentEditable = true;
            console.log('Editor content set, contentEditable:', editorElement.contentEditable);
            
            // Clear any existing event listeners and re-initialize
            this.cleanupEditor();
            
            // Initialize the editor functionality with a small delay
            setTimeout(() => {
                this.setupPageEditor();
                
                // Focus the editor to make it ready for input
                setTimeout(() => {
                    editorElement.focus();
                    console.log('Editor focused and ready for input');
                }, 100);
            }, 50);
        }
    }

    showEditorInterface() {
        const editorArea = document.getElementById('editor-area');
        
        // Ensure the editor area contains the proper editor interface elements
        if (!document.getElementById('sprintspace-editor') || !document.getElementById('sprintspace-command-menu')) {
            console.log('Restoring editor interface elements');
            editorArea.innerHTML = `
                <div id="sprintspace-editor" class="sprintspace-editor" contenteditable="false" placeholder="Select or create a page to start editing..."></div>
                <div id="sprintspace-command-menu" class="sprintspace-command-menu"></div>
            `;
        }
        
        console.log('Editor interface is ready');
    }

    async refreshWorkspaceState() {
        console.log('Refreshing workspace state...');
        
        try {
            // Reload workspaces and maintain current selection
            const currentWorkspace = this.currentWorkspace;
            const currentPage = this.currentPage;
            
            await this.loadWorkspaces();
            
            // Restore selections if they still exist
            if (currentWorkspace && this.workspaces.some(w => w.name === currentWorkspace)) {
                await this.selectWorkspace(currentWorkspace);
                
                if (currentPage && this.pages.some(p => p.name === currentPage)) {
                    await this.selectPage(currentPage);
                }
            }
            
            console.log('Workspace state refreshed successfully');
        } catch (error) {
            console.error('Error refreshing workspace state:', error);
        }
    }

    cleanupEditor() {
        const editor = document.getElementById('sprintspace-editor');
        const commandMenu = document.getElementById('sprintspace-command-menu');
        
        if (editor) {
            // Remove existing event listeners by cloning the element
            const newEditor = editor.cloneNode(true);
            editor.parentNode.replaceChild(newEditor, editor);
            console.log('Editor event listeners cleaned up');
        }
        
        if (commandMenu) {
            commandMenu.style.display = 'none';
        }
        
        // Clear any stored editor state
        if (this.workspaceEditorState) {
            this.workspaceEditorState.slashPosition = null;
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
                title: 'Todo List',
                subtitle: 'Task list with user assignment.',
                icon: '📋',
                keywords: ['todo', 'task', 'assign', 'user', 'list'],
                action: () => this.insertBlock(editor, 'todolist', '')
            },
            {
                title: 'Kanban Board',
                subtitle: 'Project management board.',
                icon: '📊',
                keywords: ['kanban', 'board', 'project', 'management', 'tasks'],
                action: () => this.insertBlock(editor, 'kanban', '')
            },
            {
                title: 'Table',
                subtitle: 'Create a table with rows and columns.',
                icon: '⚏',
                keywords: ['table', 'spreadsheet', 'grid', 'rows', 'columns'],
                action: () => this.insertBlock(editor, 'table', '')
            },
            {
                title: 'Toggle list',
                subtitle: 'Create a collapsible toggle list.',
                icon: '▶',
                keywords: ['toggle', 'collapsible', 'expand', 'collapse', 'fold'],
                action: () => this.insertBlock(editor, 'toggle', '')
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

        // Position menu with smart positioning to keep it on screen
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            menuElement.style.position = 'fixed';
            menuElement.style.zIndex = '10000';
            
            // Get menu dimensions (we need to show it first to measure)
            menuElement.style.visibility = 'hidden';
            menuElement.style.display = 'block';
            const menuRect = menuElement.getBoundingClientRect();
            menuElement.style.visibility = 'visible';
            
            // Calculate optimal position
            let top = rect.bottom + 5;
            let left = rect.left;
            
            // Adjust vertical position if menu would go off-screen
            const windowHeight = window.innerHeight;
            const spaceBelow = windowHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            if (spaceBelow < menuRect.height + 10 && spaceAbove > menuRect.height + 10) {
                // Show above the cursor
                top = rect.top - menuRect.height - 5;
            } else if (spaceBelow < menuRect.height + 10) {
                // If no space above either, position at bottom of viewport with some margin
                top = windowHeight - menuRect.height - 20;
            }
            
            // Adjust horizontal position if menu would go off-screen
            const windowWidth = window.innerWidth;
            if (left + menuRect.width > windowWidth - 20) {
                left = windowWidth - menuRect.width - 20;
            }
            
            // Ensure minimum left position
            if (left < 20) {
                left = 20;
            }
            
            menuElement.style.top = top + 'px';
            menuElement.style.left = left + 'px';
            
            console.log(`Command menu positioned at: top=${top}, left=${left}, menuHeight=${menuRect.height}, spaceBelow=${spaceBelow}, spaceAbove=${spaceAbove}`);
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

        let range = selection.getRangeAt(0);
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
            range = newRange; // Update our range reference
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
                html = '<div class="sprintspace-block" data-block-type="paragraph"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><p contenteditable="true">Type your content here...</p></div>';
                break;
            case 'heading':
                html = `<div class="sprintspace-block" data-block-type="heading" data-level="${level}"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><h${level} contenteditable="true">Your heading here</h${level}></div>`;
                break;
            case 'list':
                html = '<div class="sprintspace-block" data-block-type="list"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><ul><li contenteditable="true">List item</li></ul></div>';
                break;
            case 'numbered':
                html = '<div class="sprintspace-block" data-block-type="numbered"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><ol><li contenteditable="true">Numbered item</li></ol></div>';
                break;
            case 'checklist':
                html = '<div class="sprintspace-block" data-block-type="checklist">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<ul class="checklist-list" contenteditable="false">' +
                        '<li class="checklist-item">' +
                            '<input type="checkbox" onchange="this.closest(\'li\').classList.toggle(\'completed\', this.checked)">' +
                            '<div class="cl-text" contenteditable="true">To-do</div>' +
                        '</li>' +
                    '</ul>' +
                '</div>';
                break;
            case 'todolist':
                html = '<div class="sprintspace-block" data-block-type="todolist">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<div class="todolist" contenteditable="false">' +
                        '<div class="todolist-header" contenteditable="false">' +
                            '<h4 contenteditable="false">📋 Todo List</h4>' +
                        '</div>' +
                        '<div class="todo-item" contenteditable="false">' +
                            '<input type="checkbox" onchange="this.parentElement.classList.toggle(\'completed\', this.checked)">' +
                            '<div class="todo-content" contenteditable="false">' +
                                '<span contenteditable="true" placeholder="Enter task description...">Task with assignment</span>' +
                                '<div class="todo-meta" contenteditable="false">' +
                                    '<span class="todo-priority" contenteditable="false" onclick="window.sprintSpaceApp.cycleTodoPriority(this)">🔴 High</span>' +
                                    '<input type="date" class="todo-due-date" title="Due Date">' +
                                '</div>' +
                            '</div>' +
                            '<div class="todo-assignees" contenteditable="false">' +
                                '<button class="add-assignee-btn" onclick="window.sprintSpaceApp.showAssigneeSelector(this)">👤 Add Assignee</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'kanban':
                html = '<div class="sprintspace-block" data-block-type="kanban">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<div class="kanban-board" contenteditable="false">' +
                        '<div class="kanban-header">' +
                            '<h3 class="kanban-title">📊 Project Board</h3>' +
                            '<div class="kanban-controls">' +
                                '<button class="kanban-filter-btn">🔍 Filter</button>' +
                                '<button class="kanban-view-btn">👁️ View</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="kanban-columns">' +
                            '<div class="kanban-column" data-status="todo">' +
                                '<div class="column-header">' +
                                    '<h4 contenteditable="false"><span class="column-icon">📋</span>To Do <span class="task-count">0</span></h4>' +
                                '</div>' +
                                '<div class="kanban-items" contenteditable="false"></div>' +
                            '</div>' +
                            '<div class="kanban-column" data-status="progress">' +
                                '<div class="column-header">' +
                                    '<h4 contenteditable="false"><span class="column-icon">🔄</span>In Progress <span class="task-count">0</span></h4>' +
                                '</div>' +
                                '<div class="kanban-items" contenteditable="false"></div>' +
                            '</div>' +
                            '<div class="kanban-column" data-status="done">' +
                                '<div class="column-header">' +
                                    '<h4 contenteditable="false"><span class="column-icon">✅</span>Done <span class="task-count">0</span></h4>' +
                                '</div>' +
                                '<div class="kanban-items" contenteditable="false"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'table':
                html = '<div class="sprintspace-block" data-block-type="table"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><div class="table-wrapper" contenteditable="false"><table class="sprintspace-table"><thead><tr><th contenteditable="true">Column 1</th><th contenteditable="true">Column 2</th><th class="table-add-column" contenteditable="false"><button class="add-column-btn" onclick="window.sprintSpaceApp.addTableColumn(this)" title="Add column">+</button></th></tr></thead><tbody><tr><td contenteditable="true">Cell 1</td><td contenteditable="true">Cell 2</td><td class="table-add-column" contenteditable="false"></td></tr><tr class="table-add-row"><td contenteditable="false" colspan="3"><button class="add-row-btn" onclick="window.sprintSpaceApp.addTableRow(this)" title="Add row">+ Add row</button></td></tr></tbody></table></div></div>';
                break;
            case 'toggle':
                html = '<div class="sprintspace-block" data-block-type="toggle"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><div class="toggle-list" contenteditable="false"><div class="toggle-header" onclick="window.sprintSpaceApp.toggleCollapseExpand(this)" contenteditable="false"><span class="toggle-icon">▶</span><span contenteditable="true" class="toggle-title" onkeydown="window.sprintSpaceApp.handleToggleTitleKeydown(event, this)">Toggle</span></div><div class="toggle-content"><div class="toggle-item"><div contenteditable="true" onkeydown="window.sprintSpaceApp.handleToggleItemKeydown(event, this)">Empty toggle. Click to add content.</div></div></div></div></div>';
                break;
            case 'divider':
                html = '<div class="sprintspace-block" data-block-type="divider"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><hr></div>';
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
                    // Create a temporary div to hold the HTML and get the actual element
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const newElement = tempDiv.firstElementChild;
                    
                    if (newElement) {
                        updatedRange.insertNode(newElement);
                        console.log('Inserted new element:', newElement);
                        
                        // Force a reflow to ensure the element is rendered
                        newElement.offsetHeight; // Trigger reflow
                    
                        // Move cursor to after the inserted content safely
                        try {
                            const insertedNode = newElement;
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
                }
                // Close the 'else' block that handles non-empty editor insertion
                
                // Give it a moment to settle
                setTimeout(() => {
                    console.log('Editor content 100ms after insertion:', editor.innerHTML);
                }, 100);
                
                // Initialize special block functionality
                setTimeout(() => {
                    this.initializeBlockFeatures(type);
                }, 10);
                
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
                            selector = '.checklist-item:last-of-type .checklist-text, .checklist-item:last-of-type span';
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
                
                // ALWAYS ensure there's an editable paragraph after the inserted block
                setTimeout(() => {
                    this.ensureEditableSpaceAfterBlock(editor, type);
                }, 100);
                
                // Focus the editor
                editor.focus();
                
            } catch (error) {
                console.error('Error inserting block:', error);
                // Fallback: just replace the content
                editor.innerHTML = html;
                editor.focus();
                
                // Still ensure editable space even in error case
                setTimeout(() => {
                    this.ensureEditableSpaceAfterBlock(editor, type);
                }, 100);
            }
        }
    }

    ensureEditableSpaceAfterBlock(editor, blockType) {
        console.log('Ensuring editable space after block type:', blockType);
        
        // Check if the last element in the editor is editable
        const lastChild = editor.lastElementChild;
        
        // List of block types that need guaranteed editable space after them
        const needsSpaceAfter = ['kanban', 'todolist', 'divider', 'heading'];
        
        let needsNewParagraph = false;
        
        if (!lastChild) {
            needsNewParagraph = true;
        } else if (needsSpaceAfter.includes(blockType)) {
            // Always add space after these blocks
            needsNewParagraph = true;
        } else if (lastChild.hasAttribute('contenteditable') && lastChild.getAttribute('contenteditable') === 'false') {
            // Last element is not editable
            needsNewParagraph = true;
        } else if (!this.isEditableElement(lastChild)) {
            // Last element doesn't contain editable content
            needsNewParagraph = true;
        }
        
        if (needsNewParagraph) {
            console.log('Adding new editable paragraph after block');
            
            // Create a new editable paragraph
            const newParagraph = document.createElement('div');
            newParagraph.className = 'sprintspace-block';
            newParagraph.setAttribute('data-block-type', 'paragraph');
            newParagraph.innerHTML = `
                <div class="block-menu-wrapper">
                    <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                </div>
                <p contenteditable="true"><br></p>
            `;
            
            editor.appendChild(newParagraph);
            
            // Position cursor in the new paragraph
            setTimeout(() => {
                const editableParagraph = newParagraph.querySelector('p[contenteditable="true"]');
                if (editableParagraph) {
                    const range = document.createRange();
                    range.selectNodeContents(editableParagraph);
                    range.collapse(true);
                    
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    editableParagraph.focus();
                    console.log('Positioned cursor in new editable paragraph');
                }
            }, 50);
        }
    }

    isEditableElement(element) {
        // Check if element or its children contain editable content
        if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') === 'true') {
            return true;
        }
        
        // Check for editable children
        const editableChildren = element.querySelectorAll('[contenteditable="true"]');
        return editableChildren.length > 0;
    }

    async initializeBlockFeatures(blockType) {
        console.log('Initializing features for block type:', blockType);
        
        if (blockType === 'todolist') {
            await this.initializeTodoListFeatures();
        } else if (blockType === 'kanban') {
            this.initializeKanbanBoard();
        } else if (blockType === 'checklist') {
            this.initializeChecklistFeatures();
        } else if (blockType === 'table') {
            this.initializeTableFeatures();
        } else if (blockType === 'toggle') {
            this.initializeToggleFeatures();
        }
    }
    
    async initializeTodoListFeatures() {
        const todolist = document.querySelector('.todolist:last-of-type');
        if (!todolist) return;
        
        // Populate user dropdowns
        await this.populateUserDropdowns();
        
        // Add "Add Todo" button
        const addButton = document.createElement('button');
        addButton.textContent = '➕ Add Todo';
        addButton.className = 'add-todo-item';
        addButton.onclick = (e) => this.addTodoItem(e.currentTarget);
        todolist.appendChild(addButton);
        
        // Add priority click functionality & Enter handler on todo text
        todolist.addEventListener('click', (e) => {
            if (e.target.classList.contains('todo-priority')) {
                this.cycleTodoPriority(e.target);
            }
        });
        todolist.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.matches('.todo-content span[contenteditable="true"]')) {
                e.preventDefault();
                this.addTodoItem(addButton);
            }
        });
    }
    
    cycleTodoPriority(priorityElement) {
        const priorities = [
            {text: '🟢 Low', value: 'low'},
            {text: '🟡 Medium', value: 'medium'},
            {text: '🔴 High', value: 'high'}
        ];
        
        const currentText = priorityElement.textContent;
        const currentIndex = priorities.findIndex(p => p.text === currentText);
        const nextIndex = (currentIndex + 1) % priorities.length;
        
        priorityElement.textContent = priorities[nextIndex].text;
        priorityElement.dataset.priority = priorities[nextIndex].value;
    }
    
    async populateUserDropdowns() {
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            console.log('Loaded users:', users);
            
            // Find all user assignment dropdowns
            const dropdowns = document.querySelectorAll('.user-assignment');
            dropdowns.forEach(dropdown => {
                // Clear existing options except the first one
                while (dropdown.children.length > 1) {
                    dropdown.removeChild(dropdown.lastChild);
                }
                
                // Add user options
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.full_name || user.name;
                    option.title = user.email;
                    dropdown.appendChild(option);
                });
            });
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    initializeKanbanBoard() {
        const kanbanBoard = document.querySelector('.kanban-board:last-of-type');
        if (!kanbanBoard) return;
        
        // Add drag and drop functionality
        this.setupKanbanDragDrop(kanbanBoard);
        
        // Add "Add Task" buttons to each column
        const columns = kanbanBoard.querySelectorAll('.kanban-column');
        columns.forEach(column => {
            const addButton = document.createElement('button');
            addButton.textContent = '+ Add card';
            addButton.className = 'add-kanban-task';
            addButton.onclick = () => this.addKanbanTask(column);
            
            const itemsContainer = column.querySelector('.kanban-items');
            itemsContainer.appendChild(addButton);
        });
        
        // Update task counts initially
        this.updateTaskCounts();
        
        // Add filter and view button functionality
        const filterBtn = kanbanBoard.querySelector('.kanban-filter-btn');
        const viewBtn = kanbanBoard.querySelector('.kanban-view-btn');
        
        if (filterBtn) {
            filterBtn.onclick = () => this.showFilterMenu();
        }
        
        if (viewBtn) {
            viewBtn.onclick = () => this.showViewMenu();
        }
    }
    
    updateTaskCounts() {
        const kanbanBoard = document.querySelector('.kanban-board:last-of-type');
        if (!kanbanBoard) return;
        
        const columns = kanbanBoard.querySelectorAll('.kanban-column');
        columns.forEach(column => {
            const tasks = column.querySelectorAll('.kanban-task');
            const countElement = column.querySelector('.task-count');
            if (countElement) {
                countElement.textContent = tasks.length;
            }
        });
    }
    
    showFilterMenu() {
        this.showToast('Filter functionality coming soon! 🔍', 'info');
    }
    
    showViewMenu() {
        this.showToast('View options coming soon! 👁️', 'info');
    }
    
    setupKanbanDragDrop(board) {
        const columns = board.querySelectorAll('.kanban-items');
        
        columns.forEach(column => {
            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                column.classList.add('drag-over');
            });
            
            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });
            
            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');
                
                const taskId = e.dataTransfer.getData('text/plain');
                const task = document.getElementById(taskId);
                if (task) {
                    column.appendChild(task);
                    // Update task status based on column
                    const status = column.parentElement.dataset.status;
                    task.dataset.status = status;
                }
            });
        });
    }
    
    addKanbanTask(column) {
        // Show task creation modal instead of inline creation
        this.showTaskCreationModal(column);
    }
    
    showTaskCreationModal(column) {
        const columnStatus = column.dataset.status;
        // Store the column status for later use
        this.currentTaskColumn = columnStatus;
        this.tempAssignees = null; // Reset any previous assignees
        
        const modalHtml = `
            <div class="modal-content">
                <h3>✨ Create New Task</h3>
                <div class="form-group">
                    <label>📝 Task Title</label>
                    <input type="text" id="task-title" placeholder="Enter task title..." required>
                </div>
                <div class="form-group">
                    <label>📄 Description</label>
                    <textarea id="task-description" placeholder="Add a description..."></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>📅 Start Date</label>
                        <input type="date" id="task-start-date">
                    </div>
                    <div class="form-group">
                        <label>⏰ Due Date</label>
                        <input type="date" id="task-due-date">
                    </div>
                </div>
                <div class="form-group">
                    <label>👥 Assignees</label>
                    <div class="task-assignees" id="task-assignees">
                        <button type="button" class="add-assignee-btn" onclick="window.sprintSpaceApp.showKanbanAssigneeSelector()">👤 Add Assignee</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>🎯 Priority</label>
                    <select id="task-priority">
                        <option value="low">🟢 Low</option>
                        <option value="medium" selected>🟡 Medium</option>
                        <option value="high">🔴 High</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="create-task-btn" data-column="${columnStatus}">Create Task</button>
                </div>
            </div>
        `;
        
        this.showModalHTML('Create Task', modalHtml);
        
        // Add event listener for create button
        setTimeout(() => {
            const createBtn = document.getElementById('create-task-btn');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    this.createKanbanTask(createBtn.dataset.column);
                });
            }
            
            // Populate user dropdown
            this.populateTaskUserDropdown();
            
            // Focus the title input
            document.getElementById('task-title')?.focus();
        }, 100);
    }
    
    async populateTaskUserDropdown() {
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            const dropdown = document.getElementById('task-assignee');
            
            if (dropdown) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.full_name || user.name;
                    dropdown.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading users for task:', error);
        }
    }
    
    createKanbanTask(columnStatus) {
        const title = document.getElementById('task-title').value.trim();
        const description = document.getElementById('task-description').value.trim();
        const startDate = document.getElementById('task-start-date').value;
        const dueDate = document.getElementById('task-due-date').value;
        const priority = document.getElementById('task-priority').value;
        
        // Get multiple assignees
        const assigneeTags = document.querySelectorAll('#task-assignees .assignee-tag');
        const assignees = Array.from(assigneeTags).map(tag => ({
            user: tag.dataset.user,
            name: tag.querySelector('.assignee-name').textContent
        }));
        
        if (!title) {
            alert('Please enter a task title');
            return;
        }
        
        // Find the column and items container
        const column = document.querySelector(`.kanban-column[data-status="${columnStatus}"]`);
        const itemsContainer = column.querySelector('.kanban-items');
        
        // Create task element
        const task = document.createElement('div');
        task.className = 'kanban-task';
        task.draggable = true;
        task.id = 'task-' + Date.now();
        task.dataset.assignees = JSON.stringify(assignees);
        task.dataset.startDate = startDate;
        task.dataset.dueDate = dueDate;
        task.dataset.priority = priority;
        
        // Get priority color
        const priorityColors = {
            low: '🟢',
            medium: '🟡', 
            high: '🔴'
        };
        
        // Generate assignees HTML
        const assigneesHTML = assignees.length > 0 ? `
            <div class="task-assignees">
                ${assignees.map(assignee => `
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&size=24&background=667eea&color=fff" alt="${assignee.name}" class="assignee-avatar" title="${assignee.name}">
                `).join('')}
                ${assignees.length > 3 ? `<span class="assignee-overflow">+${assignees.length - 3}</span>` : ''}
            </div>
        ` : '';
        
        task.innerHTML = `
            <div class="task-header">
                <span class="task-priority">${priorityColors[priority]} ${priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
                <div class="task-menu">
                    <button class="task-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showTaskMenu(event, '${task.id}')">⋮</button>
                </div>
            </div>
            <div class="task-title" contenteditable="true" onblur="window.sprintSpaceApp.saveTaskTitle('${task.id}')">${title}</div>
            ${description ? `<div class="task-description">${description}</div>` : ''}
            <div class="task-footer">
                <div class="task-dates">
                    ${startDate ? `<span class="task-start">📅 ${startDate}</span>` : ''}
                    ${dueDate ? `<span class="task-due ${this.isOverdue(dueDate) ? 'overdue' : ''}">⏰ ${dueDate}</span>` : ''}
                </div>
                ${assigneesHTML}
            </div>
        `;
        
        // Setup event listeners
        this.setupTaskEventListeners(task);
        
        itemsContainer.appendChild(task);
        this.hideModal();
        
        console.log('Created task:', {title, description, startDate, dueDate, assignee, priority});
    }
    
    editKanbanTask(task) {
        // Extract current task data
        const title = task.querySelector('.task-title').textContent;
        const description = task.querySelector('.task-description')?.textContent || '';
        const startDate = task.dataset.startDate || '';
        const dueDate = task.dataset.dueDate || '';
        const assignee = task.dataset.assignee || '';
        const priority = task.dataset.priority || 'medium';
        
        // Show edit modal with current values
        const modalHtml = `
            <div class="modal-content">
                <h3>Edit Task</h3>
                <div class="form-group">
                    <label>Task Title</label>
                    <input type="text" id="edit-task-title" placeholder="Enter task title..." value="${title}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="edit-task-description" placeholder="Task description...">${description}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Start Date</label>
                        <input type="date" id="edit-task-start-date" value="${startDate}">
                    </div>
                    <div class="form-group">
                        <label>Due Date</label>
                        <input type="date" id="edit-task-due-date" value="${dueDate}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Assign to</label>
                    <select id="edit-task-assignee">
                        <option value="">Select user...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Priority</label>
                    <select id="edit-task-priority">
                        <option value="low">🟢 Low</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="high">🔴 High</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-danger" onclick="window.sprintSpaceApp.deleteKanbanTask('${task.id}')">Delete</button>
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="window.sprintSpaceApp.updateKanbanTask('${task.id}')">Update Task</button>
                </div>
            </div>
        `;
        
        this.showModalHTML('Edit Task', modalHtml);
        
        // Populate dropdown and set current values
        this.populateEditTaskUserDropdown(assignee);
        document.getElementById('edit-task-priority').value = priority;
    }
    
    async populateEditTaskUserDropdown(currentAssignee) {
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            const dropdown = document.getElementById('edit-task-assignee');
            
            if (dropdown) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.full_name || user.name;
                    if (user.name === currentAssignee) {
                        option.selected = true;
                    }
                    dropdown.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading users for task edit:', error);
        }
    }
    
    updateKanbanTask(taskId) {
        const task = document.getElementById(taskId);
        if (!task) return;
        
        const title = document.getElementById('edit-task-title').value.trim();
        const description = document.getElementById('edit-task-description').value.trim();
        const startDate = document.getElementById('edit-task-start-date').value;
        const dueDate = document.getElementById('edit-task-due-date').value;
        const assignee = document.getElementById('edit-task-assignee').value;
        const priority = document.getElementById('edit-task-priority').value;
        
        if (!title) {
            alert('Please enter a task title');
            return;
        }
        
        // Update task data
        task.dataset.assignee = assignee;
        task.dataset.startDate = startDate;
        task.dataset.dueDate = dueDate;
        task.dataset.priority = priority;
        
        // Get priority color and assignee name
        const priorityColors = {
            low: '🟢',
            medium: '🟡', 
            high: '🔴'
        };
        
        const assigneeName = assignee ? (document.querySelector(`#edit-task-assignee option[value="${assignee}"]`)?.textContent || assignee) : '';
        
        // Update task HTML
        task.innerHTML = `
            <div class="task-header">
                <span class="task-priority">${priorityColors[priority]} ${priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
                <div class="task-menu">
                    <button class="task-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showTaskMenu(event, '${task.id}')">⋮</button>
                </div>
            </div>
            <div class="task-title" contenteditable="true" onblur="window.sprintSpaceApp.saveTaskTitle('${task.id}')">${title}</div>
            ${description ? `<div class="task-description">${description}</div>` : ''}
            <div class="task-footer">
                <div class="task-dates">
                    ${startDate ? `<span class="task-start">📅 ${startDate}</span>` : ''}
                    ${dueDate ? `<span class="task-due ${this.isOverdue(dueDate) ? 'overdue' : ''}">⏰ ${dueDate}</span>` : ''}
                </div>
                ${assigneeName ? `<div class="task-assignee">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assigneeName)}&size=24&background=667eea&color=fff" alt="${assigneeName}" class="assignee-avatar">
                    <span class="assignee-name">${assigneeName}</span>
                </div>` : ''}
            </div>
        `;
        
        // Re-add event listeners
        this.setupTaskEventListeners(task);
        
        this.hideModal();
        console.log('Updated task:', {title, description, startDate, dueDate, assignee, priority});
    }
    
    deleteKanbanTask(taskId) {
        if (confirm('Are you sure you want to delete this task?')) {
            const task = document.getElementById(taskId);
            if (task) {
                task.remove();
                this.hideModal();
                this.hideTaskMenu();
            }
        }
    }
    
    showBlockMenu(event, blockElement) {
        // Hide any existing menu
        this.hideBlockMenu();
        
        const blockType = blockElement.dataset.blockType;
        const menu = document.createElement('div');
        menu.className = 'block-context-menu';
        menu.id = 'block-context-menu';
        
        menu.innerHTML = `
            <div class="menu-item" onclick="window.sprintSpaceApp.deleteBlock('${blockElement.id || Date.now()}')">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.duplicateBlock('${blockElement.id || Date.now()}')">
                <span class="menu-icon">📄</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item" onclick="window.sprintSpaceApp.convertBlock('${blockElement.id || Date.now()}', 'paragraph')">
                <span class="menu-icon">¶</span>
                <span class="menu-text">Turn into Text</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.convertBlock('${blockElement.id || Date.now()}', 'heading')">
                <span class="menu-icon">H</span>
                <span class="menu-text">Turn into Heading</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.convertBlock('${blockElement.id || Date.now()}', 'list')">
                <span class="menu-icon">•</span>
                <span class="menu-text">Turn into List</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.convertBlock('${blockElement.id || Date.now()}', 'todolist')">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Turn into Todo</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item" onclick="window.sprintSpaceApp.moveBlockUp('${blockElement.id || Date.now()}')">
                <span class="menu-icon">⬆️</span>
                <span class="menu-text">Move up</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.moveBlockDown('${blockElement.id || Date.now()}')">
                <span class="menu-icon">⬇️</span>
                <span class="menu-text">Move down</span>
            </div>
        `;
        
        // Assign ID if not present
        if (!blockElement.id) {
            blockElement.id = 'block-' + Date.now();
        }
        
        // Position the menu
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = rect.bottom + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '10001';
        
        document.body.appendChild(menu);
        
        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.hideBlockMenu.bind(this), { once: true });
        }, 100);
    }
    
    hideBlockMenu() {
        const menu = document.getElementById('block-context-menu');
        if (menu) {
            menu.remove();
        }
    }
    
    deleteBlock(blockId) {
        if (confirm('Are you sure you want to delete this block?')) {
            const block = document.getElementById(blockId);
            if (block) {
                block.remove();
                this.hideBlockMenu();
                this.showToast('Block deleted 🗑️', 'success');
            }
        }
    }
    
    duplicateBlock(blockId) {
        const originalBlock = document.getElementById(blockId);
        if (!originalBlock) return;
        
        const newBlockId = 'block-' + Date.now();
        const newBlock = originalBlock.cloneNode(true);
        newBlock.id = newBlockId;
        
        // Update the HTML to have new IDs and event handlers
        newBlock.innerHTML = newBlock.innerHTML.replace(new RegExp(blockId, 'g'), newBlockId);
        
        // Insert after the original block
        originalBlock.insertAdjacentElement('afterend', newBlock);
        
        this.hideBlockMenu();
        this.showToast('Block duplicated 📄', 'success');
    }
    
    convertBlock(blockId, newType) {
        const block = document.getElementById(blockId);
        if (!block) return;
        
        const blockType = block.dataset.blockType;
        if (blockType === newType) return;
        
        // Extract current content
        let content = '';
        if (blockType === 'paragraph') {
            content = block.querySelector('p')?.textContent || '';
        } else if (blockType === 'heading') {
            content = block.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || '';
        } else if (blockType === 'list' || blockType === 'numbered') {
            content = block.querySelector('li')?.textContent || '';
        }
        
        // Generate new HTML
        let newHTML = '';
        switch (newType) {
            case 'paragraph':
                newHTML = `<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><p contenteditable="true">${content}</p>`;
                break;
            case 'heading':
                newHTML = `<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><h2 contenteditable="true">${content}</h2>`;
                break;
            case 'list':
                newHTML = `<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><ul><li contenteditable="true">${content}</li></ul>`;
                break;
            case 'todolist':
                newHTML = `<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><div class="todolist"><div class="todolist-header"><h4>📋 Todo List</h4></div><div class="todo-item"><input type="checkbox"> <div class="todo-content"><span contenteditable="true">${content}</span></div></div></div>`;
                break;
        }
        
        if (newHTML) {
            block.innerHTML = newHTML;
            block.dataset.blockType = newType;
            this.hideBlockMenu();
            this.showToast(`Converted to ${newType} ✨`, 'success');
        }
    }
    
    moveBlockUp(blockId) {
        const block = document.getElementById(blockId);
        if (!block || !block.previousElementSibling) return;
        
        block.parentNode.insertBefore(block, block.previousElementSibling);
        this.hideBlockMenu();
        this.showToast('Block moved up ⬆️', 'success');
    }
    
    moveBlockDown(blockId) {
        const block = document.getElementById(blockId);
        if (!block || !block.nextElementSibling) return;
        
        block.parentNode.insertBefore(block.nextElementSibling, block);
        this.hideBlockMenu();
        this.showToast('Block moved down ⬇️', 'success');
    }
    
    showTaskMenu(event, taskId) {
        // Hide any existing menu
        this.hideTaskMenu();
        
        const menu = document.createElement('div');
        menu.className = 'task-context-menu';
        menu.id = 'task-context-menu';
        
        menu.innerHTML = `
            <div class="menu-item" onclick="window.sprintSpaceApp.editKanbanTask(document.getElementById('${taskId}'))">
                <span class="menu-icon">✏️</span>
                <span class="menu-text">Edit task</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.duplicateTask('${taskId}')">
                <span class="menu-icon">📄</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.moveTaskToColumn('${taskId}', 'todo')">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Move to To Do</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.moveTaskToColumn('${taskId}', 'progress')">
                <span class="menu-icon">🔄</span>
                <span class="menu-text">Move to In Progress</span>
            </div>
            <div class="menu-item" onclick="window.sprintSpaceApp.moveTaskToColumn('${taskId}', 'done')">
                <span class="menu-icon">✅</span>
                <span class="menu-text">Move to Done</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item danger" onclick="window.sprintSpaceApp.deleteKanbanTask('${taskId}')">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
        `;
        
        // Position the menu
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = rect.bottom + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '10001';
        
        document.body.appendChild(menu);
        
        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.hideTaskMenu.bind(this), { once: true });
        }, 100);
    }
    
    hideTaskMenu() {
        const menu = document.getElementById('task-context-menu');
        if (menu) {
            menu.remove();
        }
    }
    
    duplicateTask(taskId) {
        const originalTask = document.getElementById(taskId);
        if (!originalTask) return;
        
        const column = originalTask.closest('.kanban-column');
        const newTaskId = 'task-' + Date.now();
        const newTask = originalTask.cloneNode(true);
        newTask.id = newTaskId;
        
        // Update the HTML to have new IDs
        newTask.innerHTML = newTask.innerHTML.replace(new RegExp(taskId, 'g'), newTaskId);
        
        // Add to the same column
        const itemsContainer = column.querySelector('.kanban-items');
        itemsContainer.appendChild(newTask);
        
        // Re-add event listeners
        this.setupTaskEventListeners(newTask);
        
        this.hideTaskMenu();
        this.showToast('Task duplicated successfully! 📄', 'success');
    }
    
    moveTaskToColumn(taskId, columnStatus) {
        const task = document.getElementById(taskId);
        if (!task) return;
        
        const targetColumn = document.querySelector(`.kanban-column[data-status="${columnStatus}"]`);
        const targetItems = targetColumn.querySelector('.kanban-items');
        
        targetItems.appendChild(task);
        this.hideTaskMenu();
        
        const columnNames = {
            todo: 'To Do',
            progress: 'In Progress', 
            done: 'Done'
        };
        
        this.showToast(`Task moved to ${columnNames[columnStatus]} 🚀`, 'success');
    }
    
    saveTaskTitle(taskId) {
        const task = document.getElementById(taskId);
        if (!task) return;
        
        const titleElement = task.querySelector('.task-title');
        const newTitle = titleElement.textContent.trim();
        
        if (newTitle === '') {
            titleElement.textContent = 'Untitled Task';
        }
        
        console.log(`Task ${taskId} title updated to: ${newTitle}`);
    }
    
    setupTaskEventListeners(task) {
        // Add drag functionality
        task.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
        });
        
        // Add hover effects
        task.addEventListener('mouseenter', () => {
            task.classList.add('task-hover');
        });
        
        task.addEventListener('mouseleave', () => {
            task.classList.remove('task-hover');
        });
    }
    
    isOverdue(dueDate) {
        if (!dueDate) return false;
        const today = new Date();
        const due = new Date(dueDate);
        return due < today;
    }
    
    // Note: Removed duplicate function - using the proper one below
    
    addChecklistItem(checklist) {
        const newItem = document.createElement('div');
        newItem.className = 'checklist-item';
        newItem.innerHTML = '<input type="checkbox" onchange="this.parentElement.classList.toggle(\'completed\', this.checked)"> <span contenteditable="true">New item</span>';
        
        // Insert before the add button
        const addButton = checklist.querySelector('.add-checklist-item');
        checklist.insertBefore(newItem, addButton);
        
        // Focus the new item
        const span = newItem.querySelector('span');
        span.focus();
        span.select();
    }
    
    addTodoItem(button) {
        const todolist = button.closest ? button.closest('.todolist') : document.querySelector('.todolist:last-of-type');
        const newItem = document.createElement('div');
        newItem.className = 'todo-item';
        newItem.setAttribute('contenteditable', 'false');
        newItem.innerHTML = `
            <input type="checkbox" onchange="this.parentElement.classList.toggle('completed', this.checked)"> 
            <div class="todo-content" contenteditable="false">
                <span contenteditable="true" placeholder="Enter task description...">New task</span>
                <div class="todo-meta" contenteditable="false">
                    <span class="todo-priority" contenteditable="false" onclick="window.sprintSpaceApp.cycleTodoPriority(this)">🟡 Medium</span>
                    <input type="date" class="todo-due-date" title="Due Date">
                </div>
            </div>
            <div class="todo-assignees" contenteditable="false">
                <button class="add-assignee-btn" onclick="window.sprintSpaceApp.showAssigneeSelector(this)">👤 Add Assignee</button>
            </div>
        `;
        
        // Insert before the add button
        const addButton = todolist.querySelector('.add-todo-item');
        if (addButton) {
            todolist.insertBefore(newItem, addButton);
        } else {
            todolist.appendChild(newItem);
        }
        
        // Focus the new item
        const span = newItem.querySelector('span[contenteditable="true"]');
        span.focus();
        span.select();
    }
    
    async populateTodoUserDropdown(dropdown) {
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.name;
                option.textContent = user.full_name || user.name;
                dropdown.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading users for todo:', error);
        }
    }

    async showAssigneeSelector(button) {
        const assigneesContainer = button.closest('.todo-assignees') || button.closest('.task-assignees');
        
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            
            // Create user selection modal
            const modalHtml = `
                <div class="assignee-selector">
                    <h4>Select Assignees</h4>
                    <div class="user-list">
                        ${users.map(user => `
                            <div class="user-option" data-user="${user.name}" onclick="window.sprintSpaceApp.toggleAssignee(this, '${assigneesContainer.closest('.todo-item, .kanban-task') ? assigneesContainer.closest('.todo-item, .kanban-task').id || 'temp-' + Date.now() : 'temp-' + Date.now()}')">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.name)}&size=32&background=667eea&color=fff" alt="${user.full_name || user.name}" class="user-avatar">
                                <span class="user-name">${user.full_name || user.name}</span>
                                <span class="user-email">${user.email}</span>
                                <input type="checkbox" class="user-checkbox">
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="window.sprintSpaceApp.applyAssignees('${assigneesContainer.closest('.todo-item, .kanban-task') ? assigneesContainer.closest('.todo-item, .kanban-task').id || 'temp-' + Date.now() : 'temp-' + Date.now()}')">Apply</button>
                    </div>
                </div>
            `;
            
            this.showModalHTML('Select Assignees', modalHtml);
            
            // Mark currently assigned users
            const currentAssignees = assigneesContainer.querySelectorAll('.assignee-tag');
            currentAssignees.forEach(tag => {
                const userName = tag.dataset.user;
                const userOption = document.querySelector(`[data-user="${userName}"]`);
                if (userOption) {
                    userOption.querySelector('.user-checkbox').checked = true;
                    userOption.classList.add('selected');
                }
            });
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Failed to load users');
        }
    }

    toggleAssignee(userOption, taskId) {
        const checkbox = userOption.querySelector('.user-checkbox');
        checkbox.checked = !checkbox.checked;
        userOption.classList.toggle('selected', checkbox.checked);
    }

    applyAssignees(taskId) {
        const selectedUsers = document.querySelectorAll('.user-option.selected');
        const assigneesContainer = document.querySelector(`#${taskId} .todo-assignees, #${taskId} .task-assignees`);
        
        if (!assigneesContainer) {
            console.error('Assignees container not found for task:', taskId);
            this.hideModal();
            return;
        }
        
        // Clear existing assignee tags
        assigneesContainer.querySelectorAll('.assignee-tag').forEach(tag => tag.remove());
        
        // Add new assignee tags
        selectedUsers.forEach(userOption => {
            const userName = userOption.dataset.user;
            const userFullName = userOption.querySelector('.user-name').textContent;
            
            const assigneeTag = document.createElement('div');
            assigneeTag.className = 'assignee-tag';
            assigneeTag.dataset.user = userName;
            assigneeTag.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userFullName)}&size=24&background=667eea&color=fff" alt="${userFullName}" class="assignee-avatar">
                <span class="assignee-name">${userFullName}</span>
                <button class="remove-assignee" onclick="this.parentElement.remove()" title="Remove assignee">×</button>
            `;
            
            // Insert before the "Add Assignee" button
            const addButton = assigneesContainer.querySelector('.add-assignee-btn');
            if (addButton) {
                assigneesContainer.insertBefore(assigneeTag, addButton);
            } else {
                assigneesContainer.appendChild(assigneeTag);
            }
        });
        
        this.hideModal();
    }

    cycleTodoPriority(priorityElement) {
        const priorities = [
            {text: '🟢 Low', value: 'low'},
            {text: '🟡 Medium', value: 'medium'},
            {text: '🔴 High', value: 'high'}
        ];
        
        const currentText = priorityElement.textContent.trim();
        let currentIndex = priorities.findIndex(p => p.text === currentText);
        
        // Move to next priority (cycle back to start if at end)
        currentIndex = (currentIndex + 1) % priorities.length;
        
        priorityElement.textContent = priorities[currentIndex].text;
        priorityElement.setAttribute('data-priority', priorities[currentIndex].value);
    }

    async showKanbanAssigneeSelector() {
        // Store current form data before switching modals
        this.tempTaskData = {
            title: document.getElementById('task-title')?.value || '',
            description: document.getElementById('task-description')?.value || '',
            startDate: document.getElementById('task-start-date')?.value || '',
            dueDate: document.getElementById('task-due-date')?.value || '',
            priority: document.getElementById('task-priority')?.value || 'medium'
        };
        
        try {
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_frappe_users'
            });
            
            const users = response.message || [];
            
            // Create user selection modal
            const modalHtml = `
                <div class="assignee-selector">
                    <h4>Select Assignees</h4>
                    <div class="user-list">
                        ${users.map(user => `
                            <div class="user-option" data-user="${user.name}" onclick="window.sprintSpaceApp.toggleKanbanAssignee(this)">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.name)}&size=32&background=667eea&color=fff" alt="${user.full_name || user.name}" class="user-avatar">
                                <span class="user-name">${user.full_name || user.name}</span>
                                <span class="user-email">${user.email}</span>
                                <input type="checkbox" class="user-checkbox">
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="window.sprintSpaceApp.applyKanbanAssignees()">Apply</button>
                    </div>
                </div>
            `;
            
            this.showModalHTML('Select Assignees', modalHtml);
            
            // Mark currently assigned users
            const currentAssignees = document.querySelectorAll('#task-assignees .assignee-tag');
            currentAssignees.forEach(tag => {
                const userName = tag.dataset.user;
                const userOption = document.querySelector(`[data-user="${userName}"]`);
                if (userOption) {
                    userOption.querySelector('.user-checkbox').checked = true;
                    userOption.classList.add('selected');
                }
            });
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Failed to load users');
        }
    }

    toggleKanbanAssignee(userOption) {
        const checkbox = userOption.querySelector('.user-checkbox');
        checkbox.checked = !checkbox.checked;
        userOption.classList.toggle('selected', checkbox.checked);
    }

    applyKanbanAssignees() {
        const selectedUsers = document.querySelectorAll('.user-option.selected');
        
        // Store the assignees data temporarily so we can restore the task creation modal
        this.tempAssignees = Array.from(selectedUsers).map(userOption => ({
            user: userOption.dataset.user,
            name: userOption.querySelector('.user-name').textContent
        }));
        
        // Return to the task creation modal
        this.showTaskCreationModalWithAssignees();
    }

    showTaskCreationModalWithAssignees() {
        // Get the current column status from the button that was clicked
        const currentColumn = document.querySelector('.kanban-column'); // We'll need to store this better
        const columnStatus = this.currentTaskColumn || 'todo'; // Default fallback
        
        const modalHtml = `
            <div class="modal-content">
                <h3>✨ Create New Task</h3>
                <div class="form-group">
                    <label>📝 Task Title</label>
                    <input type="text" id="task-title" placeholder="Enter task title..." required>
                </div>
                <div class="form-group">
                    <label>📄 Description</label>
                    <textarea id="task-description" placeholder="Add a description..."></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>📅 Start Date</label>
                        <input type="date" id="task-start-date">
                    </div>
                    <div class="form-group">
                        <label>⏰ Due Date</label>
                        <input type="date" id="task-due-date">
                    </div>
                </div>
                <div class="form-group">
                    <label>👥 Assignees</label>
                    <div class="task-assignees" id="task-assignees">
                        ${this.tempAssignees ? this.tempAssignees.map(assignee => `
                            <div class="assignee-tag" data-user="${assignee.user}">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&size=24&background=667eea&color=fff" alt="${assignee.name}" class="assignee-avatar">
                                <span class="assignee-name">${assignee.name}</span>
                                <button class="remove-assignee" onclick="this.parentElement.remove()" title="Remove assignee">×</button>
                            </div>
                        `).join('') : ''}
                        <button type="button" class="add-assignee-btn" onclick="window.sprintSpaceApp.showKanbanAssigneeSelector()">👤 Add Assignee</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>🎯 Priority</label>
                    <select id="task-priority">
                        <option value="low">🟢 Low</option>
                        <option value="medium" selected>🟡 Medium</option>
                        <option value="high">🔴 High</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="create-task-btn" data-column="${columnStatus}">Create Task</button>
                </div>
            </div>
        `;
        
        this.showModalHTML('Create Task', modalHtml);
        
        // Add event listener for create button
        setTimeout(() => {
            const createBtn = document.getElementById('create-task-btn');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    this.createKanbanTask(createBtn.dataset.column);
                });
            }
            
            // Restore form data if it exists
            if (this.tempTaskData) {
                document.getElementById('task-title').value = this.tempTaskData.title;
                document.getElementById('task-description').value = this.tempTaskData.description;
                document.getElementById('task-start-date').value = this.tempTaskData.startDate;
                document.getElementById('task-due-date').value = this.tempTaskData.dueDate;
                document.getElementById('task-priority').value = this.tempTaskData.priority;
            }
            
            // Focus the title input
            document.getElementById('task-title')?.focus();
        }, 100);
    }

    convertBlocksToHTML(blocks) {
        if (!blocks || !Array.isArray(blocks)) {
            console.warn('convertBlocksToHTML: Invalid blocks input:', blocks);
            return '';
        }
        
        console.log('convertBlocksToHTML: Processing', blocks.length, 'blocks');
        
        return blocks.map((block, index) => {
            console.log(`Processing block ${index}:`, block);
            switch (block.type) {
                case 'header':
                    const level = block.data.level || 1;
                    return `<div class="sprintspace-block" data-block-type="heading" data-level="${level}">
                        <div class="block-menu-wrapper">
                            <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                        </div>
                        <h${level} contenteditable="true">${block.data.text}</h${level}>
                    </div>`;
                case 'paragraph':
                    return `<div class="sprintspace-block" data-block-type="paragraph">
                        <div class="block-menu-wrapper">
                            <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                        </div>
                        <p contenteditable="true">${block.data.text}</p>
                    </div>`;
                case 'list':
                    const listType = block.data.style === 'ordered' ? 'ol' : 'ul';
                    const blockType = block.data.style === 'ordered' ? 'numbered' : 'list';
                    const items = block.data.items.map(item => `<li contenteditable="true">${item}</li>`).join('');
                    return `<div class="sprintspace-block" data-block-type="${blockType}">
                        <div class="block-menu-wrapper">
                            <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                        </div>
                        <${listType}>${items}</${listType}>
                    </div>`;
                default:
                    return `<div class="sprintspace-block" data-block-type="paragraph">
                        <div class="block-menu-wrapper">
                            <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                        </div>
                        <p contenteditable="true">${block.data.text || 'Type \'/\' for commands or start writing...'}</p>
                    </div>`;
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

    showModalHTML(title, html) {
        console.log('showModalHTML called with title:', title);
        
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
        
        modalTitle.textContent = title;
        modalContent.innerHTML = html;
        
        // FORCE show modal with maximum z-index and important styles
        modalOverlay.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0, 0, 0, 0.6) !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 999999 !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        modalOverlay.classList.add('show');
        
        // FORCE modal content styles with maximum z-index
        modal.style.cssText = `
            background: white !important;
            border-radius: 12px !important;
            padding: 24px !important;
            width: 90% !important;
            max-width: 500px !important;
            margin: 16px !important;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3) !important;
            position: relative !important;
            z-index: 9999999 !important;
            visibility: visible !important;
            opacity: 1 !important;
            display: block !important;
            transform: scale(1) !important;
        `;
        
        // Debug output
        console.log('Modal styles applied. Current computed styles:');
        console.log('Overlay display:', window.getComputedStyle(modalOverlay).display);
        console.log('Overlay visibility:', window.getComputedStyle(modalOverlay).visibility);
        console.log('Overlay z-index:', window.getComputedStyle(modalOverlay).zIndex);
        console.log('Modal display:', window.getComputedStyle(modal).display);
        console.log('Modal visibility:', window.getComputedStyle(modal).visibility);
        console.log('Modal z-index:', window.getComputedStyle(modal).zIndex);
        
        // Ensure it's in front of everything
        document.body.appendChild(modalOverlay);
        
        console.log('Modal shown with HTML content and FORCED styles');
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
            // Use cssText to completely reset all styles
            modalOverlay.style.cssText = 'display: none !important;';
        }
        
        if (modal) {
            // Use cssText to completely reset all styles
            modal.style.cssText = '';
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

    // ==================== TABLE FEATURES ====================

    initializeTableFeatures() {
        const table = document.querySelector('.sprintspace-table:last-of-type');
        if (!table) return;
        
        console.log('Initializing table features');
        
        // Add event listeners for table cells
        const cells = table.querySelectorAll('td[contenteditable="true"], th[contenteditable="true"]');
        cells.forEach(cell => {
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.navigateTableCell(e.shiftKey ? 'prev' : 'next', cell);
                }
            });
        });
    }

    addTableColumn(button) {
        const table = button.closest('.sprintspace-table');
        const headerRow = table.querySelector('thead tr');
        const bodyRows = table.querySelectorAll('tbody tr:not(.table-add-row)');
        
        const columnCount = headerRow.querySelectorAll('th:not(.table-add-column)').length;
        
        // Add header cell
        const newHeaderCell = document.createElement('th');
        newHeaderCell.contentEditable = true;
        newHeaderCell.textContent = `Column ${columnCount + 1}`;
        headerRow.insertBefore(newHeaderCell, headerRow.querySelector('.table-add-column'));
        
        // Add body cells
        bodyRows.forEach(row => {
            const newCell = document.createElement('td');
            newCell.contentEditable = true;
            newCell.textContent = '';
            row.insertBefore(newCell, row.querySelector('.table-add-column'));
        });
        
        // Update add row button colspan
        const addRowBtn = table.querySelector('.add-row-btn');
        if (addRowBtn) {
            addRowBtn.parentElement.colSpan = columnCount + 2;
        }
        
        console.log('Added new table column');
    }

    addTableRow(button) {
        const table = button.closest('.sprintspace-table');
        const tbody = table.querySelector('tbody');
        const addRowElement = table.querySelector('.table-add-row');
        const columnCount = table.querySelectorAll('thead th:not(.table-add-column)').length;
        
        // Create new row
        const newRow = document.createElement('tr');
        for (let i = 0; i < columnCount; i++) {
            const cell = document.createElement('td');
            cell.contentEditable = true;
            cell.textContent = '';
            newRow.appendChild(cell);
        }
        
        // Add empty column cell
        const emptyCell = document.createElement('td');
        emptyCell.className = 'table-add-column';
        emptyCell.contentEditable = false;
        newRow.appendChild(emptyCell);
        
        // Insert before add row button
        tbody.insertBefore(newRow, addRowElement);
        
        console.log('Added new table row');
    }

    navigateTableCell(direction, currentCell) {
        const table = currentCell.closest('.sprintspace-table');
        const cells = Array.from(table.querySelectorAll('td[contenteditable="true"], th[contenteditable="true"]'));
        const currentIndex = cells.indexOf(currentCell);
        
        let targetIndex;
        if (direction === 'next') {
            targetIndex = currentIndex + 1;
            if (targetIndex >= cells.length) targetIndex = 0;
        } else {
            targetIndex = currentIndex - 1;
            if (targetIndex < 0) targetIndex = cells.length - 1;
        }
        
        if (cells[targetIndex]) {
            cells[targetIndex].focus();
        }
    }

    // ==================== BLOCK MENU MANAGEMENT ====================

    initializeBlockMenuManagement() {
        // Use event delegation to manage block menu visibility
        const editor = document.getElementById('sprintspace-editor');
        if (!editor) return;
        
        // Add event listeners for content changes
        editor.addEventListener('input', this.updateBlockMenuVisibility.bind(this));
        editor.addEventListener('focus', this.updateBlockMenuVisibility.bind(this), true);
        editor.addEventListener('blur', this.updateBlockMenuVisibility.bind(this), true);
        
        // Initial update
        setTimeout(() => this.updateBlockMenuVisibility(), 100);
        
        console.log('Initialized block menu management');
    }

    updateBlockMenuVisibility() {
        const blocks = document.querySelectorAll('.sprintspace-block');
        
        blocks.forEach(block => {
            const editableElement = block.querySelector('[contenteditable="true"]');
            if (!editableElement) return;
            
            const isEmpty = !editableElement.textContent.trim() || 
                           editableElement.textContent.trim() === 'Type \'/\' for commands or start writing...' ||
                           editableElement.textContent.trim() === 'Your heading here' ||
                           editableElement.textContent.trim() === 'Heading 1' ||
                           editableElement.textContent.trim() === 'Heading 2' ||
                           editableElement.textContent.trim() === 'Heading 3' ||
                           editableElement.textContent.trim() === 'Heading';
            
            if (isEmpty) {
                block.classList.add('empty-block');
            } else {
                block.classList.remove('empty-block');
            }
        });
    }

    // ==================== BLOCK MENU FUNCTIONALITY ====================

    showBlockMenu(event, block) {
        event.preventDefault();
        event.stopPropagation();
        
        // Hide any existing menu
        this.hideBlockMenu();
        
        // Create menu
        const menu = document.createElement('div');
        menu.className = 'block-context-menu';
        menu.innerHTML = `
            <div class="menu-item" onclick="event.stopPropagation(); window.sprintSpaceApp.duplicateBlock('${block.dataset.blockType}', this)">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-item danger" onclick="event.stopPropagation(); window.sprintSpaceApp.deleteBlock(this)">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
        `;
        
        // Position menu
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '10001';
        
        // Store reference to the block
        menu.dataset.targetBlock = block.dataset.blockType;
        this.currentMenuBlock = block;
        
        // Add to page
        document.body.appendChild(menu);
        
        // Hide menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.hideBlockMenu.bind(this), { once: true });
        }, 10);
        
        console.log('Showed block menu for:', block.dataset.blockType);
    }

    hideBlockMenu() {
        const existingMenu = document.querySelector('.block-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        this.currentMenuBlock = null;
    }

    deleteBlock(menuItem) {
        if (!this.currentMenuBlock) {
            console.error('No block selected for deletion');
            return;
        }
        
        const block = this.currentMenuBlock;
        
        // Remove the block from DOM
        block.remove();
        console.log('Deleted block:', block.dataset.blockType);
        
        // Hide menu
        this.hideBlockMenu();
        
        // Update block menu visibility
        setTimeout(() => {
            this.updateBlockMenuVisibility();
        }, 50);
        
        // Trigger auto-save
        setTimeout(() => {
            this.autoSavePage();
        }, 100);
    }

    duplicateBlock(blockType, menuItem) {
        if (!this.currentMenuBlock) {
            console.error('No block selected for duplication');
            return;
        }
        
        const originalBlock = this.currentMenuBlock;
        const clonedBlock = originalBlock.cloneNode(true);
        
        // Insert after original block
        originalBlock.insertAdjacentElement('afterend', clonedBlock);
        console.log('Duplicated block:', blockType);
        
        // Hide menu
        this.hideBlockMenu();
        
        // Update block menu visibility
        setTimeout(() => {
            this.updateBlockMenuVisibility();
        }, 50);
        
        // Trigger auto-save
        setTimeout(() => {
            this.autoSavePage();
        }, 100);
    }

    autoSavePage() {
        if (!this.currentPage) {
            console.log('No current page to auto-save');
            return;
        }
        
        console.log('Auto-saving page...');
        const editor = document.getElementById('sprintspace-editor');
        if (editor) {
            // Save the current editor content
            this.savePage();
        }
    }

    // ==================== CHECKLIST FEATURES ====================

    initializeChecklistFeatures() {
        const editor = document.getElementById('sprintspace-editor');
        if (!editor) return;
        editor.removeEventListener('keydown', this.checklistKeydownHandler);
        this.checklistKeydownHandler = (e) => {
            if (e.key === 'Enter' && e.target.matches('.checklist-list .cl-text[contenteditable="true"]')) {
                this.handleChecklistKeydown(e, e.target);
            }
            if (e.key === 'Backspace' && e.target.matches('.checklist-list .cl-text[contenteditable="true"]')) {
                const wrapper = e.target.closest('.checklist-item');
                if (wrapper && e.target.textContent.trim() === '') {
                    // Remove empty item on backspace to behave like Notion
                    e.preventDefault();
                    const list = wrapper.parentElement;
                    const prev = wrapper.previousElementSibling?.querySelector('.cl-text[contenteditable="true"]');
                    wrapper.remove();
                    if (prev) prev.focus();
                }
            }
        };
        editor.addEventListener('keydown', this.checklistKeydownHandler);
        console.log('Initialized checklist features with event delegation');
    }

    handleChecklistKeydown(event, element) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const checklist = element.closest('.checklist-list');
            const currentBlock = element.closest('.sprintspace-block');
            const isEmpty = element.textContent.trim() === '' || element.textContent.trim() === 'To-do';
            // Track consecutive Enters
            this._checklistEnterCount = (this._checklistEnterCount || 0) + 1;
            clearTimeout(this._checklistEnterResetTimer);
            this._checklistEnterResetTimer = setTimeout(() => { this._checklistEnterCount = 0; }, 600);
            // Double-Enter on empty exits checklist
            if (isEmpty && this._checklistEnterCount >= 2) {
                const editor = document.getElementById('sprintspace-editor');
                const para = document.createElement('p');
                para.setAttribute('contenteditable', 'true');
                para.innerHTML = '<br>';
                currentBlock.insertAdjacentElement('afterend', para);
                setTimeout(() => para.focus(), 10);
                this._checklistEnterCount = 0;
                return;
            }
            // Default: always add a new checklist item
            this.addChecklistItem(checklist);
            this._checklistEnterCount = 0;
        }
    }

    addChecklistItem(checklist) {
        const newItemHtml = '<li class="checklist-item">' +
            '<input type="checkbox" onchange="this.closest(\'li\').classList.toggle(\'completed\', this.checked)">' + 
            '<div class="cl-text" contenteditable="true">To-do</div>' +
        '</li>';
        checklist.insertAdjacentHTML('beforeend', newItemHtml);
        setTimeout(() => {
            const newItem = checklist.lastElementChild.querySelector('.cl-text[contenteditable="true"]');
            if (newItem) {
                newItem.focus();
                const range = document.createRange();
                range.selectNodeContents(newItem);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }, 0);
    }

    addNewBlockAfter(currentBlock, blockType) {
        const editor = document.getElementById('sprintspace-editor');
        
        let newBlockHtml = '';
        switch (blockType) {
            case 'paragraph':
            default:
                newBlockHtml = `<div class="sprintspace-block" data-block-type="paragraph">
                    <div class="block-menu-wrapper">
                        <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                    </div>
                    <p contenteditable="true">Type something...</p>
                </div>`;
                break;
        }
        
        // Insert after current block
        currentBlock.insertAdjacentHTML('afterend', newBlockHtml);
        
        // Focus on the new block
        setTimeout(() => {
            const newBlock = currentBlock.nextElementSibling;
            const editableElement = newBlock.querySelector('[contenteditable="true"]');
            editableElement.focus();
        }, 10);
        
        // Ensure editable space after the new block
        this.ensureEditableSpaceAfterBlock(editor, blockType);
    }

    // ==================== TOGGLE FEATURES ====================

    initializeToggleFeatures() {
        const toggle = document.querySelector('.toggle-list:last-of-type');
        if (!toggle) return;
        
        console.log('Initializing toggle features');
        
        // No numbering needed for Notion-style toggles
    }

    toggleCollapseExpand(header) {
        const toggleContent = header.nextElementSibling;
        const toggleIcon = header.querySelector('.toggle-icon');
        
        // Check if currently expanded
        const isExpanded = toggleContent.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            toggleContent.classList.remove('expanded');
            header.classList.remove('expanded');
            toggleIcon.textContent = '▶';
        } else {
            // Expand
            toggleContent.classList.add('expanded');
            header.classList.add('expanded');
            toggleIcon.textContent = '▼';
        }
        
        console.log('Toggled collapse/expand, expanded:', !isExpanded);
    }

    handleToggleTitleKeydown(event, element) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const currentToggleBlock = element.closest('.sprintspace-block');
            this.addNewToggleAfter(currentToggleBlock);
            // Reset consecutive Enter counter when we create a new block
            this._toggleEnterCount = 0;
        }
    }

    handleToggleItemKeydown(event, element) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const toggleList = element.closest('.toggle-list');
            const currentToggleBlock = element.closest('.sprintspace-block');
            const isEmpty = element.textContent.trim() === '' || element.textContent.trim() === 'Empty toggle. Click to add content.';
            
            // Track consecutive Enters to allow escape
            this._toggleEnterCount = (this._toggleEnterCount || 0) + 1;
            clearTimeout(this._toggleEnterResetTimer);
            this._toggleEnterResetTimer = setTimeout(() => { this._toggleEnterCount = 0; }, 600);
            
            if (this._toggleEnterCount >= 3) {
                // Triple-Enter: exit toggle context → add a normal paragraph after block and focus it
                const editor = document.getElementById('sprintspace-editor');
                const newPara = document.createElement('p');
                newPara.setAttribute('contenteditable', 'true');
                newPara.innerHTML = '<br>';
                currentToggleBlock.insertAdjacentElement('afterend', newPara);
                setTimeout(() => newPara.focus(), 10);
                this._toggleEnterCount = 0;
                return;
            }
            
            if (isEmpty) {
                this.addNewToggleAfter(currentToggleBlock);
            } else {
                this.addToggleItem(toggleList);
            }
        }
    }

    addNewToggleAfter(currentToggleBlock) {
        const editor = document.getElementById('sprintspace-editor');
        
        const newToggleHtml = `<div class="sprintspace-block" data-block-type="toggle">
            <div class="block-menu-wrapper">
                <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
            </div>
            <div class="toggle-list" contenteditable="false">
                <div class="toggle-header" onclick="window.sprintSpaceApp.toggleCollapseExpand(this)" contenteditable="false">
                    <span class="toggle-icon">▶</span>
                    <span contenteditable="true" class="toggle-title" onkeydown="window.sprintSpaceApp.handleToggleTitleKeydown(event, this)">Toggle</span>
                </div>
                <div class="toggle-content">
                    <div class="toggle-item">
                        <div contenteditable="true" onkeydown="window.sprintSpaceApp.handleToggleItemKeydown(event, this)">Empty toggle. Click to add content.</div>
                    </div>
                </div>
            </div>
        </div>`;
        
        // Insert after current toggle block
        currentToggleBlock.insertAdjacentHTML('afterend', newToggleHtml);
        
        // Focus on the new toggle title
        setTimeout(() => {
            const newToggle = currentToggleBlock.nextElementSibling;
            const titleElement = newToggle.querySelector('.toggle-title');
            titleElement.focus();
            
            // Select all text for easy editing
            const range = document.createRange();
            range.selectNodeContents(titleElement);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }, 10);
        
        // Ensure editable space after the new toggle
        this.ensureEditableSpaceAfterBlock(editor, 'toggle');
    }

    addToggleItem(toggleList) {
        const toggleContent = toggleList.querySelector('.toggle-content');
        
        const newItemHtml = `<div class="toggle-item">
            <div contenteditable="true" onkeydown="window.sprintSpaceApp.handleToggleItemKeydown(event, this)">Type your content here...</div>
        </div>`;
        
        toggleContent.insertAdjacentHTML('beforeend', newItemHtml);
        
        // Expand the toggle if it's not already expanded
        if (!toggleContent.classList.contains('expanded')) {
            const toggleHeader = toggleList.querySelector('.toggle-header');
            this.toggleCollapseExpand(toggleHeader);
        }
        
        // Focus on the new item
        setTimeout(() => {
            const newItem = toggleContent.lastElementChild.querySelector('div[contenteditable="true"]');
            newItem.focus();
        }, 10);
    }

    getNextToggleCounter() {
        const toggleLists = document.querySelectorAll('.toggle-list[data-toggle-counter]');
        let maxCounter = 0;
        
        toggleLists.forEach(toggle => {
            const counter = parseInt(toggle.getAttribute('data-toggle-counter'));
            if (counter > maxCounter) {
                maxCounter = counter;
            }
        });
        
        return maxCounter + 1;
    }

    updateToggleNumbering() {
        const toggleLists = document.querySelectorAll('.toggle-list[data-toggle-counter]');
        
        toggleLists.forEach((toggle, index) => {
            const number = index + 1;
            toggle.setAttribute('data-toggle-counter', number);
            
            const numberElement = toggle.querySelector('.toggle-number');
            if (numberElement) {
                numberElement.textContent = `${number}.`;
            }
            
            const titleElement = toggle.querySelector('.toggle-title');
            if (titleElement && titleElement.textContent.startsWith('Toggle ')) {
                titleElement.textContent = `Toggle ${number}`;
            }
        });
    }
}

// Export for global access
window.SprintSpaceWorkspaceApp = SprintSpaceWorkspaceApp;