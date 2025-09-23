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
        this.mentionState = {
            isShowingMentions: false,
            selectedMentionIndex: 0,
            mentionQuery: '',
            mentionPosition: null,
            mentionUsers: []
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
        this.initializeListFeatures(); // Initialize UL/OL behavior globally
        this.initializeBlockMenuManagement(); // Initialize block menu visibility management
        this.initializeMentionFeatures(); // Initialize @ mention functionality
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
                <div class="item-actions" style="margin-left: auto; opacity: 0; transition: opacity 0.15s; display:flex; gap:4px;">
                    ${workspace.owner_user === (frappe.session?.user || '') ? `<button class="item-action-btn" onclick="event.stopPropagation(); window.SprintSpaceUI.showWorkspaceSettings('${workspace.name}')" title="Settings" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; border-radius: 4px; font-size: 12px;">⚙️</button>` : ''}
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
            // Collect optional settings if the modal has visibility controls
            const visEl = document.getElementById('vs-visibility');
            const companyEl = document.getElementById('vs-company');
            const collabRows = document.getElementById('vs-collab-rows');
            const visibility = visEl ? visEl.value : 'Private';
            const company = companyEl ? companyEl.value : null;
            const collaborators = collabRows ? Array.from(collabRows.querySelectorAll('tr')).map(tr=>({
                user: tr.querySelector('.collab-user')?.value || '',
                access: tr.querySelector('.collab-access')?.value || 'Viewer'
            })).filter(c=>c.user) : [];
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_workspace.sprintspace_workspace.create_workspace',
                args: { title, description, visibility, company, collaborators: JSON.stringify(collaborators) }
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
                <span class="page-item-title">${page.title}
                    ${page.visibility ? `<span style="margin-left:8px; font-size:11px; color:#6b7280; background:#f3f4f6; border:1px solid #e5e7eb; padding:2px 6px; border-radius:10px;">${page.visibility}</span>` : ''}
                </span>
                <div class="item-actions" style="margin-left: auto; opacity: 0; transition: opacity 0.15s; display:flex; gap:4px;">
                    <button class="item-action-btn" onclick="event.stopPropagation(); window.SprintSpaceUI.showPageSettings('${page.name}')" title="Settings" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; border-radius: 4px; font-size: 12px;">⚙️</button>
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
            // Dispatch event so header logic can show/hide settings
            try {
                const evt = new CustomEvent('sprintspace:page-loaded', { detail: pageData });
                document.dispatchEvent(evt);
            } catch (e) {}
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
            // Collect optional settings from modal if present
            const visEl = document.getElementById('vs-visibility');
            const companyEl = document.getElementById('vs-company');
            const collabRows = document.getElementById('vs-collab-rows');
            const visibility = visEl ? visEl.value : 'Use Workspace';
            const company = companyEl ? companyEl.value : null;
            const collaborators = collabRows ? Array.from(collabRows.querySelectorAll('tr')).map(tr=>({
                user: tr.querySelector('.collab-user')?.value || '',
                access: tr.querySelector('.collab-access')?.value || 'Viewer'
            })).filter(c=>c.user) : [];
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.create_page',
                args: { 
                    workspace: this.currentWorkspace, 
                    title: title,
                    visibility: visibility,
                    company: company,
                    collaborators: JSON.stringify(collaborators)
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
                        // Prefer raw HTML block if present
                        const raw = contentData.blocks.find(b => b.type === 'raw' && b.data && b.data.html);
                        if (raw) {
                            initialContent = raw.data.html;
                        } else {
                            console.log('Converting', contentData.blocks.length, 'blocks to HTML');
                            initialContent = this.convertBlocksToHTML(contentData.blocks);
                            console.log('Converted blocks to HTML:', initialContent);
                            console.log('HTML length:', initialContent.length);
                        }
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
            
            // Restore calendar and gallery data from data attributes
            this.restoreBlockData(editorElement);
            
            // Fix private file URLs in existing content
            this.fixPrivateFileUrls(editorElement);
            
            // Convert existing list items to new structure with individual menus
            setTimeout(() => {
                console.log('=== CONVERTING EXISTING LIST ITEMS ===');
                this.convertExistingListItems(editorElement);
                // Force a re-render to ensure CSS is applied
                this.forceListMenuVisibility();
                // Run conversion again to catch any missed items
                setTimeout(() => {
                    console.log('=== SECOND CONVERSION ATTEMPT ===');
                    this.convertExistingListItems(editorElement);
                    this.forceListMenuVisibility();
                    // Run conversion a third time
                    setTimeout(() => {
                        console.log('=== THIRD CONVERSION ATTEMPT ===');
                        this.convertExistingListItems(editorElement);
                        this.forceListMenuVisibility();
                    }, 300);
                }, 200);
            }, 100);
            
            // Clear any existing event listeners and re-initialize
            this.cleanupEditor();
            
        // Initialize the editor functionality with a small delay
        setTimeout(() => {
            this.setupPageEditor();
            
            // Force list menu visibility after editor setup
            setTimeout(() => {
                this.forceListMenuVisibility();
                this.forceChecklistMenuVisibility();
                // Run multiple times to ensure all menus are visible
                setTimeout(() => {
                    this.forceChecklistMenuVisibility();
                }, 300);
                setTimeout(() => {
                    this.forceChecklistMenuVisibility();
                }, 600);
                setTimeout(() => {
                    this.forceChecklistMenuVisibility();
                }, 1000);
            }, 200);
            
            // Focus the editor to make it ready for input
            setTimeout(() => {
                editorElement.focus();
                console.log('Editor focused and ready for input');
            }, 100);
        }, 50);
        
        // Also run on page load to ensure menus are visible
        setTimeout(() => {
            this.forceChecklistMenuVisibility();
        }, 1500);
        
        // Run one more time after a longer delay
        setTimeout(() => {
            this.forceChecklistMenuVisibility();
            this.makeAllChecklistMenusVisible();
            this.ensureAllListItemsHaveMenus();
        }, 2000);
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
            // Remove existing event listeners by cloning the element to avoid duplicate handlers
            const newMenu = commandMenu.cloneNode(true);
            commandMenu.parentNode.replaceChild(newMenu, commandMenu);
            newMenu.style.display = 'none';
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
        
        // Ensure list/checklist handlers are bound for the active editor
        try { this.initializeListFeatures(); } catch (e) { console.warn('initializeListFeatures failed', e); }
        try { this.initializeChecklistFeatures(); } catch (e) { console.warn('initializeChecklistFeatures failed', e); }
        try { this.initializeMentionFeatures(); } catch (e) { console.warn('initializeMentionFeatures failed', e); }

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
            ,
            {
                title: 'Image',
                subtitle: 'Upload or embed an image.',
                icon: '🖼️',
                keywords: ['image', 'picture', 'photo'],
                action: () => this.insertBlock(editor, 'image', '')
            },
            {
                title: 'Video',
                subtitle: 'Upload or embed a video.',
                icon: '🎬',
                keywords: ['video', 'youtube', 'mp4', 'media'],
                action: () => this.insertBlock(editor, 'video', '')
            },
            {
                title: 'File',
                subtitle: 'Attach a file for download.',
                icon: '📎',
                keywords: ['file', 'attachment', 'document'],
                action: () => this.insertBlock(editor, 'file', '')
            },
            {
                title: 'Bookmark',
                subtitle: 'Create a rich link preview.',
                icon: '🔖',
                keywords: ['bookmark', 'link', 'url', 'preview'],
                action: () => this.insertBlock(editor, 'bookmark', '')
            },
            {
                title: 'Timeline',
                subtitle: 'Visual task timeline with dates and assignees.',
                icon: '📆',
                keywords: ['timeline', 'gantt', 'calendar', 'plan', 'schedule'],
                action: () => this.insertBlock(editor, 'timeline', '')
            },
            {
                title: 'Gallery',
                subtitle: 'Card-based view with modal pages and nested content.',
                icon: '🖼️',
                keywords: ['gallery', 'cards', 'modal', 'nested', 'pages'],
                action: () => this.insertBlock(editor, 'gallery', '')
            },
            {
                title: 'Calendar',
                subtitle: 'Monthly calendar view with date-based pages.',
                icon: '📅',
                keywords: ['calendar', 'monthly', 'dates', 'schedule', 'events'],
                action: () => this.insertBlock(editor, 'calendar', '')
            }
        ];

        this.setupSlashCommands(editor, commandMenu, commands);
        this.editor = editor;
    }

    setupSlashCommands(editor, commandMenu, commands) {
        // Use property-based handlers to avoid stacking duplicate listeners across re-inits
        editor.oninput = (e) => {
            setTimeout(() => {
                this.checkForSlashCommand(editor, commandMenu, commands);
            }, 10);
        };

        editor.onkeydown = (e) => {
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
                    const cmd = this.workspaceEditorState.currentCommands[this.workspaceEditorState.selectedCommandIndex];
                    if (cmd && typeof cmd.action === 'function') {
                        cmd.action();
                        this.hideCommandMenu(commandMenu);
                        this.workspaceEditorState.isShowingCommands = false;
                    }
                } else if (e.key === 'Backspace') {
                    setTimeout(() => {
                        this.checkForSlashCommand(editor, commandMenu, commands);
                    }, 10);
                }
            }
        };

        // Ensure only one click handler is attached to the command menu
        commandMenu.onclick = (e) => {
            const commandItem = e.target.closest('.command-item');
            if (commandItem) {
                const index = parseInt(commandItem.dataset.index);
                const cmd = this.workspaceEditorState.currentCommands[index];
                if (cmd && typeof cmd.action === 'function') {
                    cmd.action();
                    this.hideCommandMenu(commandMenu);
                    this.workspaceEditorState.isShowingCommands = false;
                }
            }
        };

        editor.onblur = () => {
            setTimeout(() => {
                if (this.workspaceEditorState.isShowingCommands && !commandMenu.contains(document.activeElement)) {
                    this.hideCommandMenu(commandMenu);
                    this.workspaceEditorState.isShowingCommands = false;
                }
            }, 200);
        };

        // Manage document-level click handler to avoid accumulating listeners
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
        }
        this._docClickHandler = (e) => {
            if (this.workspaceEditorState.isShowingCommands &&
                !editor.contains(e.target) &&
                !commandMenu.contains(e.target)) {
                this.hideCommandMenu(commandMenu);
                this.workspaceEditorState.isShowingCommands = false;
            }
        };
        document.addEventListener('click', this._docClickHandler);
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
        
        // Re-entrancy guard: prevent duplicate inserts from stacked handlers
        if (this._isInsertingBlock) {
            console.warn('Duplicate insert prevented');
            return;
        }
        this._isInsertingBlock = true;
        
        // Ensure we're working with a valid editor
        if (!editor || (!editor.classList.contains('sprintspace-editor') && !editor.classList.contains('gallery-page-editor') && !editor.classList.contains('calendar-page-editor') && !editor.classList.contains('timeline-page-editor'))) {
            console.error('Invalid editor element');
            this._isInsertingBlock = false;
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
                // Empty paragraph; placeholder shown via CSS
                html = '<div class="sprintspace-block" data-block-type="paragraph"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><p contenteditable="true"></p></div>';
                break;
            case 'heading':
                // Empty heading; placeholder shown via CSS per level
                html = `<div class="sprintspace-block" data-block-type="heading" data-level="${level}"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><h${level} contenteditable="true"></h${level}></div>`;
                break;
            case 'list':
                // Empty list item; placeholder shown via CSS
                html = '<div class="sprintspace-block" data-block-type="list"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><ul class="bullet-list"><li class="bullet-item" contenteditable="true" data-item-id="' + Date.now() + '"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><div class="item-content"></div></li></ul></div>';
                break;
            case 'numbered':
                // Empty numbered list item; placeholder shown via CSS
                html = '<div class="sprintspace-block" data-block-type="numbered"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><ol class="numbered-list"><li class="numbered-item" contenteditable="true" data-item-number="1"><div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div><div class="item-content"></div></li></ol></div>';
                break;
            case 'checklist':
                html = '<div class="sprintspace-block" data-block-type="checklist">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<ul class="checklist-list" contenteditable="false">' +
                        '<li class="checklist-item">' +
                            '<div class="block-menu-wrapper">' +
                                '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                            '</div>' +
                            '<input type="checkbox" onchange="this.closest(\'li\').classList.toggle(\'completed\', this.checked)">' +
                            '<div class="cl-text" contenteditable="true" data-placeholder="Add a to-do item"></div>' +
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
            case 'image':
                html = '<div class="sprintspace-block" data-block-type="image">' +
                    '<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div>' +
                    '<div class="media image-block" contenteditable="false">' +
                        '<div class="media-toolbar">' +
                            '<button class="btn btn-sm media-upload">Upload</button>' +
                            '<button class="btn btn-sm media-url">From URL</button>' +
                        '</div>' +
                        '<div class="media-preview media-empty">Click Upload or From URL</div>' +
                        '<input class="media-caption" placeholder="Add caption..." />' +
                    '</div>' +
                '</div>';
                break;
            case 'video':
                html = '<div class="sprintspace-block" data-block-type="video">' +
                    '<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div>' +
                    '<div class="media video-block" contenteditable="false">' +
                        '<div class="media-toolbar">' +
                            '<button class="btn btn-sm media-upload">Upload</button>' +
                            '<button class="btn btn-sm media-url">Embed link</button>' +
                        '</div>' +
                        '<div class="media-preview media-empty">Click Upload or Embed link</div>' +
                        '<input class="media-caption" placeholder="Add caption..." />' +
                    '</div>' +
                '</div>';
                break;
            case 'file':
                html = '<div class="sprintspace-block" data-block-type="file">' +
                    '<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div>' +
                    '<div class="media file-block" contenteditable="false">' +
                        '<div class="media-toolbar">' +
                            '<button class="btn btn-sm media-upload">Upload</button>' +
                            '<button class="btn btn-sm media-url">From URL</button>' +
                        '</div>' +
                        '<div class="media-preview media-empty">No file yet</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'bookmark':
                html = '<div class="sprintspace-block" data-block-type="bookmark">' +
                    '<div class="block-menu-wrapper"><button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button></div>' +
                    '<div class="media bookmark-block" contenteditable="false">' +
                        '<div class="media-toolbar">' +
                            '<button class="btn btn-sm media-url">Add URL</button>' +
                        '</div>' +
                        '<div class="media-preview media-empty">Paste a link to create a preview</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'timeline':
                html =                 '<div class="sprintspace-block" data-block-type="timeline">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<div class="timeline-block" contenteditable="false" data-range-days="14">' +
                        '<div class="timeline-toolbar">' +
                            '<div class="tl-toolbar-left">' +
                                '<button class="btn btn-sm add-timeline-page">+ Add page</button>' +
                            '</div>' +
                            '<div class="tl-toolbar-right">' +
                                '<select class="timeline-range">' +
                                    '<option value="7">7 days</option>' +
                                    '<option value="14" selected>14 days</option>' +
                                    '<option value="30">30 days</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                        '<div class="timeline-wrap">' +
                            '<div class="tl-left">' +
                                '<div class="tl-list-header">Task name</div>' +
                                '<div class="tl-list"></div>' +
                            '</div>' +
                            '<div class="tl-right">' +
                                '<div class="timeline-header"></div>' +
                                '<div class="timeline-rows"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'gallery':
                html = '<div class="sprintspace-block" data-block-type="gallery">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<div class="gallery-block" contenteditable="false">' +
                        '<div class="gallery-toolbar">' +
                            '<div class="gallery-toolbar-left">' +
                                '<button class="btn btn-sm add-gallery-page">+ Add page</button>' +
                            '</div>' +
                            '<div class="gallery-toolbar-right">' +
                                '<select class="gallery-view-mode">' +
                                    '<option value="grid" selected>Grid view</option>' +
                                    '<option value="list">List view</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                        '<div class="gallery-content">' +
                            '<div class="gallery-grid">' +
                                '<div class="gallery-empty">No pages yet. Click "Add page" to create your first page.</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
                break;
            case 'calendar':
                html = '<div class="sprintspace-block" data-block-type="calendar">' +
                    '<div class="block-menu-wrapper">' +
                        '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
                    '</div>' +
                    '<div class="calendar-block" contenteditable="false">' +
                        '<div class="calendar-toolbar">' +
                            '<div class="calendar-toolbar-left">' +
                                '<button class="btn btn-sm calendar-today">Today</button>' +
                                '<button class="btn btn-sm calendar-prev">‹</button>' +
                                '<button class="btn btn-sm calendar-next">›</button>' +
                            '</div>' +
                            '<div class="calendar-toolbar-center">' +
                                '<span class="calendar-month-year">September 2024</span>' +
                            '</div>' +
                            '<div class="calendar-toolbar-right">' +
                                '<button class="btn btn-sm add-calendar-page">+ Add page</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="calendar-content">' +
                            '<div class="calendar-grid">' +
                                '<div class="calendar-header">' +
                                    '<div class="calendar-day-header">Sun</div>' +
                                    '<div class="calendar-day-header">Mon</div>' +
                                    '<div class="calendar-day-header">Tue</div>' +
                                    '<div class="calendar-day-header">Wed</div>' +
                                    '<div class="calendar-day-header">Thu</div>' +
                                    '<div class="calendar-day-header">Fri</div>' +
                                    '<div class="calendar-day-header">Sat</div>' +
                                '</div>' +
                                '<div class="calendar-days"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
                break;
        }

        console.log('Generated HTML:', html);

        if (html) {
            try {
                console.log('Editor content before insertion:', editor.innerHTML);
                
                // Determine if we're inserting inside a toggle's content
                let commonContainer = range.commonAncestorContainer;
                if (commonContainer && commonContainer.nodeType === Node.TEXT_NODE) {
                    commonContainer = commonContainer.parentElement;
                }
                const toggleContent = commonContainer ? commonContainer.closest('.toggle-content') : null;

                // Create a temporary element to obtain the new block node
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                const newElement = tempDiv.firstElementChild;

                if (toggleContent) {
                    // Inserting inside a toggle: place the block within the toggle-content
                    let anchor = commonContainer ? (commonContainer.closest('.sprintspace-block') || commonContainer.closest('.toggle-item')) : null;
                    if (anchor && anchor.parentNode === toggleContent) {
                        anchor.parentNode.insertBefore(newElement, anchor.nextSibling);
                    } else {
                        toggleContent.appendChild(newElement);
                    }

                    // If there is an empty placeholder toggle-item, remove it
                    const currentItemEditable = commonContainer ? commonContainer.closest('.toggle-item') : null;
                    if (currentItemEditable) {
                        const textEl = currentItemEditable.querySelector('[contenteditable="true"]');
                        if (!textEl || (textEl.textContent || '').trim() === '' || (textEl.innerHTML || '').trim() === '' || (textEl.innerHTML || '').trim() === '<br>') {
                            currentItemEditable.remove();
                        }
                    }

                    // Reposition caret after the inserted element
                    try {
                        const afterRange = document.createRange();
                        afterRange.setStartAfter(newElement);
                        afterRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(afterRange);
                    } catch (err) {}

                    // Initialize features and ensure space inside this container
                    try { this.initializeBlockFeatures(type); } catch(e) {}
                    this.ensureEditableSpaceAfterInContainer(toggleContent, type);
                } else {
                    // Normal top-level insertion
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
                        if (newElement) {
                            // Find the closest sprintspace-block to avoid nesting blocks inside paragraphs
                            let container = updatedRange.commonAncestorContainer;
                            if (container.nodeType === Node.TEXT_NODE) {
                                container = container.parentElement;
                            }
                            const currentBlock = container ? container.closest('.sprintspace-block') : null;

                            if (currentBlock && currentBlock.parentNode) {
                                currentBlock.parentNode.insertBefore(newElement, currentBlock.nextSibling);
                                console.log('Inserted new element after current block to avoid nesting:', newElement);
                                
                                // If the current block is an empty paragraph after slash removal, remove it
                                if (currentBlock.getAttribute && currentBlock.getAttribute('data-block-type') === 'paragraph') {
                                    const p = currentBlock.querySelector('p[contenteditable="true"]');
                                    const isEmpty = p && (p.textContent.trim() === '' || p.innerHTML.trim() === '' || p.innerHTML.trim() === '<br>');
                                    if (isEmpty) {
                                        currentBlock.remove();
                                    }
                                }
                            } else {
                                // Fallback to direct insertion at range
                                updatedRange.insertNode(newElement);
                                console.log('Inserted new element at selection (fallback):', newElement);
                            }

                            // Force a reflow to ensure the element is rendered
                            newElement.offsetHeight; // Trigger reflow

                            // Move cursor to after the inserted content safely
                            try {
                                const afterRange = document.createRange();
                                afterRange.setStartAfter(newElement);
                                afterRange.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(afterRange);
                                console.log('Positioned cursor after inserted element');
                            } catch (error) {
                                console.error('Error positioning cursor:', error);
                                const fallbackRange = document.createRange();
                                fallbackRange.selectNodeContents(editor);
                                fallbackRange.collapse(false);
                                selection.removeAllRanges();
                                selection.addRange(fallbackRange);
                            }

                            // Initialize the just-inserted block features immediately
                            try { this.initializeBlockFeatures(type); } catch(e) {}
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
                    
                    // If it's a checklist, ensure all items have menus
                    if (type === 'checklist') {
                        this.ensureChecklistMenus(newElement);
                    }
                    
                    // If it's a list, convert list items immediately
                    if (type === 'list' || type === 'numbered') {
                        console.log('Converting list items immediately after creation');
                        this.convertExistingListItems(editor);
                        this.forceListMenuVisibility();
                        
                        // Also run conversion again after a short delay to ensure it works
                        setTimeout(() => {
                            console.log('Running delayed list conversion');
                            this.convertExistingListItems(editor);
                            this.forceListMenuVisibility();
                        }, 200);
                    }
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
                        
                        // Place caret at the start for headings/lists so placeholder stays visible
                        if (type === 'heading' || type === 'list' || type === 'numbered') {
                            if (newElement.firstChild && newElement.firstChild.nodeType === Node.TEXT_NODE) {
                                newRange.setStart(newElement.firstChild, 0);
                                newRange.setEnd(newElement.firstChild, 0);
                            } else {
                                newRange.setStart(newElement, 0);
                                newRange.collapse(true);
                            }
                        } else {
                            // Default: select contents to let user overwrite quickly
                            if (newElement.firstChild && newElement.firstChild.nodeType === Node.TEXT_NODE) {
                                newRange.setStart(newElement.firstChild, 0);
                                newRange.setEnd(newElement.firstChild, newElement.firstChild.textContent.length);
                            } else {
                                newRange.selectNodeContents(newElement);
                            }
                        }
                        
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        editor.focus();
                        console.log('Positioned cursor in the new element');
                    } else {
                        console.log('New element still not found, positioning cursor after insertion');
                        const range = document.createRange();
                        range.selectNodeContents(editor);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        editor.focus();
                    }
                }, 50);
                
                // ALWAYS ensure there's an editable paragraph after the inserted block
                // but do NOT steal focus from the newly inserted element
                setTimeout(() => {
                    const activeEl = document.activeElement;
                    // If inserted within a toggle, ensure space inside that container; else top-level
                    const latestCommon = window.getSelection() && window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0).commonAncestorContainer : null;
                    let latestEl = latestCommon && latestCommon.nodeType === Node.ELEMENT_NODE ? latestCommon : (latestCommon ? latestCommon.parentElement : null);
                    const latestToggleContent = latestEl ? latestEl.closest('.toggle-content') : null;
                    if (latestToggleContent) {
                        this.ensureEditableSpaceAfterInContainer(latestToggleContent, type);
                    } else {
                        this.ensureEditableSpaceAfterBlock(editor, type);
                    }
                    if (activeEl && typeof activeEl.focus === 'function') {
                        activeEl.focus();
                    }
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
        // Clear insertion lock with a small delay to prevent race conditions
        setTimeout(() => {
        this._isInsertingBlock = false;
        }, 100);
    }

    ensureEditableSpaceAfterBlock(editor, blockType) {
        // Delegate to generic container-based function using the editor as container
        this.ensureEditableSpaceAfterInContainer(editor, blockType);
    }

    // Generic helper that works for the main editor and for containers like .toggle-content
    ensureEditableSpaceAfterInContainer(container, blockType) {
        console.log('Ensuring editable space after block type:', blockType);
        
        // Check if the last element in the container is editable
        const lastChild = container.lastElementChild;
        
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
            
            container.appendChild(newParagraph);
            
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
        } else if (blockType === 'timeline') {
            this.initializeTimelineFeatures();
        } else if (blockType === 'gallery') {
            this.initializeGalleryFeatures();
        } else if (blockType === 'calendar') {
            this.initializeCalendarFeatures();
        } else if (blockType === 'image') {
            this.initializeImageBlock();
        } else if (blockType === 'file') {
            this.initializeFileBlock();
        } else if (blockType === 'bookmark') {
            this.initializeBookmarkBlock();
        } else if (blockType === 'video') {
            this.initializeVideoBlock();
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

    // ==================== TIMELINE FEATURES ====================
    initializeTimelineFeatures() {
        const block = document.querySelector('.timeline-block:last-of-type');
        if (!block) return;

        // Setup range change
        const rangeSel = block.querySelector('.timeline-range');
        rangeSel.onchange = () => {
            block.dataset.rangeDays = rangeSel.value;
            this.renderTimeline(block);
        };

        // Add page handler
        const addBtn = block.querySelector('.add-timeline-page');
        addBtn.onclick = () => this.addTimelinePage(block);

        // Initial render
        if (!block.timelineData) block.timelineData = { pages: [] };
        this.renderTimeline(block);
    }

    renderTimeline(block) {
        console.log('renderTimeline called with block:', block);
        console.log('timelineData:', block.timelineData);
        
        const days = parseInt(block.dataset.rangeDays || '14', 10);
        const start = new Date();
        const header = block.querySelector('.timeline-header');
        const rows = block.querySelector('.timeline-rows');
        const list = block.querySelector('.tl-list');
        header.innerHTML = '<div class="tl-months"></div><div class="tl-days"></div>';
        rows.innerHTML = '';
        list.innerHTML = '';
        const monthsEl = header.querySelector('.tl-months');
        const daysEl = header.querySelector('.tl-days');

        // Build month segments (month-year labels spanning appropriate number of days)
        let cursor = new Date(start);
        let segmentMonth = cursor.getMonth();
        let segmentYear = cursor.getFullYear();
        let segmentCount = 0;
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        for (let i=0;i<days;i++) {
            const d = new Date(start); d.setDate(start.getDate()+i);
            const month = d.getMonth();
            const year = d.getFullYear();
            if (month !== segmentMonth || year !== segmentYear) {
                // flush previous segment
                const seg = document.createElement('div');
                seg.className = 'tl-month';
                seg.style.width = `${segmentCount * 32}px`;
                seg.textContent = `${monthNames[segmentMonth]} ${segmentYear}`;
                monthsEl.appendChild(seg);
                // reset
                segmentMonth = month; segmentYear = year; segmentCount = 0;
            }
            segmentCount++;
            // day cell
            const dayCell = document.createElement('div');
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            dayCell.className = 'tl-day' + (isWeekend ? ' weekend' : '');
            dayCell.textContent = d.getDate();
            daysEl.appendChild(dayCell);
        }
        // flush last segment
        if (segmentCount > 0) {
            const seg = document.createElement('div');
            seg.className = 'tl-month';
            seg.style.width = `${segmentCount * 32}px`;
            seg.textContent = `${monthNames[segmentMonth]} ${segmentYear}`;
            monthsEl.appendChild(seg);
        }

        (block.timelineData.pages || []).forEach((page, idx) => {
            // Left list item
            const li = document.createElement('div');
            li.className = 'tl-list-item';
            li.innerHTML = `
                <div class="tl-title">${page.title||'Page'}</div>
                <div class="tl-actions">
                    <button class="tl-del" onclick="event.stopPropagation(); window.sprintSpaceApp.deleteTimelinePage('${page.id}')" title="Delete">×</button>
                </div>
            `;
            list.appendChild(li);
            
            // Make the title clickable to open the page
            const titleElement = li.querySelector('.tl-title');
            titleElement.style.cursor = 'pointer';
            titleElement.onclick = (e) => {
                e.stopPropagation();
                this.openTimelinePageModal(block, page, idx);
            };

            // Right timeline row
            const row = document.createElement('div');
            row.className = 'tl-row';
            row.innerHTML = `<div class="tl-track"></div>`;
            rows.appendChild(row);

            // Render bar if dates are set
            const track = row.querySelector('.tl-track');
            const s = page.startDate ? new Date(page.startDate) : null;
            const e = page.endDate ? new Date(page.endDate) : null;
            if (s && e && e >= s) {
                const day0 = new Date(start); day0.setHours(0,0,0,0);
                const left = Math.max(0, Math.round((s - day0) / 86400000));
                const width = Math.max(1, Math.round((e - s) / 86400000) + 1);
                const bar = document.createElement('div');
                bar.className = 'tl-bar';
                bar.style.left = `${left * 32}px`;
                bar.style.width = `${width * 32 - 4}px`;
                track.appendChild(bar);
            }

            // All edits happen in the left drawer; this view is read-only
        });
    }

    async populateAssignees(selectEl, selected) {
        try {
            const r = await frappe.call({ method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.get_company_users' });
            const users = r.message || [];
            selectEl.innerHTML = '<option value="">Unassigned</option>' + users.map(u => `<option value="${u.name}">${u.full_name||u.name}</option>`).join('');
            if (selected) selectEl.value = selected;
        } catch (e) {
            selectEl.innerHTML = '<option value="">Unassigned</option>';
        }
    }

    addTimelinePage(block) {
        console.log('addTimelinePage called with block:', block);
        block.timelineData = block.timelineData || { pages: [] };
        const page = { 
            id: 'page_' + Date.now(),
            title: 'New Page',
            content: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            allDay: true,
            assignees: []
        };
        block.timelineData.pages.push(page);
        console.log('Added page to timelineData:', block.timelineData);
        this.renderTimeline(block);
        // Open modal immediately to fill details with a small delay to ensure rendering is complete
        const idx = block.timelineData.pages.length - 1;
        setTimeout(() => {
            this.openTimelinePageModal(block, page, idx);
        }, 100);
    }

    openTimelinePageModal(block, page, pageIndex) {
        const html = `
            <div class="timeline-page-modal">
                <div class="timeline-page-header">
                    <div class="timeline-page-title-container">
                        <button class="timeline-page-expand" onclick="window.sprintSpaceApp.toggleRightModalFullscreen()" title="Expand/Minimize">⛶</button>
                        <input type="text" class="timeline-page-title" value="${page.title || ''}" placeholder="Page title">
                    </div>
                    <button class="timeline-page-close" onclick="window.sprintSpaceApp.hideModal()">×</button>
                </div>
                
                <div class="timeline-page-assignees">
                    <div class="assignees-label">Assignees</div>
                    <div class="assignees-container" id="timeline-assignees-${page.id}">
                        ${(page.assignees || []).map(assignee => `
                            <div class="assignee-tag" data-user="${assignee}">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee)}&size=24&background=667eea&color=fff" alt="${assignee}" class="assignee-avatar">
                                <span class="assignee-name">${assignee}</span>
                                <button class="remove-assignee" onclick="this.parentElement.remove()" title="Remove assignee">×</button>
                            </div>
                        `).join('')}
                        <button class="btn-add-assignee" onclick="window.sprintSpaceApp.showAssigneeSelector('timeline-assignees-${page.id}')">+ Add assignee</button>
                    </div>
                </div>

                <div class="timeline-page-metadata">
                    <div class="timeline-page-field">
                        <label>Start Date</label>
                        <input type="date" class="timeline-page-start-date" value="${page.startDate || ''}">
                    </div>
                    <div class="timeline-page-field">
                        <label>End Date</label>
                        <input type="date" class="timeline-page-end-date" value="${page.endDate || ''}">
                    </div>
                    <div class="timeline-page-field">
                        <label>
                            <input type="checkbox" class="timeline-page-all-day" ${page.allDay ? 'checked' : ''}>
                            All Day
                        </label>
                    </div>
                </div>

                <div class="timeline-page-content">
                    <div class="timeline-page-editor-container">
                        <div class="timeline-page-editor" contenteditable="true" data-page-id="${page.id}" placeholder="Press Enter to continue with an empty page, or create a template">${page.content || ''}</div>
                        <div class="timeline-page-command-menu"></div>
                    </div>
                </div>

                <div class="timeline-page-footer">
                    <button class="btn btn-secondary" onclick="window.sprintSpaceApp.hideModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.sprintSpaceApp.saveTimelinePage('${page.id}')">Save</button>
                </div>
            </div>
        `;

        this.showRightSideModal('Timeline Page', html, { width: '40%' });
        this.setupTimelinePageEditor(page.id);
    }

    setupTimelinePageEditor(pageId) {
        const editor = document.querySelector(`[data-page-id="${pageId}"]`);
        const commandMenu = document.querySelector('.timeline-page-command-menu');
        
        if (!editor || !commandMenu) return;

        // Use the same setup as gallery and calendar modals
        this.setupPageEditorForModal(editor, commandMenu);

        // Setup auto-save
        this.setupModalAutoSave(editor, () => this.saveTimelinePage(pageId));
    }

    saveTimelinePage(pageId) {
        const modal = document.querySelector('.right-modal');
        if (!modal) return;

        const title = modal.querySelector('.timeline-page-title').value;
        const content = modal.querySelector('.timeline-page-editor').innerHTML;
        const startDate = modal.querySelector('.timeline-page-start-date').value;
        const endDate = modal.querySelector('.timeline-page-end-date').value;
        const allDay = modal.querySelector('.timeline-page-all-day').checked;

        // Get assignees
        const assigneesContainer = modal.querySelector(`#timeline-assignees-${pageId}`);
        const assignees = Array.from(assigneesContainer.querySelectorAll('.assignee-tag')).map(tag => tag.dataset.user);

        // Find the timeline block and update the page
        const timelineBlocks = document.querySelectorAll('.timeline-block');
        for (const block of timelineBlocks) {
            if (block.timelineData && block.timelineData.pages) {
                const pageIndex = block.timelineData.pages.findIndex(p => p.id === pageId);
                if (pageIndex !== -1) {
                    block.timelineData.pages[pageIndex] = {
                        ...block.timelineData.pages[pageIndex],
                        title,
                        content,
                        startDate,
                        endDate,
                        allDay,
                        assignees
                    };
                    this.renderTimeline(block);
                    this.autoSavePage();
                    
                    // Show success message
                    const saveBtn = modal.querySelector('.btn-primary');
                    if (saveBtn) {
                        const originalText = saveBtn.textContent;
                        saveBtn.textContent = '✓ Saved';
                        saveBtn.style.background = '#10b981';
                        setTimeout(() => {
                            saveBtn.textContent = originalText;
                            saveBtn.style.background = '';
                        }, 2000);
                    }
                    break;
                }
            }
        }
    }

    showTimelineItemMenu(event, button, pageId) {
        console.log('showTimelineItemMenu called for pageId:', pageId);
        
        // Hide any existing timeline item menu
        const existingMenu = document.querySelector('.timeline-item-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create menu
        const menu = document.createElement('div');
        menu.className = 'timeline-item-menu';
        menu.innerHTML = `
            <div class="menu-item" data-action="edit">
                <span class="menu-icon">✏️</span>
                <span class="menu-text">Edit</span>
            </div>
            <div class="menu-item" data-action="duplicate">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-item danger" data-action="delete">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
        `;

        // Position menu
        const rect = button.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left - 100}px`;
        menu.style.zIndex = '99999999';

        // Add to DOM
        document.body.appendChild(menu);

        // Handle menu item clicks with proper event delegation
        menu.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                const action = menuItem.dataset.action;
                console.log('Menu item clicked:', action);
                this.handleTimelineItemAction(action, pageId);
                menu.remove();
            }
        });

        // Hide menu when clicking outside
        const hideMenu = (e) => {
            if (!menu.contains(e.target) && !button.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', hideMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', hideMenu), 10);
    }

    handleTimelineItemAction(action, pageId) {
        console.log('handleTimelineItemAction called with action:', action, 'pageId:', pageId);
        
        const timelineBlocks = document.querySelectorAll('.timeline-block');
        for (const block of timelineBlocks) {
            if (block.timelineData && block.timelineData.pages) {
                const pageIndex = block.timelineData.pages.findIndex(p => p.id === pageId);
                if (pageIndex !== -1) {
                    const page = block.timelineData.pages[pageIndex];
                    console.log('Found page at index:', pageIndex, page);
                    
                    switch (action) {
                        case 'edit':
                            console.log('Opening edit modal for page:', page);
                            this.openTimelinePageModal(block, page, pageIndex);
                            break;
                        case 'duplicate':
                            console.log('Duplicating page:', page);
                            const duplicatedPage = {
                                ...page,
                                id: 'page_' + Date.now(),
                                title: page.title + ' (Copy)'
                            };
                            block.timelineData.pages.push(duplicatedPage);
                            this.renderTimeline(block);
                            this.autoSavePage();
                            break;
                        case 'delete':
                            console.log('Deleting page:', page);
                            if (confirm('Delete this page?')) {
                                block.timelineData.pages.splice(pageIndex, 1);
                                this.renderTimeline(block);
                                this.autoSavePage();
                            }
                            break;
                    }
                    break;
                }
            }
        }
    }

    deleteTimelinePage(pageId) {
        console.log('deleteTimelinePage called for pageId:', pageId);
        
        if (confirm('Delete this page?')) {
            const timelineBlocks = document.querySelectorAll('.timeline-block');
            for (const block of timelineBlocks) {
                if (block.timelineData && block.timelineData.pages) {
                    const pageIndex = block.timelineData.pages.findIndex(p => p.id === pageId);
                    if (pageIndex !== -1) {
                        block.timelineData.pages.splice(pageIndex, 1);
                        this.renderTimeline(block);
                        this.autoSavePage();
                        break;
                    }
                }
            }
        }
    }

    // ---------- Timeline Drawer ----------
    showLeftDrawerHTML(title, html) {
        const modalOverlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        if (!modalOverlay || !modal || !modalTitle || !modalContent) return;
        modalTitle.textContent = title;
        modalContent.innerHTML = html;
        modalOverlay.classList.add('show');
        // Drawer styles (RIGHT side)
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'stretch';
        modalOverlay.style.justifyContent = 'flex-end';
        modalOverlay.style.background = 'rgba(0,0,0,0.5)';
        modal.style.width = '420px';
        modal.style.height = '100vh';
        modal.style.borderRadius = '12px 0 0 12px';
        modal.style.margin = '0';
        modal.style.transform = 'translateX(0)';
        modal.style.display = 'block';
    }

    openTimelineTaskPanel(block, task, index) {
        const html = `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="tlp-title" value="${task.title||''}" placeholder="Task title">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="tlp-status">
                        <option ${task.status==='Not Started'?'selected':''}>Not Started</option>
                        <option ${task.status==='In Progress'?'selected':''}>In Progress</option>
                        <option ${task.status==='Done'?'selected':''}>Done</option>
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Start</label>
                        <input type="date" id="tlp-start" value="${task.start||''}">
                    </div>
                    <div class="form-group">
                        <label>Due</label>
                        <input type="date" id="tlp-due" value="${task.due||''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Assignee</label>
                    <select id="tlp-assignee"></select>
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea id="tlp-notes" rows="4" placeholder="Add any details..."></textarea>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-danger" id="tlp-delete">Delete</button>
                    <button class="btn btn-secondary" id="tlp-cancel">Cancel</button>
                    <button class="btn btn-primary" id="tlp-save">Save</button>
                </div>
            </div>
        `;
        this.showLeftDrawerHTML('Task', html);

        // Populate assignees
        this.populateAssignees(document.getElementById('tlp-assignee'), task.assignee);

        document.getElementById('tlp-cancel').onclick = () => this.hideModal();
        document.getElementById('tlp-delete').onclick = () => {
            if (confirm('Delete this task?')) {
                const i = block.timelineData.tasks.indexOf(task);
                if (i > -1) block.timelineData.tasks.splice(i, 1);
                this.hideModal();
                this.renderTimeline(block);
            }
        };
        document.getElementById('tlp-save').onclick = () => {
            task.title = document.getElementById('tlp-title').value || task.title;
            task.status = document.getElementById('tlp-status').value;
            task.start = document.getElementById('tlp-start').value || '';
            task.due = document.getElementById('tlp-due').value || '';
            task.assignee = document.getElementById('tlp-assignee').value || '';
            this.hideModal();
            this.renderTimeline(block);
        };
    }

    // ==================== GALLERY FEATURES ====================
    initializeGalleryFeatures() {
        const block = document.querySelector('.gallery-block:last-of-type');
        if (!block) return;

        // Setup add page button
        const addBtn = block.querySelector('.add-gallery-page');
        if (addBtn) {
            addBtn.onclick = () => this.addGalleryPage(block);
        }

        // Setup view mode toggle
        const viewModeSelect = block.querySelector('.gallery-view-mode');
        if (viewModeSelect) {
            viewModeSelect.onchange = () => this.toggleGalleryViewMode(block);
        }

        // Initialize gallery data
        if (!block.galleryData) block.galleryData = { pages: [], viewMode: 'grid' };
        this.renderGallery(block);
    }

    renderGallery(block) {
        const content = block.querySelector('.gallery-content');
        const grid = block.querySelector('.gallery-grid');
        if (!content || !grid) return;

        const pages = block.galleryData.pages || [];
        const viewMode = block.galleryData.viewMode || 'grid';

        if (pages.length === 0) {
            grid.innerHTML = '<div class="gallery-empty">No pages yet. Click "Add page" to create your first page.</div>';
            return;
        }

        if (viewMode === 'grid') {
            grid.innerHTML = pages.map((page, index) => `
                <div class="gallery-card" data-page-id="${page.id}">
                    <div class="gallery-card-thumbnail">
                        <div class="gallery-card-icon">📄</div>
                    </div>
                    <div class="gallery-card-content">
                        <div class="gallery-card-title">${page.title || 'Untitled'}</div>
                        <div class="gallery-card-meta">${page.createdAt || 'Just now'}</div>
                    </div>
                    <div class="gallery-card-actions">
                        <button class="gallery-card-edit" onclick="window.sprintSpaceApp.editGalleryPage('${page.id}')">✏️</button>
                        <button class="gallery-card-delete" onclick="window.sprintSpaceApp.deleteGalleryPage('${page.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
        } else {
            grid.innerHTML = pages.map((page, index) => `
                <div class="gallery-list-item" data-page-id="${page.id}">
                    <div class="gallery-list-icon">📄</div>
                    <div class="gallery-list-content">
                        <div class="gallery-list-title">${page.title || 'Untitled'}</div>
                        <div class="gallery-list-meta">${page.createdAt || 'Just now'}</div>
                    </div>
                    <div class="gallery-list-actions">
                        <button class="gallery-list-edit" onclick="window.sprintSpaceApp.editGalleryPage('${page.id}')">✏️</button>
                        <button class="gallery-list-delete" onclick="window.sprintSpaceApp.deleteGalleryPage('${page.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    }

    addGalleryPage(block) {
        const pageId = 'page_' + Date.now();
        const newPage = {
            id: pageId,
            title: 'New Page',
            content: '',
            createdAt: new Date().toLocaleDateString(),
            parentPage: null
        };

        block.galleryData = block.galleryData || { pages: [], viewMode: 'grid' };
        block.galleryData.pages.push(newPage);
        this.renderGallery(block);
        
        // Open page in modal
        this.openGalleryPageModal(block, newPage);
    }

    editGalleryPage(pageId) {
        const block = document.querySelector('.gallery-block');
        if (!block || !block.galleryData) return;
        
        const page = block.galleryData.pages.find(p => p.id === pageId);
        if (page) {
            this.openGalleryPageModal(block, page);
        }
    }

    deleteGalleryPage(pageId) {
        const block = document.querySelector('.gallery-block');
        if (!block || !block.galleryData) return;
        
        if (confirm('Delete this page?')) {
            block.galleryData.pages = block.galleryData.pages.filter(p => p.id !== pageId);
            this.renderGallery(block);
        }
    }

    openGalleryPageModal(block, page) {
        const html = `
            <div class="gallery-page-modal">
                <div class="gallery-page-metadata">
                    <div class="gallery-page-title-section">
                        <input type="text" class="gallery-page-title" value="${page.title}" placeholder="Page title">
                    </div>
                    <div class="gallery-page-assignees">
                        <label class="assignees-label">Assignees:</label>
                        <div class="assignees-container" id="gallery-assignees-${page.id}">
                            ${(page.assignees || []).map(assignee => `
                                <span class="assignee-tag" data-user="${assignee}">
                                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee)}&size=20&background=667eea&color=fff" alt="${assignee}" class="assignee-avatar">
                                    <span class="assignee-name">${assignee}</span>
                                    <button class="assignee-remove" onclick="window.sprintSpaceApp.removeAssignee('gallery-assignees-${page.id}', '${assignee}')">×</button>
                                </span>
                            `).join('')}
                        </div>
                        <button class="btn-add-assignee" onclick="window.sprintSpaceApp.showAssigneeSelector('gallery-assignees-${page.id}')">
                            + Add assignee
                        </button>
                    </div>
                </div>
                <div class="gallery-page-content">
                    <div class="gallery-page-editor-container">
                        <div class="gallery-page-editor" contenteditable="true" placeholder="Press Enter to continue with an empty page, or create a template">${page.content || ''}</div>
                        <div class="gallery-page-command-menu"></div>
                    </div>
                </div>
                <div class="gallery-page-footer">
                    <button class="btn btn-secondary" onclick="window.sprintSpaceApp.closeGalleryPageModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.sprintSpaceApp.saveGalleryPage('${page.id}')">Save</button>
                </div>
            </div>
        `;
        
        this.showRightSideModal('Gallery Page', html);
        
        // Initialize the editor with full SprintSpace functionality
        this.initializeGalleryPageEditor(page);
        
        // Focus on title input
        const titleInput = document.querySelector('.gallery-page-title');
        if (titleInput) {
            titleInput.focus();
            titleInput.select();
        }
    }

    saveGalleryPage(pageId) {
        const titleInput = document.querySelector('.gallery-page-title');
        const contentEditor = document.querySelector('.gallery-page-editor');
        const assigneesContainer = document.querySelector(`#gallery-assignees-${pageId}`);
        
        if (titleInput && contentEditor) {
            const title = titleInput.value || 'Untitled';
            const content = contentEditor.innerHTML;
            const assignees = assigneesContainer ? Array.from(assigneesContainer.querySelectorAll('.assignee-tag')).map(tag => tag.dataset.user) : [];
            
            // Find the gallery block and update the page data
            const block = document.querySelector('.gallery-block');
            if (block && block.galleryData) {
                const page = block.galleryData.pages.find(p => p.id === pageId);
                if (page) {
                    page.title = title;
                    page.content = content;
                    page.assignees = assignees;
                    page.updatedAt = new Date().toLocaleDateString();
                    
                    // Re-render the gallery to show updated content
                    this.renderGallery(block);
                }
            }
            
            // Trigger auto-save to persist the changes
            setTimeout(() => {
                this.autoSavePage();
            }, 100);
            
            // Show success message
            frappe.show_alert({
                message: 'Page saved successfully!',
                indicator: 'green'
            });
            
            this.hideModal();
        }
    }

    closeGalleryPageModal() {
        this.hideModal();
    }

    initializeGalleryPageEditor(page) {
        const editor = document.querySelector('.gallery-page-editor');
        const commandMenu = document.querySelector('.gallery-page-command-menu');
        
        if (!editor || !commandMenu) return;

        // Store reference to the page for saving
        editor.currentPage = page;

        // Initialize the editor with full SprintSpace functionality
        this.setupPageEditorForModal(editor, commandMenu);
        
        // Set up auto-save for the modal editor
        this.setupModalAutoSave(editor, page);
    }

    setupPageEditorForModal(editor, commandMenu) {
        // Enable contenteditable
        editor.contentEditable = true;
        
        // Use the same slash command system as the main editor
        this.setupSlashCommands(editor, commandMenu, this.getModalCommands(editor));
        
        // Set up checklist features for modal editor
        this.setupChecklistFeaturesForModal(editor);
        
        // Convert existing list items in modal editor
        setTimeout(() => {
            console.log('=== CONVERTING LIST ITEMS IN MODAL ===');
            this.convertExistingListItems(editor);
            this.forceListMenuVisibility();
        }, 100);
        
        // Also run conversion on input events to catch dynamically created lists
        editor.addEventListener('input', () => {
            setTimeout(() => {
                this.convertExistingListItems(editor);
                this.forceListMenuVisibility();
            }, 50);
        });
    }

    getModalCommands(editor) {
        return [
            {
                title: 'Paragraph',
                subtitle: 'Just start writing with plain text.',
                icon: '📝',
                keywords: ['paragraph', 'text', 'p'],
                action: () => {
                    console.log('Paragraph action called');
                    this.insertBlockInModal(editor, 'paragraph', '');
                }
            },
            {
                title: 'Heading 1',
                subtitle: 'Big section heading.',
                icon: 'H1',
                keywords: ['h1', 'heading', 'title', 'big'],
                action: () => {
                    console.log('Heading 1 action called');
                    this.insertBlockInModal(editor, 'heading', '1');
                }
            },
            {
                title: 'Heading 2',
                subtitle: 'Medium section heading.',
                icon: 'H2',
                keywords: ['h2', 'heading', 'subtitle', 'medium'],
                action: () => this.insertBlockInModal(editor, 'heading', '2')
            },
            {
                title: 'Heading 3',
                subtitle: 'Small section heading.',
                icon: 'H3',
                keywords: ['h3', 'heading', 'small'],
                action: () => this.insertBlockInModal(editor, 'heading', '3')
            },
            {
                title: 'Bulleted list',
                subtitle: 'Create a simple bulleted list.',
                icon: '•',
                keywords: ['bullet', 'list', 'ul', 'unordered'],
                action: () => this.insertBlockInModal(editor, 'list', '')
            },
            {
                title: 'Numbered list',
                subtitle: 'Create a list with numbering.',
                icon: '1.',
                keywords: ['numbered', 'list', 'ol', 'ordered'],
                action: () => this.insertBlockInModal(editor, 'numbered', '')
            },
            {
                title: 'Checklist',
                subtitle: 'Track tasks with a to-do list.',
                icon: '☑️',
                keywords: ['checklist', 'todo', 'task', 'checkbox'],
                action: () => this.insertBlockInModal(editor, 'checklist', '')
            },
            {
                title: 'Table',
                subtitle: 'Add a table to organize data.',
                icon: '⊞',
                keywords: ['table', 'grid', 'data'],
                action: () => this.insertBlockInModal(editor, 'table', '')
            },
            {
                title: 'Toggle',
                subtitle: 'Collapsible content section.',
                icon: '▶',
                keywords: ['toggle', 'collapse', 'expand'],
                action: () => this.insertBlockInModal(editor, 'toggle', '')
            },
            {
                title: 'Divider',
                subtitle: 'Visually divide blocks.',
                icon: '―',
                keywords: ['divider', 'separator', 'hr', 'line'],
                action: () => this.insertBlockInModal(editor, 'divider', '')
            },
            {
                title: 'Image',
                subtitle: 'Upload or embed an image.',
                icon: '🖼️',
                keywords: ['image', 'picture', 'photo'],
                action: () => this.insertBlockInModal(editor, 'image', '')
            },
            {
                title: 'Video',
                subtitle: 'Upload or embed a video.',
                icon: '🎬',
                keywords: ['video', 'youtube', 'mp4', 'media'],
                action: () => this.insertBlockInModal(editor, 'video', '')
            },
            {
                title: 'File',
                subtitle: 'Attach a file for download.',
                icon: '📎',
                keywords: ['file', 'attachment', 'document'],
                action: () => this.insertBlockInModal(editor, 'file', '')
            },
            {
                title: 'Bookmark',
                subtitle: 'Create a rich link preview.',
                icon: '🔖',
                keywords: ['bookmark', 'link', 'url', 'preview'],
                action: () => this.insertBlockInModal(editor, 'bookmark', '')
            },
            {
                title: 'Timeline',
                subtitle: 'Visual task timeline with dates and assignees.',
                icon: '📆',
                keywords: ['timeline', 'gantt', 'calendar', 'plan', 'schedule'],
                action: () => this.insertBlockInModal(editor, 'timeline', '')
            },
            {
                title: 'Gallery',
                subtitle: 'Card-based view with modal pages and nested content.',
                icon: '🖼️',
                keywords: ['gallery', 'cards', 'modal', 'nested', 'pages'],
                action: () => this.insertBlockInModal(editor, 'gallery', '')
            },
            {
                title: 'Calendar',
                subtitle: 'Monthly calendar view with date-based pages.',
                icon: '📅',
                keywords: ['calendar', 'monthly', 'dates', 'schedule', 'events'],
                action: () => this.insertBlockInModal(editor, 'calendar', '')
            }
        ];
    }


    insertBlockInModal(editor, blockType, level) {
        console.log('insertBlockInModal called with:', blockType, level);
        // Use the same block creation logic as the main editor
        // insertBlock signature: (editor, type, content, level)
        this.insertBlock(editor, blockType, '', level);
    }

    setupChecklistFeaturesForModal(editor) {
        // Set up checklist keydown handler for modal editor
        editor.removeEventListener('keydown', this.modalChecklistKeydownHandler);
        this.modalChecklistKeydownHandler = (e) => {
            if (e.key === 'Enter' && e.target.matches('.checklist-list .cl-text[contenteditable="true"]')) {
                this.handleChecklistKeydown(e, e.target);
            }
            if (e.key === 'Backspace' && e.target.matches('.checklist-list .cl-text[contenteditable="true"]')) {
                const wrapper = e.target.closest('.checklist-item');
                const isEmpty = e.target.textContent.trim() === '' || e.target.textContent.trim() === 'To-do' || e.target.textContent.trim() === 'Add a to-do item';
                if (wrapper && isEmpty) {
                    // Remove empty item on backspace to behave like Notion
                    e.preventDefault();
                    const list = wrapper.parentElement;
                    const prev = wrapper.previousElementSibling?.querySelector('.cl-text[contenteditable="true"]');
                    wrapper.remove();
                    if (prev) prev.focus();
                }
            }
        };
        editor.addEventListener('keydown', this.modalChecklistKeydownHandler);
    }

    setupModalAutoSave(editor, page) {
        // Auto-save every 2 seconds
        setInterval(() => {
            if (editor.currentPage && editor.currentPage.id === page.id) {
                page.content = editor.innerHTML;
                console.log('Auto-saved modal page:', page.title);
            }
        }, 2000);
    }

    toggleGalleryPageFullscreen() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.classList.toggle('fullscreen');
        }
    }

    toggleGalleryViewMode(block) {
        const viewModeSelect = block.querySelector('.gallery-view-mode');
        if (viewModeSelect) {
            block.galleryData = block.galleryData || { pages: [], viewMode: 'grid' };
            block.galleryData.viewMode = viewModeSelect.value;
            this.renderGallery(block);
        }
    }

    // ==================== CALENDAR FEATURES ====================
    initializeCalendarFeatures() {
        const block = document.querySelector('.calendar-block:last-of-type');
        if (!block) return;

        // Setup navigation buttons
        const todayBtn = block.querySelector('.calendar-today');
        const prevBtn = block.querySelector('.calendar-prev');
        const nextBtn = block.querySelector('.calendar-next');
        const addPageBtn = block.querySelector('.add-calendar-page');

        if (todayBtn) todayBtn.onclick = () => this.goToToday(block);
        if (prevBtn) prevBtn.onclick = () => this.previousMonth(block);
        if (nextBtn) nextBtn.onclick = () => this.nextMonth(block);
        if (addPageBtn) addPageBtn.onclick = () => this.addCalendarPage(block);

        // Initialize calendar data
        if (!block.calendarData) {
            block.calendarData = { 
                currentDate: new Date(),
                pages: []
            };
        }
        
        this.renderCalendar(block);
    }

    renderCalendar(block) {
        const monthYearEl = block.querySelector('.calendar-month-year');
        const daysEl = block.querySelector('.calendar-days');
        
        if (!monthYearEl || !daysEl) return;
        
        // Debug: Log all pages in calendar data
        console.log('Calendar data pages:', block.calendarData?.pages || []);

        const currentDate = block.calendarData.currentDate;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Update month/year display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        monthYearEl.textContent = `${monthNames[month]} ${year}`;

        // Clear existing days
        daysEl.innerHTML = '';

        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            daysEl.appendChild(emptyDay);
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            
            // Check if there are pages for this date (including pages that span across this date)
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const currentDate = new Date(dateStr);
            
            // Find pages that are active on this date
            const pagesForDate = block.calendarData.pages.filter(page => {
                // Normalize dates to YYYY-MM-DD format for comparison
                const pageStartDate = page.startDate || page.date;
                const pageEndDate = page.endDate || pageStartDate;
                
                if (!pageStartDate) return false;
                
                // Convert to date strings for comparison (YYYY-MM-DD)
                const startDateStr = new Date(pageStartDate).toISOString().split('T')[0];
                const endDateStr = new Date(pageEndDate).toISOString().split('T')[0];
                const currentDateStr = currentDate.toISOString().split('T')[0];
                
                // Check if current date falls within the page's date range
                return currentDateStr >= startDateStr && currentDateStr <= endDateStr;
            });
            
            // Debug logging
            if (pagesForDate.length > 0) {
                console.log(`Found ${pagesForDate.length} pages for ${dateStr}:`, pagesForDate.map(p => ({
                    title: p.title,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    date: p.date
                })));
            }
            
            if (pagesForDate.length > 0) {
                dayEl.classList.add('has-pages');
                
                // Define colors for different pages
                const pageColors = [
                    '#3b82f6', // Blue
                    '#10b981', // Green
                    '#f59e0b', // Yellow
                    '#ef4444', // Red
                    '#8b5cf6', // Purple
                    '#06b6d4', // Cyan
                    '#f97316', // Orange
                    '#84cc16'  // Lime
                ];
                
                // Create page indicators with different colors
                const pageIndicators = pagesForDate.map((page, index) => {
                    const color = pageColors[index % pageColors.length];
                    const truncatedTitle = page.title.length > 12 ? page.title.substring(0, 12) + '...' : page.title;
                    return `
                        <div class="day-page-indicator" 
                             style="background-color: ${color};" 
                             title="${page.title}"
                             onclick="event.stopPropagation(); window.sprintSpaceApp.editCalendarPage('${page.id}')">
                            ${truncatedTitle}
                        </div>
                    `;
                }).join('');
                
                dayEl.innerHTML = `
                    <span class="day-number">${day}</span>
                    <div class="day-pages-container">
                        ${pageIndicators}
                    </div>
                `;
            }
            
            // Add click handler
            dayEl.onclick = () => this.openCalendarDay(block, dateStr);
            
            daysEl.appendChild(dayEl);
        }
    }

    goToToday(block) {
        block.calendarData.currentDate = new Date();
        this.renderCalendar(block);
    }

    previousMonth(block) {
        const currentDate = block.calendarData.currentDate;
        currentDate.setMonth(currentDate.getMonth() - 1);
        this.renderCalendar(block);
    }

    nextMonth(block) {
        const currentDate = block.calendarData.currentDate;
        currentDate.setMonth(currentDate.getMonth() + 1);
        this.renderCalendar(block);
    }

    addCalendarPage(block) {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        this.openCalendarDay(block, dateStr);
    }

    openCalendarDay(block, dateStr) {
        const currentDate = new Date(dateStr);
        
        // Find pages that are active on this date (including pages that span across this date)
        const pagesForDate = block.calendarData.pages.filter(page => {
            // Normalize dates to YYYY-MM-DD format for comparison
            const pageStartDate = page.startDate || page.date;
            const pageEndDate = page.endDate || pageStartDate;
            
            if (!pageStartDate) return false;
            
            // Convert to date strings for comparison (YYYY-MM-DD)
            const startDateStr = new Date(pageStartDate).toISOString().split('T')[0];
            const endDateStr = new Date(pageEndDate).toISOString().split('T')[0];
            const currentDateStr = currentDate.toISOString().split('T')[0];
            
            // Check if current date falls within the page's date range
            return currentDateStr >= startDateStr && currentDateStr <= endDateStr;
        });
        
        const date = new Date(dateStr);
        const dateDisplay = date.toLocaleDateString();
        
        const html = `
            <div class="calendar-day-modal">
                <div class="calendar-day-header">
                    <h3>${dateDisplay}</h3>
                    <button class="btn btn-primary" onclick="window.sprintSpaceApp.addPageToDate('${dateStr}')">+ Add Page</button>
                </div>
                <div class="calendar-day-pages">
                    ${pagesForDate.length === 0 ? 
                        '<div class="calendar-day-empty">No pages for this date. Click "Add Page" to create one.</div>' :
                        pagesForDate.map((page, index) => {
                            const pageColors = [
                                '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
                                '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'
                            ];
                            const color = pageColors[index % pageColors.length];
                            const startDate = page.startDate || page.date;
                            const endDate = page.endDate || startDate;
                            const dateRange = startDate === endDate ? 
                                new Date(startDate).toLocaleDateString() : 
                                `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
                            
                            return `
                                <div class="calendar-day-page" data-page-id="${page.id}">
                                    <div class="calendar-page-color-indicator" style="background-color: ${color};"></div>
                                    <div class="calendar-page-content">
                                        <div class="calendar-page-title">${page.title}</div>
                                        <div class="calendar-page-dates">${dateRange}</div>
                                    </div>
                                    <div class="calendar-page-actions">
                                        <button onclick="window.sprintSpaceApp.editCalendarPage('${page.id}')" title="Edit">✏️</button>
                                        <button onclick="window.sprintSpaceApp.deleteCalendarPage('${page.id}')" title="Delete">🗑️</button>
                                    </div>
                                </div>
                            `;
                        }).join('')
                    }
                </div>
            </div>
        `;
        
        this.showModalHTML(`Calendar - ${dateDisplay}`, html);
    }

    addPageToDate(dateStr) {
        const pageId = 'page_' + Date.now();
        const newPage = {
            id: pageId,
            title: 'New Page',
            content: '',
            date: dateStr,
            startDate: dateStr,
            endDate: '',
            allDay: true,
            createdAt: new Date().toLocaleDateString()
        };

        const block = document.querySelector('.calendar-block');
        if (block && block.calendarData) {
            block.calendarData.pages.push(newPage);
            this.renderCalendar(block);
            this.editCalendarPage(pageId);
        }
    }

    editCalendarPage(pageId) {
        const block = document.querySelector('.calendar-block');
        if (!block || !block.calendarData) return;
        
        const page = block.calendarData.pages.find(p => p.id === pageId);
        if (page) {
            const html = `
                <div class="calendar-page-modal">
                    <div class="calendar-page-metadata">
                        <div class="calendar-page-title-section">
                            <input type="text" class="calendar-page-title" value="${page.title}" placeholder="Page title">
                        </div>
                        <div class="calendar-page-assignees">
                            <label class="assignees-label">Assignees:</label>
                            <div class="assignees-container" id="calendar-assignees-${page.id}">
                                ${(page.assignees || []).map(assignee => `
                                    <span class="assignee-tag" data-user="${assignee}">
                                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee)}&size=20&background=667eea&color=fff" alt="${assignee}" class="assignee-avatar">
                                        <span class="assignee-name">${assignee}</span>
                                        <button class="assignee-remove" onclick="window.sprintSpaceApp.removeAssignee('calendar-assignees-${page.id}', '${assignee}')">×</button>
                                    </span>
                                `).join('')}
                            </div>
                            <button class="btn-add-assignee" onclick="window.sprintSpaceApp.showAssigneeSelector('calendar-assignees-${page.id}')">
                                + Add assignee
                            </button>
                        </div>
                        <div class="calendar-page-dates">
                            <div class="calendar-date-field">
                                <label>Start Date:</label>
                                <input type="date" class="calendar-page-start-date" value="${page.startDate || page.date || ''}">
                            </div>
                            <div class="calendar-date-field">
                                <label>End Date:</label>
                                <input type="date" class="calendar-page-end-date" value="${page.endDate || ''}">
                            </div>
                            <div class="calendar-date-field">
                                <label>All Day:</label>
                                <input type="checkbox" class="calendar-page-all-day" ${page.allDay ? 'checked' : ''}>
                            </div>
                        </div>
                    </div>
                    <div class="calendar-page-content">
                        <div class="calendar-page-editor-container">
                            <div class="calendar-page-editor" contenteditable="true" placeholder="Press Enter to continue with an empty page, or create a template">${page.content || ''}</div>
                            <div class="calendar-page-command-menu"></div>
                        </div>
                    </div>
                    <div class="calendar-page-footer">
                        <button class="btn btn-secondary" onclick="window.sprintSpaceApp.closeCalendarPageModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.sprintSpaceApp.saveCalendarPage('${page.id}')">Save</button>
                    </div>
                </div>
            `;
            
            this.showRightSideModal('Calendar Page', html);
            
            // Initialize the editor with full SprintSpace functionality
            this.initializeCalendarPageEditor(page);
            
            // Focus on title input
            const titleInput = document.querySelector('.calendar-page-title');
            if (titleInput) {
                titleInput.focus();
                titleInput.select();
            }
        }
    }

    deleteCalendarPage(pageId) {
        const block = document.querySelector('.calendar-block');
        if (!block || !block.calendarData) return;
        
        if (confirm('Delete this page?')) {
            block.calendarData.pages = block.calendarData.pages.filter(p => p.id !== pageId);
            this.renderCalendar(block);
            this.hideModal();
        }
    }

    saveCalendarPage(pageId) {
        const titleInput = document.querySelector('.calendar-page-title');
        const contentEditor = document.querySelector('.calendar-page-editor');
        const startDateInput = document.querySelector('.calendar-page-start-date');
        const endDateInput = document.querySelector('.calendar-page-end-date');
        const allDayInput = document.querySelector('.calendar-page-all-day');
        const assigneesContainer = document.querySelector(`#calendar-assignees-${pageId}`);
        
        if (titleInput && contentEditor) {
            const title = titleInput.value || 'Untitled';
            const content = contentEditor.innerHTML;
            const startDate = startDateInput ? startDateInput.value : '';
            const endDate = endDateInput ? endDateInput.value : '';
            const allDay = allDayInput ? allDayInput.checked : true;
            const assignees = assigneesContainer ? Array.from(assigneesContainer.querySelectorAll('.assignee-tag')).map(tag => tag.dataset.user) : [];
            
            // Find the calendar block and update the page data
            const block = document.querySelector('.calendar-block');
            if (block && block.calendarData) {
                const page = block.calendarData.pages.find(p => p.id === pageId);
                if (page) {
                    page.title = title;
                    page.content = content;
                    page.startDate = startDate;
                    page.endDate = endDate;
                    page.allDay = allDay;
                    page.assignees = assignees;
                    // Update the main date field to match start date for calendar display
                    page.date = startDate || page.date;
                    page.updatedAt = new Date().toLocaleDateString();
                    
                    // Re-render the calendar to show updated content
                    this.renderCalendar(block);
                }
            }
            
            // Trigger auto-save to persist the changes
            setTimeout(() => {
                this.autoSavePage();
            }, 100);
            
            // Show success message
            frappe.show_alert({
                message: 'Page saved successfully!',
                indicator: 'green'
            });
            
            this.hideModal();
        }
    }

    closeCalendarPageModal() {
        this.hideModal();
    }

    initializeCalendarPageEditor(page) {
        const editor = document.querySelector('.calendar-page-editor');
        const commandMenu = document.querySelector('.calendar-page-command-menu');
        
        if (!editor || !commandMenu) return;

        // Store reference to the page for saving
        editor.currentPage = page;

        // Initialize the editor with full SprintSpace functionality
        this.setupPageEditorForModal(editor, commandMenu);
        
        // Set up auto-save for the modal editor
        this.setupModalAutoSave(editor, page);
    }

    toggleCalendarPageFullscreen() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.classList.toggle('fullscreen');
        }
    }

    // ==================== MEDIA BLOCKS ====================
    async initializeImageBlock() {
        const block = document.querySelector('.image-block:last-of-type');
        if (!block) return;
        const uploadBtn = block.querySelector('.media-upload');
        const urlBtn = block.querySelector('.media-url');
        const preview = block.querySelector('.media-preview');
        const caption = block.querySelector('.media-caption');

        uploadBtn.onclick = async () => {
            const f = await this.promptForFile('image/*');
            if (!f) return;
            const info = await this.uploadFileToPage(f);
            preview.classList.remove('media-empty');
            preview.innerHTML = `<img src="${info.file_url}" alt="" style="max-width:100%; height:auto; border-radius:8px;"/>`;
            block.dataset.media = JSON.stringify({type:'image', file: info});
        };
        urlBtn.onclick = async () => {
            const url = prompt('Enter image URL');
            if (!url) return;
            preview.classList.remove('media-empty');
            preview.innerHTML = `<img src="${url}" alt="" style="max-width:100%; height:auto; border-radius:8px;"/>`;
            block.dataset.media = JSON.stringify({type:'image', url});
        };
        caption.oninput = () => {
            const data = this.safeParse(block.dataset.media) || {type:'image'};
            data.caption = caption.value;
            block.dataset.media = JSON.stringify(data);
        };

        // Override with Notion-like modal picker
        uploadBtn.onclick = () => this.openMediaDialog('image', async (sel) => {
            if (sel.mode === 'upload' && sel.file) {
                // Instant local preview
                const blobUrl = URL.createObjectURL(sel.file);
                preview.classList.remove('media-empty');
                preview.innerHTML = `<img src="${blobUrl}" alt="" style="max-width:100%; height:auto; border-radius:8px;"/>`;
                try {
                    const info = await this.uploadFileToPage(sel.file);
                    const imgEl = preview.querySelector('img');
                    if (imgEl) {
                        console.log('File info received:', info);
                        
                        // Strategy 1: Try base64 data URL first (immediate display)
                        if (info.base64_data) {
                            console.log('Using base64 data URL for immediate display');
                            imgEl.src = info.base64_data;
                            imgEl.onload = () => {
                                console.log('Base64 image loaded successfully');
                                // After base64 loads, try to switch to server URL for caching
                                setTimeout(() => {
                                    const serverUrl = this.normalizeUrl(info.file_url);
                                    console.log('Switching to server URL:', serverUrl);
                                    const testImg = new Image();
                                    testImg.onload = () => {
                                        console.log('Server URL works, switching');
                                        imgEl.src = serverUrl;
                                    };
                                    testImg.onerror = () => {
                                        console.log('Server URL failed, keeping base64');
                                    };
                                    testImg.src = serverUrl;
                                }, 1000);
                            };
                        } else {
                            // Strategy 2: Use server URL directly
                            const imageUrl = this.normalizeUrl(info.file_url);
                            console.log('Setting image src to:', imageUrl);
                            imgEl.src = imageUrl;
                            
                            imgEl.onerror = () => {
                                console.error('Failed to load image:', imageUrl);
                                frappe.show_alert({message:'Failed to load uploaded image. File may be inaccessible.', indicator:'red'});
                            };
                            imgEl.onload = () => {
                                console.log('Image loaded successfully:', imageUrl);
                            };
                        }
                    }
                    block.dataset.media = JSON.stringify({type:'image', file: info});
                    // Hide upload buttons after successful upload
                    this.hideMediaToolbar(block);
                    setTimeout(() => this.autoSavePage(), 200);
                } catch (error) {
                    console.error('Image upload error:', error);
                    frappe.show_alert({message:'Upload failed: ' + (error.message || 'Unknown error'), indicator:'red'});
                    // Revert to empty state on error
                    preview.classList.add('media-empty');
                    preview.innerHTML = 'Click Upload or From URL';
                } finally {
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
                }
            } else if (sel.mode === 'url' && sel.url) {
                preview.classList.remove('media-empty');
                preview.innerHTML = `<img src="${sel.url}" alt="" style="max-width:100%; height:auto; border-radius:8px;"/>`;
                block.dataset.media = JSON.stringify({type:'image', url: sel.url});
                // Hide upload buttons after successful URL addition
                this.hideMediaToolbar(block);
                setTimeout(() => this.autoSavePage(), 200);
            }
        });
        urlBtn.onclick = uploadBtn.onclick;
    }

    async initializeFileBlock() {
        const block = document.querySelector('.file-block:last-of-type');
        if (!block) return;
        const uploadBtn = block.querySelector('.media-upload');
        const urlBtn = block.querySelector('.media-url');
        const preview = block.querySelector('.media-preview');

        const renderCard = (name, url) => {
            preview.classList.remove('media-empty');
            preview.innerHTML = `<div class="media-card"><span class="media-icon">📎</span><a href="${url}" target="_blank">${name}</a></div>`;
        };

        uploadBtn.onclick = async () => {
            const f = await this.promptForFile('*/*');
            if (!f) return;
            const info = await this.uploadFileToPage(f);
            renderCard(info.filename || f.name, info.file_url);
            block.dataset.media = JSON.stringify({type:'file', file: info});
        };
        urlBtn.onclick = async () => {
            const url = prompt('Enter file URL');
            if (!url) return;
            const name = url.split('/').pop() || 'file';
            renderCard(name, url);
            block.dataset.media = JSON.stringify({type:'file', url, name});
        };

        // Override with Notion-like modal picker
        uploadBtn.onclick = () => this.openMediaDialog('file', async (sel) => {
            if (sel.mode === 'upload' && sel.file) {
                // Instant local card, will swap to server URL after upload
                const localUrl = URL.createObjectURL(sel.file);
                renderCard(sel.file.name || 'file', localUrl);
                try {
                    const info = await this.uploadFileToPage(sel.file);
                    console.log('File info received:', info);
                    
                    // Strategy 1: Use base64 data for preview when possible
                    if (info.base64_data) {
                        console.log('Using base64 data for file preview');
                        this.renderFilePreview(preview, sel.file, info);
                    } else {
                        // Strategy 2: Use server URL directly
                        const fileUrl = this.normalizeUrl(info.file_url);
                        console.log('Setting file URL to:', fileUrl);
                        this.renderFilePreview(preview, sel.file, info, fileUrl);
                    }
                    
                    block.dataset.media = JSON.stringify({type:'file', file: info});
                    // Hide upload buttons after successful upload
                    this.hideMediaToolbar(block);
                    setTimeout(() => this.autoSavePage(), 200);
                } catch (error) {
                    console.error('File upload error:', error);
                    frappe.show_alert({message:'Upload failed: ' + (error.message || 'Unknown error'), indicator:'red'});
                    // Revert to empty state on error
                    preview.classList.add('media-empty');
                    preview.innerHTML = 'Click Upload or From URL';
                } finally {
                    setTimeout(() => URL.revokeObjectURL(localUrl), 2000);
                }
            } else if (sel.mode === 'url' && sel.url) {
                const name = sel.url.split('/').pop() || 'file';
                renderCard(name, sel.url);
                block.dataset.media = JSON.stringify({type:'file', url: sel.url, name});
                // Hide upload buttons after successful URL addition
                this.hideMediaToolbar(block);
                setTimeout(() => this.autoSavePage(), 200);
            }
        });
        urlBtn.onclick = uploadBtn.onclick;
    }

    async initializeBookmarkBlock() {
        const block = document.querySelector('.bookmark-block:last-of-type');
        if (!block) return;
        const urlBtn = block.querySelector('.media-url');
        const preview = block.querySelector('.media-preview');

        urlBtn.onclick = async () => {
            const url = prompt('Paste a link');
            if (!url) return;
            try {
                const r = await frappe.call({ method: 'sprintspace.sprintspace.api.media.link_preview', args: { url } });
                const d = r.message || {};
                preview.classList.remove('media-empty');
                preview.innerHTML = `
                    <a class="bookmark-card" href="${d.url}" target="_blank">
                        ${d.image ? `<div class="bm-image" style="background-image:url('${d.image}')"></div>` : ''}
                        <div class="bm-body">
                            <div class="bm-title">${d.title||d.site_name||'Link'}</div>
                            <div class="bm-desc">${d.description||''}</div>
                            <div class="bm-meta">${d.site_name||''}</div>
                        </div>
                    </a>`;
                block.dataset.media = JSON.stringify({type:'bookmark', data: d});
                this.autoSavePage();
            } catch (e) {
                frappe.show_alert({message:'Failed to fetch preview', indicator:'red'});
            }
        };

        // Override with Notion-like modal picker
        urlBtn.onclick = () => this.openMediaDialog('bookmark', async (sel) => {
            if (!sel.url) return;
            try {
                const r = await frappe.call({ method: 'sprintspace.sprintspace.api.media.link_preview', args: { url: sel.url } });
                const d = r.message || {};
                preview.classList.remove('media-empty');
                preview.innerHTML = `
                    <a class="bookmark-card" href="${d.url}" target="_blank">
                        ${d.image ? `<div class="bm-image" style="background-image:url('${d.image}')"></div>` : ''}
                        <div class="bm-body">
                            <div class="bm-title">${d.title||d.site_name||'Link'}</div>
                            <div class="bm-desc">${d.description||''}</div>
                            <div class="bm-meta">${d.site_name||''}</div>
                        </div>
                    </a>`;
                block.dataset.media = JSON.stringify({type:'bookmark', data: d});
            } catch (e) {
                frappe.show_alert({message:'Failed to fetch preview', indicator:'red'});
            }
        });
    }

    async initializeVideoBlock() {
        const block = document.querySelector('.video-block:last-of-type');
        if (!block) return;
        const uploadBtn = block.querySelector('.media-upload');
        const urlBtn = block.querySelector('.media-url');
        const preview = block.querySelector('.media-preview');
        const caption = block.querySelector('.media-caption');

        const renderVideo = (src) => {
            preview.classList.remove('media-empty');
            preview.innerHTML = `<video class="ss-video" src="${src}" controls playsinline style="width:100%; max-height:520px; border-radius:10px; background:#000"></video>`;
        };

        uploadBtn.onclick = () => this.openMediaDialog('video', async (sel) => {
            if (sel.mode === 'upload' && sel.file) {
                // File size already checked in openMediaDialog
                const localUrl = URL.createObjectURL(sel.file);
                renderVideo(localUrl);
                try {
                    const info = await this.uploadFileToPage(sel.file);
                    const v = block.querySelector('video.ss-video');
                    if (v) {
                        console.log('Video file info received:', info);
                        
                        // Strategy 1: Try base64 data URL first (immediate display)
                        if (info.base64_data) {
                            console.log('Using base64 data URL for immediate video display');
                            v.src = info.base64_data;
                            v.onloadedmetadata = () => {
                                console.log('Base64 video loaded successfully');
                                // After base64 loads, try to switch to server URL for caching
                                setTimeout(() => {
                                    const serverUrl = this.normalizeUrl(info.file_url);
                                    console.log('Switching video to server URL:', serverUrl);
                                    const testVideo = document.createElement('video');
                                    testVideo.onloadedmetadata = () => {
                                        console.log('Server URL works, switching video');
                                        v.src = serverUrl;
                                    };
                                    testVideo.onerror = () => {
                                        console.log('Server URL failed, keeping base64 video');
                                    };
                                    testVideo.src = serverUrl;
                                }, 1000);
                            };
                        } else {
                            // Strategy 2: Use server URL directly
                            const videoUrl = this.normalizeUrl(info.file_url);
                            console.log('Setting video src to:', videoUrl);
                            v.src = videoUrl;
                            
                            v.onerror = () => {
                                console.error('Failed to load video:', videoUrl);
                                frappe.show_alert({message:'Failed to load uploaded video. File may be inaccessible.', indicator:'red'});
                            };
                            v.onloadedmetadata = () => {
                                console.log('Video loaded successfully:', videoUrl);
                            };
                        }
                    }
                    block.dataset.media = JSON.stringify({type:'video', file: info});
                    // Hide upload buttons after successful upload
                    this.hideMediaToolbar(block);
                    setTimeout(() => this.autoSavePage(), 200);
                } catch (error) {
                    console.error('Video upload error:', error);
                    frappe.show_alert({message:'Upload failed: ' + (error.message || 'Unknown error'), indicator:'red'});
                    // Revert to empty state on error
                    preview.classList.add('media-empty');
                    preview.innerHTML = 'Click Upload or Embed link';
                } finally {
                    setTimeout(() => URL.revokeObjectURL(localUrl), 2000);
                }
            } else if (sel.mode === 'url' && sel.url) {
                // Support YouTube/Vimeo oEmbed via native video if direct URL, else iframe
                if (/\.(mp4|webm|ogg)(\?|$)/i.test(sel.url)) {
                    renderVideo(sel.url);
                } else {
                    preview.classList.remove('media-empty');
                    preview.innerHTML = `<div class="video-embed"><iframe src="${sel.url}" frameborder="0" allowfullscreen style="width:100%; aspect-ratio:16/9; border-radius:10px; background:#000"></iframe></div>`;
                }
                block.dataset.media = JSON.stringify({type:'video', url: sel.url});
                // Hide upload buttons after successful URL addition
                this.hideMediaToolbar(block);
                setTimeout(() => this.autoSavePage(), 200);
            }
        });
        urlBtn.onclick = uploadBtn.onclick;

        if (caption) {
            caption.oninput = () => {
                const data = this.safeParse(block.dataset.media) || {type:'video'};
                data.caption = caption.value;
                block.dataset.media = JSON.stringify(data);
            };
        }
    }

    async promptForFile(accept) {
        return new Promise(resolve => {
            const inp = document.createElement('input');
            inp.type = 'file';
            if (accept) inp.accept = accept;
            inp.onchange = () => resolve(inp.files && inp.files[0]);
            inp.click();
        });
    }

    async uploadFileToPage(file) {
        // Strategy: Prefer frappe.client.attach_file (base64) for dev reliability, fall back to upload_file
        try {
            const dataUrl = await this.readFileAsDataURL(file);
            const base64 = dataUrl.split(',')[1] || dataUrl;
            const safeName = this.buildSafeFilename(file.name);
            const resp = await frappe.call({
                method: 'frappe.client.attach_file',
                args: {
                    doctype: 'SprintSpace Page',
                    docname: this.currentPage,
                    filename: safeName,
                    is_private: 0,
                    filedata: base64
                }
            });
            const msg = (resp && resp.message) || {};
            if (!msg || !msg.file_url) throw new Error('attach_file returned no file_url');
            return { 
                file_doc: msg.name, 
                file_url: msg.file_url, 
                filename: msg.file_name || safeName, 
                mime_type: msg.mimetype || file.type, 
                file_size: msg.file_size,
                base64_data: dataUrl // Include base64 for immediate display
            };
        } catch (e1) {
            // Fallback to upload_file with CSRF headers
            const fd = new FormData();
            fd.append('file', file);
            fd.append('doctype', 'SprintSpace Page');
            fd.append('docname', this.currentPage);
            fd.append('is_private', '1');
            const headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
            const csrf = this.getCsrfToken();
            if (csrf) headers['X-Frappe-CSRF-Token'] = csrf;
            const r = await fetch('/api/method/upload_file', { method: 'POST', body: fd, headers, credentials: 'same-origin' });
            if (!r.ok) throw new Error('upload_file failed: ' + r.status);
            const data = await r.json();
            const msg = data && data.message;
            if (!msg || !msg.file_url) throw new Error('upload_file returned no file_url');
            return { file_doc: msg.name, file_url: msg.file_url, filename: msg.file_name, mime_type: msg.mimetype, file_size: msg.file_size };
        }
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    buildSafeFilename(originalName) {
        try {
            const dot = originalName.lastIndexOf('.');
            const ext = dot > -1 ? originalName.slice(dot + 1).toLowerCase().slice(0, 8) : '';
            const rawBase = dot > -1 ? originalName.slice(0, dot) : originalName;
            const base = (rawBase || 'file')
                .toLowerCase()
                .replace(/[^a-z0-9-_]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 80);
            const suffix = Date.now().toString(36).slice(-6);
            const finalBase = base || 'file';
            return `${finalBase}-${suffix}${ext ? '.' + ext : ''}`;
        } catch (e) {
            return `file-${Date.now().toString(36)}.bin`;
        }
    }

    getCookieValue(name) {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }

    getCsrfToken() {
        return (window.frappe && frappe.csrf_token) || window.csrf_token || this.getCookieValue('csrf_token');
    }

    normalizeUrl(url) {
        if (!url) return url;
        
        // Make relative URLs absolute
        if (url.startsWith('/')) {
            const base = (window.frappe && frappe.urllib && frappe.urllib.get_base_url && frappe.urllib.get_base_url()) || window.location.origin;
            return base.replace(/\/$/, '') + url;
        }
        return url;
    }

    renderFilePreview(container, file, info, fallbackUrl = null) {
        container.classList.remove('media-empty');
        
        const fileType = file.type || info.mime_type || '';
        const fileName = info.filename || file.name || 'file';
        const fileSize = this.formatFileSize(info.file_size || file.size || 0);
        const fileUrl = fallbackUrl || info.base64_data || this.normalizeUrl(info.file_url);
        
        console.log('Rendering preview for file type:', fileType, 'name:', fileName);
        
        // Determine preview type based on file type
        if (fileType.startsWith('image/')) {
            // Image preview
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-image">
                        <img src="${fileUrl}" alt="${fileName}" style="max-width:100%; max-height:200px; border-radius:8px;">
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • Image</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Download</a>
                    </div>
                </div>
            `;
        } else if (fileType === 'application/pdf') {
            // PDF preview with embed
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-pdf">
                        <embed src="${fileUrl}" type="application/pdf" width="100%" height="300px" style="border-radius:8px;">
                        <div class="pdf-fallback" style="display:none; padding:20px; text-align:center; background:#f5f5f5; border-radius:8px;">
                            <i class="fa fa-file-pdf" style="font-size:48px; color:#e74c3c;"></i>
                            <p>PDF preview not available</p>
                        </div>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • PDF Document</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Open PDF</a>
                    </div>
                </div>
            `;
            
            // Handle PDF embed fallback
            const embed = container.querySelector('embed');
            const fallback = container.querySelector('.pdf-fallback');
            if (embed && fallback) {
                embed.onerror = () => {
                    embed.style.display = 'none';
                    fallback.style.display = 'block';
                };
            }
        } else if (fileType.startsWith('text/') || fileType === 'application/json' || fileName.match(/\.(txt|md|json|js|css|html|xml|csv)$/i)) {
            // Text file preview
            const icon = this.getFileIcon(fileType, fileName);
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-text">
                        <div class="text-preview-loading">Loading preview...</div>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • ${icon} Text Document</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Download</a>
                    </div>
                </div>
            `;
            
            // Load text content for preview
            this.loadTextPreview(container, fileUrl, fileType);
        } else if (fileType.startsWith('video/')) {
            // Video preview
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-video">
                        <video src="${fileUrl}" controls style="width:100%; max-height:300px; border-radius:8px;"></video>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • Video</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Download</a>
                    </div>
                </div>
            `;
        } else if (fileType.startsWith('audio/')) {
            // Audio preview
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-audio">
                        <audio src="${fileUrl}" controls style="width:100%;">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • Audio</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Download</a>
                    </div>
                </div>
            `;
        } else {
            // Generic file preview with icon
            const icon = this.getFileIcon(fileType, fileName);
            container.innerHTML = `
                <div class="file-preview-card">
                    <div class="file-preview-generic">
                        <div class="file-icon-large">${icon}</div>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-meta">${fileSize} • ${this.getFileTypeDescription(fileType, fileName)}</div>
                        <a href="${fileUrl}" target="_blank" class="file-download">Download</a>
                    </div>
                </div>
            `;
        }
    }

    async loadTextPreview(container, fileUrl, fileType) {
        try {
            const response = await fetch(fileUrl);
            const text = await response.text();
            const preview = container.querySelector('.file-preview-text');
            
            if (preview) {
                const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;
                preview.innerHTML = `
                    <pre style="margin:0; padding:15px; background:#f8f9fa; border-radius:8px; font-size:12px; line-height:1.4; overflow:auto; max-height:200px;">${this.escapeHtml(truncatedText)}</pre>
                `;
            }
        } catch (error) {
            console.error('Failed to load text preview:', error);
            const preview = container.querySelector('.file-preview-text');
            if (preview) {
                preview.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">Preview not available</div>`;
            }
        }
    }

    getFileIcon(fileType, fileName) {
        if (fileType.startsWith('image/')) return '🖼️';
        if (fileType.startsWith('video/')) return '🎥';
        if (fileType.startsWith('audio/')) return '🎵';
        if (fileType === 'application/pdf') return '📄';
        if (fileType.includes('word') || fileName.match(/\.docx?$/i)) return '📝';
        if (fileType.includes('excel') || fileName.match(/\.xlsx?$/i)) return '📊';
        if (fileType.includes('powerpoint') || fileName.match(/\.pptx?$/i)) return '📽️';
        if (fileType.includes('zip') || fileName.match(/\.(zip|rar|7z)$/i)) return '🗜️';
        if (fileType.startsWith('text/') || fileName.match(/\.(txt|md|json|js|css|html)$/i)) return '📝';
        return '📁';
    }

    getFileTypeDescription(fileType, fileName) {
        if (fileType.startsWith('image/')) return 'Image';
        if (fileType.startsWith('video/')) return 'Video';
        if (fileType.startsWith('audio/')) return 'Audio';
        if (fileType === 'application/pdf') return 'PDF Document';
        if (fileType.includes('word') || fileName.match(/\.docx?$/i)) return 'Word Document';
        if (fileType.includes('excel') || fileName.match(/\.xlsx?$/i)) return 'Excel Spreadsheet';
        if (fileType.includes('powerpoint') || fileName.match(/\.pptx?$/i)) return 'PowerPoint Presentation';
        if (fileType.includes('zip') || fileName.match(/\.(zip|rar|7z)$/i)) return 'Archive';
        if (fileType.startsWith('text/') || fileName.match(/\.(txt|md|json|js|css|html)$/i)) return 'Text File';
        return 'Document';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    fixPrivateFileUrls(container) {
        // Fix relative URLs to absolute URLs
        const images = container.querySelectorAll('img[src^="/"]');
        images.forEach(img => {
            const originalSrc = img.src;
            if (!originalSrc.startsWith('http')) {
                console.log('Fixing relative image URL:', originalSrc);
                img.src = this.normalizeUrl(originalSrc);
            }
        });
        
        // Fix relative video URLs
        const videos = container.querySelectorAll('video[src^="/"]');
        videos.forEach(video => {
            const originalSrc = video.src;
            if (!originalSrc.startsWith('http')) {
                console.log('Fixing relative video URL:', originalSrc);
                video.src = this.normalizeUrl(originalSrc);
            }
        });
        
        // Restore media block previews that may have lost base64 data during save
        this.restoreMediaBlockPreviews(container);
    }

    restoreMediaBlockPreviews(container) {
        const mediaBlocks = container.querySelectorAll('[data-media]');
        
        mediaBlocks.forEach(block => {
            try {
                const mediaData = JSON.parse(block.dataset.media);
                
                if (mediaData.file && mediaData.file.file_url && !mediaData.file.base64_data) {
                    console.log('Restoring preview for media block:', mediaData.file.filename);
                    
                    const preview = block.querySelector('.media-preview');
                    if (preview && preview.classList.contains('media-empty')) {
                        // Determine media type and recreate preview
                        if (mediaData.type === 'image') {
                            this.restoreImagePreview(preview, mediaData.file);
                        } else if (mediaData.type === 'video') {
                            this.restoreVideoPreview(preview, mediaData.file);
                        } else if (mediaData.type === 'file') {
                            this.restoreFilePreview(preview, mediaData.file);
                        }
                    }
                }
                
                // Hide toolbar for any block that has media content (regardless of restoration)
                if (mediaData.file || mediaData.url) {
                    this.hideMediaToolbar(block);
                }
            } catch (error) {
                console.warn('Failed to restore media preview:', error);
            }
        });
    }

    restoreImagePreview(container, fileInfo) {
        const imageUrl = this.normalizeUrl(fileInfo.file_url);
        container.classList.remove('media-empty');
        container.innerHTML = `<img src="${imageUrl}" alt="${fileInfo.filename || 'Image'}" style="max-width:100%; max-height:300px; border-radius:8px;">`;
    }

    restoreVideoPreview(container, fileInfo) {
        const videoUrl = this.normalizeUrl(fileInfo.file_url);
        container.classList.remove('media-empty');
        container.innerHTML = `<video src="${videoUrl}" controls style="width:100%; max-height:300px; border-radius:8px;"></video>`;
    }

    restoreFilePreview(container, fileInfo) {
        // Create a mock file object for renderFilePreview
        const mockFile = {
            type: fileInfo.mime_type || 'application/octet-stream',
            name: fileInfo.filename || 'file',
            size: fileInfo.file_size || 0
        };
        
        this.renderFilePreview(container, mockFile, fileInfo, this.normalizeUrl(fileInfo.file_url));
    }

    hideMediaToolbar(block) {
        const toolbar = block.querySelector('.media-toolbar');
        if (toolbar) {
            toolbar.style.display = 'none';
        }
    }

    showMediaToolbar(block) {
        const toolbar = block.querySelector('.media-toolbar');
        if (toolbar) {
            toolbar.style.display = 'flex';
        }
    }

    openMediaDialog(kind, onDone) {
        const titles = {
            image: 'Add an image',
            video: 'Upload or embed a video',
            file: 'Upload or embed a file',
            bookmark: 'Add a web bookmark'
        };
        const title = titles[kind] || 'Upload or embed a file';
        const html = `
            <div class="media-popover">
                <div class="mp-tabs">
                    <button class="mp-tab active" data-tab="upload">Upload</button>
                    <button class="mp-tab" data-tab="url">Embed link</button>
                </div>
                <div class="mp-pane" data-pane="upload">
                    <button class="mp-choose-file">Choose a file</button>
                </div>
                <div class="mp-pane hidden" data-pane="url">
                    <input type="text" class="mp-url" placeholder="Paste in https://..."/>
                    <button class="mp-create">Create</button>
                </div>
            </div>`;
        this.showModalHTML(title, html);
        const modalContent = document.getElementById('modal-content');
        const switchTab = (name) => {
            modalContent.querySelectorAll('.mp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
            modalContent.querySelectorAll('.mp-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
        };
        modalContent.querySelectorAll('.mp-tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
        const choose = modalContent.querySelector('.mp-choose-file');
        if (choose) choose.onclick = async () => {
            let accept = '*/*';
            if (kind === 'image') {
                accept = 'image/*';
            } else if (kind === 'video') {
                accept = 'video/mp4,video/webm,video/ogg';
            } else if (kind === 'file') {
                accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv';
            }
            const f = await this.promptForFile(accept);
            if (!f) return;
            
            // Check file size for videos before proceeding
            if (kind === 'video' && f.size > 50 * 1024 * 1024) {
                frappe.show_alert({message:'Video file too large. Please use a file smaller than 50MB.', indicator:'red'});
                return;
            }
            
            this.hideModal();
            onDone && onDone({mode:'upload', file:f});
        };
        const create = modalContent.querySelector('.mp-create');
        if (create) create.onclick = () => {
            const url = (modalContent.querySelector('.mp-url') || { value: '' }).value.trim();
            if (!url) return;
            this.hideModal();
            onDone && onDone({mode:'url', url});
        };
    }

    safeParse(s) {
        try { return JSON.parse(s || '{}'); } catch(e) { return {}; }
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
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideAssigneeModal()">Cancel</button>
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
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideAssigneeModal()">Cancel</button>
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
        // Check if this is an individual list item
        if (blockElement.classList.contains('bullet-item') || 
            blockElement.classList.contains('numbered-item') || 
            blockElement.classList.contains('checklist-item')) {
            this.showListItemMenu(event, blockElement);
            return;
        }
        
        // Hide any existing menu
        this.hideBlockMenu();
        
        const blockType = blockElement.dataset.blockType;
        const menu = document.createElement('div');
        menu.className = 'block-context-menu';
        menu.id = 'block-context-menu';
        
        menu.innerHTML = `
            <div class="menu-item" data-action="delete" data-block-id="${blockElement.id || Date.now()}">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
            <div class="menu-item" data-action="duplicate" data-block-id="${blockElement.id || Date.now()}">
                <span class="menu-icon">📄</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="convert" data-block-id="${blockElement.id || Date.now()}" data-convert-to="paragraph">
                <span class="menu-icon">¶</span>
                <span class="menu-text">Turn into Text</span>
            </div>
            <div class="menu-item" data-action="convert" data-block-id="${blockElement.id || Date.now()}" data-convert-to="heading">
                <span class="menu-icon">H</span>
                <span class="menu-text">Turn into Heading</span>
            </div>
            <div class="menu-item" data-action="convert" data-block-id="${blockElement.id || Date.now()}" data-convert-to="list">
                <span class="menu-icon">•</span>
                <span class="menu-text">Turn into List</span>
            </div>
            <div class="menu-item" data-action="convert" data-block-id="${blockElement.id || Date.now()}" data-convert-to="todolist">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Turn into Todo</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="move-up" data-block-id="${blockElement.id || Date.now()}">
                <span class="menu-icon">⬆️</span>
                <span class="menu-text">Move up</span>
            </div>
            <div class="menu-item" data-action="move-down" data-block-id="${blockElement.id || Date.now()}">
                <span class="menu-icon">⬇️</span>
                <span class="menu-text">Move down</span>
            </div>
        `;
        
        // Add event listeners to menu items
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuItem = e.target.closest('.menu-item');
            if (!menuItem) return;
            
            const action = menuItem.dataset.action;
            const blockId = menuItem.dataset.blockId;
            
            if (action === 'delete') {
                this.deleteBlock(blockId);
            } else if (action === 'duplicate') {
                this.duplicateBlock(blockId);
            } else if (action === 'convert') {
                const convertTo = menuItem.dataset.convertTo;
                this.convertBlock(blockId, convertTo);
            } else if (action === 'move-up') {
                this.moveBlockUp(blockId);
            } else if (action === 'move-down') {
                this.moveBlockDown(blockId);
            }
        });
        
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
        const containerId = assigneesContainer.closest('.todo-item, .kanban-task') ? assigneesContainer.closest('.todo-item, .kanban-task').id || 'temp-' + Date.now() : 'temp-' + Date.now();
        
        try {
            // Get company users
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users',
                args: { query: '' }
            });
            
            const users = response.message || [];
            const currentAssignees = Array.from(assigneesContainer.querySelectorAll('.assignee-tag')).map(tag => tag.dataset.user);
            
            const modalHtml = `
                <div class="assignee-selector-modal">
                    <div class="assignee-selector-header">
                        <h3>Select Assignees</h3>
                        <button class="btn-close" onclick="window.sprintSpaceApp.hideAssigneeModal()">×</button>
                    </div>
                    <div class="assignee-selector-content">
                        <div class="assignee-search">
                            <input type="text" id="assignee-search" placeholder="Search users..." onkeyup="window.sprintSpaceApp.filterAssignees(this.value)">
                        </div>
                        <div class="assignee-list" id="assignee-list">
                        ${users.map(user => `
                                <div class="assignee-option ${currentAssignees.includes(user.full_name) ? 'selected' : ''}" 
                                     data-user="${user.full_name}" 
                                     data-email="${user.email}"
                                     onclick="window.sprintSpaceApp.toggleAssignee('${containerId}', '${user.full_name}', '${user.email}')">
                                    <img src="${user.user_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&size=32&background=667eea&color=fff`}" 
                                         alt="${user.full_name}" class="assignee-option-avatar">
                                    <div class="assignee-option-info">
                                        <div class="assignee-option-name">${user.full_name}</div>
                                        <div class="assignee-option-email">${user.email}</div>
                                    </div>
                                    <div class="assignee-option-checkbox">
                                        <input type="checkbox" ${currentAssignees.includes(user.full_name) ? 'checked' : ''}>
                                    </div>
                            </div>
                        `).join('')}
                    </div>
                    </div>
                    <div class="assignee-selector-footer">
                        <button class="btn btn-primary" onclick="window.sprintSpaceApp.applyAssignees('${containerId}')">Apply</button>
                    </div>
                </div>
            `;
            
            this.showAssigneeModal('Select Assignees', modalHtml);
            
        } catch (error) {
            console.error('Error loading users:', error);
            frappe.show_alert({
                message: 'Failed to load users',
                indicator: 'red'
            });
        }
    }

    toggleAssignee(userOption, taskId) {
        const checkbox = userOption.querySelector('.user-checkbox');
        checkbox.checked = !checkbox.checked;
        userOption.classList.toggle('selected', checkbox.checked);
    }

    applyAssignees(taskId) {
        const selectedOptions = document.querySelectorAll('.assignee-option.selected');
        const assignees = Array.from(selectedOptions).map(option => option.dataset.user);
        
        const assigneesContainer = document.querySelector(`#${taskId} .todo-assignees, #${taskId} .task-assignees`);
        
        if (!assigneesContainer) {
            console.error('Assignees container not found for task:', taskId);
            return;
        }
        
        // Clear existing assignee tags
        assigneesContainer.querySelectorAll('.assignee-tag').forEach(tag => tag.remove());
        
        // Add new assignee tags
        assignees.forEach(assignee => {
            const assigneeTag = document.createElement('div');
            assigneeTag.className = 'assignee-tag';
            assigneeTag.dataset.user = assignee;
            assigneeTag.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee)}&size=24&background=667eea&color=fff" alt="${assignee}" class="assignee-avatar">
                <span class="assignee-name">${assignee}</span>
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
        
        // Don't close the modal - just update the button text briefly
        const applyBtn = document.querySelector('.btn-primary');
        if (applyBtn) {
            const originalText = applyBtn.textContent;
            applyBtn.textContent = '✓ Applied';
            applyBtn.style.background = '#10b981';
            setTimeout(() => {
                applyBtn.textContent = originalText;
                applyBtn.style.background = '';
            }, 1500);
        }
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
                        <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideAssigneeModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="window.sprintSpaceApp.applyKanbanAssignees()">Apply</button>
                    </div>
                </div>
            `;
            
            this.showAssigneeModal('Select Assignees', modalHtml);
            
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
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideAssigneeModal()">Cancel</button>
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
        
        // Clone the editor to manipulate without affecting the display
        const clonedEditor = this.editor.cloneNode(true);
        
        // Remove base64 data from media blocks to reduce size for saving
        this.stripBase64DataFromMediaBlocks(clonedEditor);
        
        // Extract calendar and gallery data from blocks
        this.extractBlockData(clonedEditor);
        
        const html = clonedEditor.innerHTML || '';
        return {
            time: Date.now(),
            blocks: [
                {
                    type: 'raw',
                    data: { html }
                }
            ],
            version: '2.30.7'
        };
    }

    extractBlockData(container) {
        // Extract calendar block data
        const calendarBlocks = container.querySelectorAll('.calendar-block');
        calendarBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            if (parentBlock && block.calendarData) {
                parentBlock.dataset.calendarData = JSON.stringify(block.calendarData);
            }
        });
        
        // Extract gallery block data
        const galleryBlocks = container.querySelectorAll('.gallery-block');
        galleryBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            if (parentBlock && block.galleryData) {
                parentBlock.dataset.galleryData = JSON.stringify(block.galleryData);
            }
        });

        // Extract timeline block data
        const timelineBlocks = container.querySelectorAll('.timeline-block');
        console.log('Extracting timeline data from blocks:', timelineBlocks.length);
        timelineBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            if (parentBlock && block.timelineData) {
                console.log('Saving timeline data:', block.timelineData);
                parentBlock.dataset.timelineData = JSON.stringify(block.timelineData);
            } else {
                console.log('No timeline data found in block:', block);
            }
        });
    }

    restoreBlockData(container) {
        // Restore calendar block data
        const calendarBlocks = container.querySelectorAll('.calendar-block');
        calendarBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            if (parentBlock && parentBlock.dataset.calendarData) {
                try {
                    block.calendarData = JSON.parse(parentBlock.dataset.calendarData);
                    console.log('Restored calendar data:', block.calendarData);
                    // Re-render the calendar with restored data
                    this.renderCalendar(block);
                } catch (error) {
                    console.warn('Failed to parse calendar data:', error);
                }
            }
        });
        
        // Restore gallery block data
        const galleryBlocks = container.querySelectorAll('.gallery-block');
        galleryBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            if (parentBlock && parentBlock.dataset.galleryData) {
                try {
                    block.galleryData = JSON.parse(parentBlock.dataset.galleryData);
                    console.log('Restored gallery data:', block.galleryData);
                    // Re-render the gallery with restored data
                    this.renderGallery(block);
                } catch (error) {
                    console.warn('Failed to parse gallery data:', error);
                }
            }
        });

        // Restore timeline block data
        const timelineBlocks = container.querySelectorAll('.timeline-block');
        console.log('Found timeline blocks to restore:', timelineBlocks.length);
        timelineBlocks.forEach(block => {
            const parentBlock = block.closest('.sprintspace-block');
            console.log('Parent block dataset:', parentBlock?.dataset);
            if (parentBlock && parentBlock.dataset.timelineData) {
                try {
                    block.timelineData = JSON.parse(parentBlock.dataset.timelineData);
                    console.log('Restored timeline data:', block.timelineData);
                    // Re-render the timeline with restored data
                    this.renderTimeline(block);
                } catch (error) {
                    console.warn('Failed to parse timeline data:', error);
                }
            } else {
                console.log('No timeline data found for block, initializing empty');
                block.timelineData = { pages: [] };
                this.renderTimeline(block);
            }
        });
    }

    stripBase64DataFromMediaBlocks(container) {
        // Find all media blocks with data-media attribute
        const mediaBlocks = container.querySelectorAll('[data-media]');
        
        mediaBlocks.forEach(block => {
            try {
                const mediaData = JSON.parse(block.dataset.media);
                
                // Remove base64_data but keep file info for restoration
                if (mediaData.file && mediaData.file.base64_data) {
                    console.log('Removing base64 data from media block for save:', mediaData.file.filename);
                    delete mediaData.file.base64_data;
                    block.dataset.media = JSON.stringify(mediaData);
                }
            } catch (error) {
                console.warn('Failed to parse media data:', error);
            }
        });
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
        // Use the unified settings form inside modal
        const html = window.SprintSpaceUI.renderVisibilityCollaboratorsForm({
            title: 'Workspace Settings',
            scope: 'workspace',
            record: { visibility: 'Private', collaborators: [] }
        });
        const formHtml = `
            <div class="form-group">
                <label>Workspace Title *</label>
                <input type="text" id="ws-title" placeholder="Enter title" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <input type="text" id="ws-desc" placeholder="Optional">
            </div>
            ${html}
        `;
        this.showModalHTML('Create New Workspace', formHtml);
        window.SprintSpaceUI.attachSettingsHandlers('workspace', null, 'create');
        // Wire save to create
        const saveBtn = document.getElementById('vs-save');
        if (saveBtn) {
            saveBtn.textContent = 'Create';
            saveBtn.onclick = async () => {
                const title = document.getElementById('ws-title').value || '';
                const description = document.getElementById('ws-desc').value || '';
                if (!title.trim()) { frappe.show_alert({message:'Title required', indicator:'red'}); return; }
                await this.createWorkspace(title, description);
            };
        }
    }

    showCreatePageModal() {
        const html = window.SprintSpaceUI.renderVisibilityCollaboratorsForm({
            title: 'Page Settings',
            scope: 'page',
            record: { visibility: 'Use Workspace', collaborators: [] }
        });
        const formHtml = `
            <div class="form-group">
                <label>Page Title *</label>
                <input type="text" id="pg-title" placeholder="Enter title" required>
            </div>
            ${html}
        `;
        this.showModalHTML('Create New Page', formHtml);
        window.SprintSpaceUI.attachSettingsHandlers('page', null, 'create');
        // Populate company users for the first collaborator row if present
        setTimeout(async () => {
            const firstSelect = document.querySelector('#vs-collab-rows .collab-user');
            if (firstSelect && window.SprintSpaceUI?.populateCompanyUsers) {
                await window.SprintSpaceUI.populateCompanyUsers(firstSelect);
            }
        }, 0);
        const saveBtn = document.getElementById('vs-save');
        if (saveBtn) {
            saveBtn.textContent = 'Create';
            saveBtn.onclick = async () => {
                const title = document.getElementById('pg-title').value || '';
                if (!title.trim()) { frappe.show_alert({message:'Title required', indicator:'red'}); return; }
                await this.createPage(title);
            };
        }
    }

    showModalHTML(title, html, options = {}) {
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
        const width = options.width || '90%';
        const maxWidth = options.maxWidth || '500px';
        modal.style.cssText = `
            background: white !important;
            border-radius: 12px !important;
            padding: 24px !important;
            width: ${width} !important;
            max-width: ${maxWidth} !important;
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

    showRightSideModal(title, html, options = {}) {
        console.log('showRightSideModal called with title:', title);
        
        // Hide any existing modal first
        this.hideModal();
        
        // Create right-side modal elements
        const overlay = document.createElement('div');
        overlay.id = 'right-modal-overlay';
        overlay.className = 'right-modal-overlay';
        
        const modal = document.createElement('div');
        modal.id = 'right-modal';
        modal.className = 'right-modal';
        
        const header = document.createElement('div');
        header.className = 'right-modal-header';
        
        const headerLeft = document.createElement('div');
        headerLeft.className = 'right-modal-header-left';
        
        const expandBtn = document.createElement('button');
        expandBtn.className = 'right-modal-expand';
        expandBtn.innerHTML = '⛶';
        expandBtn.title = 'Expand';
        expandBtn.onclick = () => this.toggleRightModalFullscreen();
        
        const titleEl = document.createElement('h1');
        titleEl.className = 'right-modal-title';
        titleEl.textContent = title;
        
        headerLeft.appendChild(expandBtn);
        headerLeft.appendChild(titleEl);
        
        const headerRight = document.createElement('div');
        headerRight.className = 'right-modal-header-right';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'right-modal-close';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close';
        closeBtn.onclick = () => this.hideModal();
        
        headerRight.appendChild(closeBtn);
        
        header.appendChild(headerLeft);
        header.appendChild(headerRight);
        
        const contentEl = document.createElement('div');
        contentEl.className = 'right-modal-content';
        contentEl.innerHTML = html;
        
        modal.appendChild(header);
        modal.appendChild(contentEl);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Show modal with slide-in animation
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        console.log('Right-side modal shown with HTML content');
    }

    toggleRightModalFullscreen() {
        const modal = document.getElementById('right-modal');
        if (modal) {
            modal.classList.toggle('fullscreen');
        }
    }

    showAssigneeModal(title, html) {
        console.log('showAssigneeModal called with title:', title);
        
        // Hide any existing assignee modal first (but not the right-side modal)
        const existingAssigneeModal = document.getElementById('assignee-modal-overlay');
        if (existingAssigneeModal) {
            existingAssigneeModal.remove();
        }
        
        // Create modal elements with custom IDs to avoid conflicts
        const overlay = document.createElement('div');
        overlay.id = 'assignee-modal-overlay';
        overlay.className = 'assignee-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999999;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        `;
        
        const modal = document.createElement('div');
        modal.id = 'assignee-modal';
        modal.className = 'assignee-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            width: 500px;
            max-width: 500px;
            margin: 16px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
            position: relative;
            z-index: 9999999;
            max-height: 90vh;
            overflow-y: auto;
        `;
        
        const titleEl = document.createElement('h2');
        titleEl.id = 'assignee-modal-title';
        titleEl.textContent = title;
        titleEl.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1f2937;
        `;
        
        const contentEl = document.createElement('div');
        contentEl.id = 'assignee-modal-content';
        contentEl.innerHTML = html;
        contentEl.style.cssText = `
            max-height: 70vh;
            overflow-y: auto;
        `;
        
        modal.appendChild(titleEl);
        modal.appendChild(contentEl);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Show modal with animation
        setTimeout(() => {
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '1';
        }, 10);
        
        console.log('Assignee modal shown with HTML content');
    }

    hideAssigneeModal() {
        console.log('hideAssigneeModal called');
        const assigneeModalOverlay = document.getElementById('assignee-modal-overlay');
        const assigneeModal = document.getElementById('assignee-modal');
        
        if (assigneeModalOverlay) {
            assigneeModalOverlay.style.visibility = 'hidden';
            assigneeModalOverlay.style.opacity = '0';
            setTimeout(() => {
                assigneeModalOverlay.remove();
            }, 300);
        }
        
        if (assigneeModal) {
            assigneeModal.remove();
        }
        
        console.log('Assignee modal hidden');
    }

    async showAssigneeSelector(containerId) {
        try {
            // Get company users
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users',
                args: { query: '' }
            });
            
            const users = response.message || [];
            const container = document.getElementById(containerId);
            const currentAssignees = Array.from(container.querySelectorAll('.assignee-tag')).map(tag => tag.dataset.user);
            
            const modalHtml = `
                <div class="assignee-selector-modal">
                    <div class="assignee-selector-header">
                        <h3>Select Assignees</h3>
                        <button class="btn-close" onclick="window.sprintSpaceApp.hideAssigneeModal()">×</button>
                    </div>
                    <div class="assignee-selector-content">
                        <div class="assignee-search">
                            <input type="text" id="assignee-search" placeholder="Search users..." onkeyup="window.sprintSpaceApp.filterAssignees(this.value)">
                        </div>
                        <div class="assignee-list" id="assignee-list">
                            ${users.map(user => `
                                <div class="assignee-option ${currentAssignees.includes(user.full_name) ? 'selected' : ''}" 
                                     data-user="${user.full_name}" 
                                     data-email="${user.email}"
                                     onclick="window.sprintSpaceApp.toggleAssignee('${containerId}', '${user.full_name}', '${user.email}')">
                                    <img src="${user.user_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&size=32&background=667eea&color=fff`}" 
                                         alt="${user.full_name}" class="assignee-option-avatar">
                                    <div class="assignee-option-info">
                                        <div class="assignee-option-name">${user.full_name}</div>
                                        <div class="assignee-option-email">${user.email}</div>
                                    </div>
                                    <div class="assignee-option-checkbox">
                                        <input type="checkbox" ${currentAssignees.includes(user.full_name) ? 'checked' : ''}>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="assignee-selector-footer">
                        <button class="btn btn-primary" onclick="window.sprintSpaceApp.applyAssignees('${containerId}')">Apply</button>
                    </div>
                </div>
            `;
            
            this.showAssigneeModal('Select Assignees', modalHtml);
            
        } catch (error) {
            console.error('Error loading users:', error);
            frappe.show_alert({
                message: 'Failed to load users',
                indicator: 'red'
            });
        }
    }

    filterAssignees(query) {
        const assigneeList = document.getElementById('assignee-list');
        const options = assigneeList.querySelectorAll('.assignee-option');
        
        options.forEach(option => {
            const name = option.querySelector('.assignee-option-name').textContent.toLowerCase();
            const email = option.querySelector('.assignee-option-email').textContent.toLowerCase();
            const searchQuery = query.toLowerCase();
            
            if (name.includes(searchQuery) || email.includes(searchQuery)) {
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    }

    toggleAssignee(containerId, userName, userEmail) {
        const option = document.querySelector(`[data-user="${userName}"]`);
        const checkbox = option.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
        option.classList.toggle('selected', checkbox.checked);
    }

    applyAssignees(containerId) {
        const selectedOptions = document.querySelectorAll('.assignee-option.selected');
        const assignees = Array.from(selectedOptions).map(option => option.dataset.user);
        
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        assignees.forEach(assignee => {
            const assigneeTag = document.createElement('span');
            assigneeTag.className = 'assignee-tag';
            assigneeTag.dataset.user = assignee;
            assigneeTag.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(assignee)}&size=20&background=667eea&color=fff" alt="${assignee}" class="assignee-avatar">
                <span class="assignee-name">${assignee}</span>
                <button class="assignee-remove" onclick="window.sprintSpaceApp.removeAssignee('${containerId}', '${assignee}')">×</button>
            `;
            container.appendChild(assigneeTag);
        });
        
        // Don't close the modal - just update the button text briefly
        const applyBtn = document.querySelector('.btn-primary');
        if (applyBtn) {
            const originalText = applyBtn.textContent;
            applyBtn.textContent = '✓ Applied';
            applyBtn.style.background = '#10b981';
            setTimeout(() => {
                applyBtn.textContent = originalText;
                applyBtn.style.background = '';
            }, 1500);
        }
    }

    removeAssignee(containerId, userName) {
        const container = document.getElementById(containerId);
        const assigneeTag = container.querySelector(`[data-user="${userName}"]`);
        if (assigneeTag) {
            assigneeTag.remove();
        }
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
                    <button type="button" class="btn btn-secondary" onclick="window.sprintSpaceApp.hideAssigneeModal()">
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
        const rightModalOverlay = document.getElementById('right-modal-overlay');
        const rightModal = document.getElementById('right-modal');
        const assigneeModalOverlay = document.getElementById('assignee-modal-overlay');
        const assigneeModal = document.getElementById('assignee-modal');
        
        if (modalOverlay) {
            modalOverlay.classList.remove('show');
            // Use cssText to completely reset all styles
            modalOverlay.style.cssText = 'display: none !important;';
        }
        
        if (modal) {
            // Use cssText to completely reset all styles
            modal.style.cssText = '';
        }
        
        if (rightModalOverlay) {
            rightModalOverlay.classList.remove('show');
            rightModalOverlay.remove();
        }
        
        if (rightModal) {
            rightModal.remove();
        }
        
        if (assigneeModalOverlay) {
            assigneeModalOverlay.style.visibility = 'hidden';
            assigneeModalOverlay.style.opacity = '0';
            setTimeout(() => {
                assigneeModalOverlay.remove();
            }, 300);
        }
        
        if (assigneeModal) {
            assigneeModal.remove();
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
        console.log('showBlockMenu called with block:', block);
        console.log('Block dataset:', block.dataset);
        
        event.preventDefault();
        event.stopPropagation();
        
        // Hide any existing menu
        this.hideBlockMenu();
        
        // Create menu
        const menu = document.createElement('div');
        menu.className = 'block-context-menu';
        menu.innerHTML = `
            <div class="menu-item" data-action="duplicate">
                <span class="menu-icon">📋</span>
                <span class="menu-text">Duplicate</span>
            </div>
            <div class="menu-item danger" data-action="delete">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete</span>
            </div>
        `;
        
        // Add event listeners to menu items
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuItem = e.target.closest('.menu-item');
            if (!menuItem) return;
            
            const action = menuItem.dataset.action;
            if (action === 'duplicate') {
                this.duplicateBlock(block.dataset.blockType, menuItem);
            } else if (action === 'delete') {
                this.deleteBlock(menuItem);
            }
        });
        
        // Position menu
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '99999999';
        
        // Store reference to the block
        menu.dataset.targetBlock = block.dataset.blockType;
        this.currentMenuBlock = block;
        
        // Add to page
        document.body.appendChild(menu);
        
        // Debug: Check if menu is visible
        console.log('Menu created and added to DOM:', menu);
        console.log('Menu position:', {
            top: menu.style.top,
            left: menu.style.left,
            zIndex: menu.style.zIndex,
            display: window.getComputedStyle(menu).display,
            visibility: window.getComputedStyle(menu).visibility
        });
        
        // Hide menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                // Don't hide if clicking on the menu itself
                if (!menu.contains(e.target)) {
                    this.hideBlockMenu();
                }
            }, { once: true });
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

    showListItemMenu(event, listItem) {
        // Hide any existing menu
        this.hideBlockMenu();
        
        const menu = document.createElement('div');
        menu.className = 'block-context-menu';
        menu.id = 'block-context-menu';
        
        menu.innerHTML = `
            <div class="menu-item" data-action="delete-item">
                <span class="menu-icon">🗑️</span>
                <span class="menu-text">Delete item</span>
            </div>
            <div class="menu-item" data-action="duplicate-item">
                <span class="menu-icon">📄</span>
                <span class="menu-text">Duplicate item</span>
            </div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="move-up-item">
                <span class="menu-icon">⬆️</span>
                <span class="menu-text">Move up</span>
            </div>
            <div class="menu-item" data-action="move-down-item">
                <span class="menu-icon">⬇️</span>
                <span class="menu-text">Move down</span>
            </div>
        `;
        
        // Add event listeners to menu items
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const menuItem = e.target.closest('.menu-item');
            if (!menuItem) return;
            
            const action = menuItem.dataset.action;
            this.handleListItemAction(action, listItem);
            this.hideBlockMenu();
        });
        
        // Position the menu
        const rect = listItem.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.top + window.scrollY}px`;
        menu.style.left = `${rect.right + window.scrollX + 10}px`;
        menu.style.zIndex = '999999';
        
        document.body.appendChild(menu);
        this.currentMenuBlock = listItem;
        
        // Hide menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                // Don't hide if clicking on the menu itself
                if (!menu.contains(e.target)) {
                    this.hideBlockMenu();
                }
            }, { once: true });
        }, 10);
    }

    handleListItemAction(action, listItem) {
        switch (action) {
            case 'delete-item':
                this.deleteListItem(listItem);
                break;
            case 'duplicate-item':
                this.duplicateListItem(listItem);
                break;
            case 'move-up-item':
                this.moveListItemUp(listItem);
                break;
            case 'move-down-item':
                this.moveListItemDown(listItem);
                break;
        }
    }

    deleteListItem(listItem) {
        const list = listItem.parentElement;
        listItem.remove();
        
        // If it's a numbered list, renumber the remaining items
        if (list.classList.contains('numbered-list')) {
            this.renumberListItems(list);
        }
        
        // If no items left, remove the entire list block
        if (list.children.length === 0) {
            const listBlock = list.closest('.sprintspace-block');
            if (listBlock) {
                listBlock.remove();
            }
        }
        
        this.autoSavePage();
        this.showToast('Item deleted', 'success');
    }

    duplicateListItem(listItem) {
        const list = listItem.parentElement;
        const newItem = listItem.cloneNode(true);
        
        // Clear content and add placeholder
        const contentElement = newItem.querySelector('.item-content, .cl-text');
        if (contentElement) {
            contentElement.textContent = '';
            contentElement.setAttribute('data-placeholder', 'New item');
        }
        
        // Insert after current item
        listItem.insertAdjacentElement('afterend', newItem);
        
        // If it's a numbered list, renumber all items
        if (list.classList.contains('numbered-list')) {
            this.renumberListItems(list);
        }
        
        // Focus on the new item
        setTimeout(() => {
            const contentElement = newItem.querySelector('.item-content, .cl-text');
            if (contentElement) {
                contentElement.focus();
            }
        }, 10);
        
        this.autoSavePage();
        this.showToast('Item duplicated', 'success');
    }

    moveListItemUp(listItem) {
        const list = listItem.parentElement;
        const prevItem = listItem.previousElementSibling;
        
        if (prevItem) {
            list.insertBefore(listItem, prevItem);
            
            // If it's a numbered list, renumber all items
            if (list.classList.contains('numbered-list')) {
                this.renumberListItems(list);
            }
            
            this.autoSavePage();
            this.showToast('Item moved up', 'success');
        }
    }

    moveListItemDown(listItem) {
        const list = listItem.parentElement;
        const nextItem = listItem.nextElementSibling;
        
        if (nextItem) {
            list.insertBefore(nextItem, listItem);
            
            // If it's a numbered list, renumber all items
            if (list.classList.contains('numbered-list')) {
                this.renumberListItems(list);
            }
            
            this.autoSavePage();
            this.showToast('Item moved down', 'success');
        }
    }

    deleteBlock(menuItem) {
        console.log('deleteBlock called with menuItem:', menuItem);
        console.log('currentMenuBlock:', this.currentMenuBlock);
        
        if (!this.currentMenuBlock) {
            console.error('No block selected for deletion');
            return;
        }
        
        const block = this.currentMenuBlock;
        
        // Special handling for numbered list items
        if (block.classList.contains('numbered-item')) {
            const listEl = block.closest('.numbered-list');
            if (listEl) {
                // Remove the item and renumber remaining items
                block.remove();
                this.renumberListItems(listEl);
                
                // If no items left, remove the entire list block
                if (listEl.children.length === 0) {
                    const listBlock = listEl.closest('.sprintspace-block');
                    if (listBlock) {
                        listBlock.remove();
                    }
                }
            }
        } else if (block.classList.contains('bullet-item')) {
            const listEl = block.closest('.bullet-list');
            if (listEl) {
                // Remove the item
                block.remove();
                
                // If no items left, remove the entire list block
                if (listEl.children.length === 0) {
                    const listBlock = listEl.closest('.sprintspace-block');
                    if (listBlock) {
                        listBlock.remove();
                    }
                }
            }
        } else {
            // Regular block deletion
            block.remove();
        }
        
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
        console.log('duplicateBlock called with blockType:', blockType, 'menuItem:', menuItem);
        console.log('currentMenuBlock:', this.currentMenuBlock);
        
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
                const isEmpty = e.target.textContent.trim() === '' || e.target.textContent.trim() === 'To-do' || e.target.textContent.trim() === 'Add a to-do item';
                if (wrapper && isEmpty) {
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
            const isEmpty = element.textContent.trim() === '' || element.textContent.trim() === 'To-do' || element.textContent.trim() === 'Add a to-do item';
            // Track consecutive Enters
            this._checklistEnterCount = (this._checklistEnterCount || 0) + 1;
            clearTimeout(this._checklistEnterResetTimer);
            this._checklistEnterResetTimer = setTimeout(() => { this._checklistEnterCount = 0; }, 600);
            // Double-Enter on empty exits checklist
            if (isEmpty && this._checklistEnterCount >= 2) {
                const para = this.createEmptyParagraphBlock();
                currentBlock.insertAdjacentElement('afterend', para);
                setTimeout(() => {
                    const p = para.querySelector('p[contenteditable="true"]');
                    if (p) p.focus();
                }, 10);
                this._checklistEnterCount = 0;
                return;
            }
            // If empty, remove the empty checklist item and create a new paragraph after the checklist block
            if (isEmpty) {
                // Remove the empty checklist item
                const emptyItem = element.closest('.checklist-item');
                if (emptyItem) {
                    emptyItem.remove();
                }
                
                // Create a new paragraph after the checklist block
                const para = this.createEmptyParagraphBlock();
                currentBlock.insertAdjacentElement('afterend', para);
                setTimeout(() => {
                    const p = para.querySelector('p[contenteditable="true"]');
                    if (p) p.focus();
                }, 10);
                this._checklistEnterCount = 0;
                return;
            }
            
            // Only add new checklist item if not empty
            this.addChecklistItem(checklist);
            this._checklistEnterCount = 0;
        }
    }

    addChecklistItem(checklist) {
        const newItemHtml = '<li class="checklist-item">' +
            '<div class="block-menu-wrapper">' +
                '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>' +
            '</div>' +
            '<input type="checkbox" onchange="this.closest(\'li\').classList.toggle(\'completed\', this.checked)">' + 
            '<div class="cl-text" contenteditable="true" data-placeholder="Add a to-do item"></div>' +
        '</li>';
        checklist.insertAdjacentHTML('beforeend', newItemHtml);
        setTimeout(() => {
            const textElement = checklist.lastElementChild.querySelector('.cl-text[contenteditable="true"]');
            if (textElement) {
                textElement.focus();
                const range = document.createRange();
                range.selectNodeContents(textElement);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }
            
            // Ensure the new item has a menu
            const newItem = checklist.lastElementChild;
            if (newItem) {
                this.ensureListItemMenuVisible(newItem);
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

    // ==================== LIST (UL/OL) FEATURES ====================

    initializeListFeatures() {
        const editor = document.getElementById('sprintspace-editor');
        if (!editor) return;
        // Remove prior handler if present
        editor.removeEventListener('keydown', this.listKeydownHandler);

        this.listKeydownHandler = (e) => {
            console.log('List keydown event triggered:', e.key, 'target:', e.target);
            
            // Skip checklists
            if (e.target && e.target.closest && e.target.closest('.checklist-list')) {
                console.log('Skipping checklist list');
                return;
            }

            // Find the LI element if caret is inside one
            let li = e.target && (e.target.closest ? e.target.closest('li') : null);
            console.log('Found li element:', li);
            
            // For numbered lists and bullet lists, also check if we're inside the item-content div
            if (!li && e.target && e.target.closest && e.target.closest('.item-content')) {
                li = e.target.closest('.numbered-item, .bullet-item');
                console.log('Found li via item-content:', li);
            }
            
            // Also check if we're inside a sprintspace-block that contains lists
            if (!li && e.target && e.target.closest && e.target.closest('.sprintspace-block[data-block-type="list"], .sprintspace-block[data-block-type="numbered"]')) {
                const block = e.target.closest('.sprintspace-block[data-block-type="list"], .sprintspace-block[data-block-type="numbered"]');
                const list = block.querySelector('ul, ol');
                if (list) {
                    // Find which list item the cursor is closest to
                    const range = window.getSelection().getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    li = container.closest ? container.closest('li') : null;
                    console.log('Found li via sprintspace-block:', li);
                }
            }
            
            // Additional fallback: check if we're typing in the main editor but there are list blocks
            if (!li) {
                const editor = document.getElementById('sprintspace-editor');
                if (editor && editor.contains(e.target)) {
                    // Look for any list items that might contain the cursor
                    const range = window.getSelection().getRangeAt(0);
                    const container = range.commonAncestorContainer;
                    
                    // Check if we're inside a list item
                    if (container && container.closest) {
                        li = container.closest('li.bullet-item, li.numbered-item');
                        console.log('Found li via cursor range:', li);
                    }
                    
                    // If still not found, check if we're in a list block
                    if (!li) {
                        const listBlocks = editor.querySelectorAll('.sprintspace-block[data-block-type="list"], .sprintspace-block[data-block-type="numbered"]');
                        for (let block of listBlocks) {
                            const listItems = block.querySelectorAll('li.bullet-item, li.numbered-item');
                            for (let item of listItems) {
                                if (item.contains(container) || item.contains(e.target)) {
                                    li = item;
                                    console.log('Found li via block traversal:', li);
                                    break;
                                }
                            }
                            if (li) break;
                        }
                    }
                }
            }
            
            if (!li) {
                console.log('No li element found, returning');
                return;
            }
            
            const parentList = li.parentElement;
            console.log('Parent list:', parentList, 'matches ul/ol:', parentList && parentList.matches('ul, ol'));
            
            if (!parentList || !(parentList.matches('ul, ol'))) {
                console.log('Parent is not a list, returning');
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                console.log('Enter key pressed, calling handleListEnter');
                e.preventDefault();
                this.handleListEnter(li);
            } else if (e.key === 'Backspace') {
                console.log('Backspace key pressed, calling handleListBackspace');
                this.handleListBackspace(e, li);
            }
        };
        editor.addEventListener('keydown', this.listKeydownHandler);
        console.log('Initialized list (UL/OL) features with event delegation');
    }

    handleListEnter(currentLi) {
        const listEl = currentLi.parentElement; // ul or ol
        if (!listEl) return;

        // For numbered lists and bullet lists, check the item-content div
        let isEmpty;
        if (currentLi.classList.contains('numbered-item') || currentLi.classList.contains('bullet-item')) {
            const contentDiv = currentLi.querySelector('.item-content');
            isEmpty = (contentDiv.textContent || '').trim() === '' || (contentDiv.innerHTML || '').trim() === '' || (contentDiv.innerHTML || '').trim() === '<br>';
        } else {
            isEmpty = (currentLi.textContent || '').trim() === '' || (currentLi.innerHTML || '').trim() === '' || (currentLi.innerHTML || '').trim() === '<br>';
        }

        // Special handling for numbered lists - create individual blocks
        if (listEl.classList.contains('numbered-list')) {
            if (isEmpty) {
                // Remove current item and renumber remaining items
                currentLi.remove();
                this.renumberListItems(listEl);
                
                // If no items left, remove the entire list block
                if (listEl.children.length === 0) {
                    const block = listEl.closest('.sprintspace-block');
                    const para = this.createEmptyParagraphBlock();
                    block.insertAdjacentElement('afterend', para);
                    block.remove();
                    setTimeout(() => para.querySelector('p[contenteditable="true"]').focus(), 0);
                } else {
                    // Focus on the next item or create a new paragraph after the list
                    const next = listEl.children[0];
                    if (next) {
                        setTimeout(() => {
                            const range = document.createRange();
                            range.selectNodeContents(next.querySelector('.item-content'));
                            range.collapse(true);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                            next.focus();
                        }, 0);
                    } else {
                        const afterPara = this.createEmptyParagraphBlock();
                        const listBlock = listEl.closest('.sprintspace-block');
                        if (listBlock) listBlock.insertAdjacentElement('afterend', afterPara);
                        setTimeout(() => afterPara.querySelector('p[contenteditable="true"]').focus(), 0);
                    }
                }
                return;
            } else {
                // Create new numbered list item
                console.log('Creating new numbered list item from handleListEnter');
                this.createNumberedListItem(listEl, currentLi);
                return;
            }
        }

        // Special handling for bullet lists - create individual blocks
        console.log('List element classes:', listEl.className);
        if (listEl.classList.contains('bullet-list')) {
            console.log('Handling bullet list item, isEmpty:', isEmpty);
            if (isEmpty) {
                // Remove current item
                currentLi.remove();
                
                // If no items left, remove the entire list block
                if (listEl.children.length === 0) {
                    const block = listEl.closest('.sprintspace-block');
                    const para = this.createEmptyParagraphBlock();
                    block.insertAdjacentElement('afterend', para);
                    block.remove();
                    setTimeout(() => para.querySelector('p[contenteditable="true"]').focus(), 0);
                } else {
                    // Focus on the next item or create a new paragraph after the list
                    const next = listEl.children[0];
                    if (next) {
                        setTimeout(() => {
                            const range = document.createRange();
                            range.selectNodeContents(next.querySelector('.item-content'));
                            range.collapse(true);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                            next.focus();
                        }, 0);
                    } else {
                        const afterPara = this.createEmptyParagraphBlock();
                        const listBlock = listEl.closest('.sprintspace-block');
                        if (listBlock) listBlock.insertAdjacentElement('afterend', afterPara);
                        setTimeout(() => afterPara.querySelector('p[contenteditable="true"]').focus(), 0);
                    }
                }
                return;
            } else {
                // Create new bullet list item
                console.log('Creating new bullet list item from handleListEnter');
                this.createBulletListItem(listEl, currentLi);
                return;
            }
        }

        // Regular list handling (bulleted lists)
        if (isEmpty) {
            const block = currentLi.closest('.sprintspace-block');
            if (block) {
                // If it is the only LI, remove the list block entirely
                if (listEl.children.length === 1) {
                    const para = this.createEmptyParagraphBlock();
                    block.insertAdjacentElement('afterend', para);
                    block.remove();
                    setTimeout(() => para.querySelector('p[contenteditable="true"]').focus(), 0);
                } else {
                    // Otherwise remove this LI and place caret in the next LI or create paragraph after list
                    const next = currentLi.nextElementSibling;
                    currentLi.remove();
                    if (next) {
                        setTimeout(() => {
                            const range = document.createRange();
                            range.selectNodeContents(next);
                            range.collapse(true);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                            next.focus();
                        }, 0);
                    } else {
                        const afterPara = this.createEmptyParagraphBlock();
                        const listBlock = listEl.closest('.sprintspace-block');
                        if (listBlock) listBlock.insertAdjacentElement('afterend', afterPara);
                        setTimeout(() => afterPara.querySelector('p[contenteditable="true"]').focus(), 0);
                    }
                }
                return;
            }
        }

        // Default behavior: create new list item after current
        const newLi = document.createElement('li');
        newLi.setAttribute('contenteditable', 'true');
        newLi.innerHTML = '';
        currentLi.insertAdjacentElement('afterend', newLi);

        // Move caret to new li
        setTimeout(() => {
            const range = document.createRange();
            range.selectNodeContents(newLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            newLi.focus();
        }, 0);
    }

    handleListBackspace(e, currentLi) {
        const listEl = currentLi.parentElement;
        if (!listEl) return;
        
        // For numbered lists and bullet lists, check the item-content div
        let isEmpty;
        if (currentLi.classList.contains('numbered-item') || currentLi.classList.contains('bullet-item')) {
            const contentDiv = currentLi.querySelector('.item-content');
            isEmpty = (contentDiv.textContent || '').trim() === '' || (contentDiv.innerHTML || '').trim() === '' || (contentDiv.innerHTML || '').trim() === '<br>';
        } else {
            isEmpty = (currentLi.textContent || '').trim() === '' || (currentLi.innerHTML || '').trim() === '' || (currentLi.innerHTML || '').trim() === '<br>';
        }

        if (!isEmpty) return; // allow normal backspace inside content

        e.preventDefault();

        const prev = currentLi.previousElementSibling;
        if (prev) {
            // Remove current and focus previous
            currentLi.remove();
            setTimeout(() => {
                const focusEl = prev;
                const range = document.createRange();
                range.selectNodeContents(focusEl);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                focusEl.focus();
            }, 0);
            return;
        }

        // First item empty: exit list (replace entire list block with paragraph)
        const block = currentLi.closest('.sprintspace-block');
        if (block) {
            const para = this.createEmptyParagraphBlock();
            block.insertAdjacentElement('afterend', para);
            block.remove();
            setTimeout(() => {
                const p = para.querySelector('p[contenteditable="true"]');
                if (p) p.focus();
            }, 0);
        }
    }

    createEmptyParagraphBlock() {
        const para = document.createElement('div');
        para.className = 'sprintspace-block';
        para.setAttribute('data-block-type', 'paragraph');
        para.innerHTML = `
            <div class="block-menu-wrapper">
                <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
            </div>
            <p contenteditable="true"><br></p>
        `;
        return para;
    }

    createNumberedListItem(listEl, currentLi) {
        console.log('=== createNumberedListItem called ===');
        console.log('Creating numbered list item, current listEl:', listEl);
        // Get the current item number
        const currentNumber = parseInt(currentLi.dataset.itemNumber) || 1;
        const nextNumber = currentNumber + 1;
        
        // Create new numbered list item with individual block menu
        const newLi = document.createElement('li');
        newLi.className = 'numbered-item';
        newLi.setAttribute('contenteditable', 'true');
        newLi.setAttribute('data-item-number', nextNumber);
        newLi.innerHTML = `
            <div class="block-menu-wrapper">
                <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
            </div>
            <div class="item-content"></div>
        `;
        
        // Insert after current item
        currentLi.insertAdjacentElement('afterend', newLi);
        
        // Force the menu to be visible
        const menuWrapper = newLi.querySelector('.block-menu-wrapper');
        if (menuWrapper) {
            menuWrapper.style.opacity = '1';
            menuWrapper.style.visibility = 'visible';
            menuWrapper.style.display = 'flex';
            menuWrapper.style.position = 'absolute';
            menuWrapper.style.left = '-32px';
            menuWrapper.style.top = '2px';
            menuWrapper.style.zIndex = '10';
            console.log('Numbered item menu made visible');
        } else {
            console.error('Numbered item menu not found!');
        }
        
        // Renumber all items
        this.renumberListItems(listEl);
        
        // Focus on new item and ensure menu is visible
        setTimeout(() => {
            const range = document.createRange();
            range.selectNodeContents(newLi.querySelector('.item-content'));
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            newLi.focus();
            
            // Ensure the new item's menu is visible
            console.log('Ensuring menu for new numbered item:', newLi);
            console.log('New numbered item HTML before menu ensure:', newLi.outerHTML);
            this.ensureListItemMenuVisible(newLi);
            console.log('New numbered item HTML after menu ensure:', newLi.outerHTML);
            
            // Also ensure all list items in the list have menus
            const allItems = listEl.querySelectorAll('.numbered-item');
            console.log('Ensuring menus for all numbered items:', allItems.length);
            allItems.forEach(item => this.ensureListItemMenuVisible(item));
            
            // Run again after a longer delay to ensure menus are visible
            setTimeout(() => {
                console.log('Second pass - ensuring numbered item menus');
                allItems.forEach(item => this.ensureListItemMenuVisible(item));
            }, 100);
        }, 0);
    }

    renumberListItems(listEl) {
        const items = listEl.querySelectorAll('.numbered-item');
        items.forEach((item, index) => {
            const newNumber = index + 1;
            item.setAttribute('data-item-number', newNumber);
            // Update the visual number if needed (CSS can handle this with counter-reset)
        });
    }

    createBulletListItem(listEl, currentLi) {
        console.log('=== createBulletListItem called ===');
        console.log('Creating bullet list item, current listEl:', listEl);
        // Create new bullet list item with individual block menu
        const newLi = document.createElement('li');
        newLi.className = 'bullet-item';
        newLi.setAttribute('contenteditable', 'true');
        newLi.setAttribute('data-item-id', Date.now());
        newLi.innerHTML = `
            <div class="block-menu-wrapper">
                <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
            </div>
            <div class="item-content"></div>
        `;
        
        console.log('Created new bullet item HTML:', newLi.outerHTML);
        
        // Insert after current item
        currentLi.insertAdjacentElement('afterend', newLi);
        
        // Force the menu to be visible
        const menuWrapper = newLi.querySelector('.block-menu-wrapper');
        if (menuWrapper) {
            menuWrapper.style.opacity = '1';
            menuWrapper.style.visibility = 'visible';
            menuWrapper.style.display = 'flex';
            menuWrapper.style.position = 'absolute';
            menuWrapper.style.left = '-32px';
            menuWrapper.style.top = '2px';
            menuWrapper.style.zIndex = '10';
            console.log('Bullet item menu made visible');
        } else {
            console.error('Bullet item menu not found!');
        }
        
        console.log('List after insertion, children count:', listEl.children.length);
        
        // Focus on new item and ensure menu is visible
        setTimeout(() => {
            const range = document.createRange();
            range.selectNodeContents(newLi.querySelector('.item-content'));
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            newLi.focus();
            
            // Ensure the new item's menu is visible
            console.log('Ensuring menu for new bullet item:', newLi);
            console.log('New bullet item HTML before menu ensure:', newLi.outerHTML);
            this.ensureListItemMenuVisible(newLi);
            console.log('New bullet item HTML after menu ensure:', newLi.outerHTML);
            
            // Also ensure all list items in the list have menus
            const allItems = listEl.querySelectorAll('.bullet-item');
            console.log('Ensuring menus for all bullet items:', allItems.length);
            allItems.forEach(item => this.ensureListItemMenuVisible(item));
            
            // Run again after a longer delay to ensure menus are visible
            setTimeout(() => {
                console.log('Second pass - ensuring bullet item menus');
                allItems.forEach(item => this.ensureListItemMenuVisible(item));
            }, 100);
        }, 0);
    }

    convertExistingListItems(editor) {
        console.log('=== CONVERTING EXISTING LIST ITEMS ===');
        console.log('Editor HTML before conversion:', editor.innerHTML);
        
        // Find ALL lists regardless of their current classes
        const allLists = editor.querySelectorAll('ul, ol');
        console.log('Found all lists:', allLists.length);
        
        if (allLists.length === 0) {
            console.log('No lists found to convert');
            return;
        }
        
        allLists.forEach((list, listIndex) => {
            console.log(`\n--- List ${listIndex + 1} ---`);
            console.log('Tag:', list.tagName);
            console.log('Classes:', list.className);
            console.log('HTML:', list.outerHTML);
            
            // Handle checklist lists differently
            if (list.classList.contains('checklist-list')) {
                console.log('Converting checklist list');
                const items = list.querySelectorAll('.checklist-item');
                console.log('Found checklist items:', items.length);
                items.forEach((item, index) => {
                    this.ensureListItemMenu(item, 'checklist-item', index);
                });
                return;
            }
            
            // Determine list type
            const isNumbered = list.tagName === 'OL';
            const itemClass = isNumbered ? 'numbered-item' : 'bullet-item';
            const listClass = isNumbered ? 'numbered-list' : 'bullet-list';
            
            console.log(`Converting ${isNumbered ? 'numbered' : 'bullet'} list to ${listClass}`);
            
            // Update list class
            list.className = listClass;
            
            // Convert each list item
            const items = list.querySelectorAll('li');
            console.log(`Found ${items.length} list items to convert`);
            
            items.forEach((item, index) => {
                console.log(`\nConverting item ${index + 1}:`);
                console.log('Original content:', item.textContent.trim());
                console.log('Original HTML:', item.outerHTML);
                
                // Get the text content
                const textContent = item.textContent || item.innerText || '';
                
                // Update item class and attributes
                item.className = itemClass;
                if (isNumbered) {
                    item.setAttribute('data-item-number', index + 1);
                } else {
                    item.setAttribute('data-item-id', Date.now() + index);
                }
                
                // Replace content with new structure
                item.innerHTML = `
                    <div class="block-menu-wrapper">
                        <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                    </div>
                    <div class="item-content">${textContent}</div>
                `;
                
                console.log('New HTML:', item.outerHTML);
                
                // Ensure menu is visible
                this.ensureListItemMenu(item, itemClass, index);
            });
        });
        
        console.log('\n=== CONVERSION COMPLETE ===');
        console.log('Editor HTML after conversion:', editor.innerHTML);
        
        // Final verification
        this.verifyListMenus(editor);
    }

    ensureListItemMenu(item, itemClass, index) {
        console.log(`Ensuring menu for ${itemClass} item ${index + 1}`);
        
        // Clean up any existing menus first
        const existingMenus = item.querySelectorAll('.block-menu-wrapper');
        existingMenus.forEach(menu => menu.remove());
        
        // Add menu if it doesn't exist
        let menuWrapper = item.querySelector('.block-menu-wrapper');
        if (!menuWrapper) {
            menuWrapper = document.createElement('div');
            menuWrapper.className = 'block-menu-wrapper';
            menuWrapper.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
            item.insertBefore(menuWrapper, item.firstChild);
        }
        
        // Force visibility with aggressive styling
        menuWrapper.style.cssText = `
            position: absolute !important;
            left: -32px !important;
            top: 2px !important;
            opacity: 1 !important;
            visibility: visible !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 20px !important;
            height: 20px !important;
            z-index: 10 !important;
            background: rgba(255, 0, 0, 0.1) !important;
        `;
        
        // Also style the button
        const button = menuWrapper.querySelector('.block-menu-btn');
        if (button) {
            button.style.cssText = `
                width: 20px !important;
                height: 20px !important;
                border: none !important;
                background: transparent !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 3px !important;
                color: #6b7280 !important;
                font-size: 14px !important;
                opacity: 1 !important;
                visibility: visible !important;
            `;
        }
        
        console.log(`Menu ensured for ${itemClass} item ${index + 1}`);
    }

    verifyListMenus(editor) {
        console.log('\n=== VERIFYING LIST MENUS ===');
        const allListItems = editor.querySelectorAll('.bullet-item, .numbered-item, .checklist-item');
        console.log(`Found ${allListItems.length} list items to verify`);
        
        allListItems.forEach((item, index) => {
            const menu = item.querySelector('.block-menu-wrapper');
            const button = menu?.querySelector('.block-menu-btn');
            
            console.log(`\nItem ${index + 1}:`);
            console.log('- Has menu wrapper:', !!menu);
            console.log('- Has menu button:', !!button);
            console.log('- Menu visible:', menu ? window.getComputedStyle(menu).opacity : 'N/A');
            console.log('- Menu display:', menu ? window.getComputedStyle(menu).display : 'N/A');
            console.log('- Menu position:', menu ? window.getComputedStyle(menu).position : 'N/A');
            
            if (menu) {
                const rect = menu.getBoundingClientRect();
                console.log('- Menu rect:', rect);
            }
        });
    }

    // Method to manually force list conversion (for debugging)
    forceListConversion() {
        console.log('=== MANUAL LIST CONVERSION ===');
        const editor = document.getElementById('sprintspace-editor');
        if (editor) {
            this.convertExistingListItems(editor);
            this.forceListMenuVisibility();
        }
    }

    forceListMenuVisibility() {
        console.log('Forcing list menu visibility...');
        
        // Force all list item menus to be visible temporarily to test
        const allListItems = document.querySelectorAll('.numbered-item, .bullet-item, .checklist-item');
        console.log('Found list items to force visibility:', allListItems.length);
        
        allListItems.forEach((item, index) => {
            const menu = item.querySelector('.block-menu-wrapper');
            if (menu) {
                console.log(`Item ${index + 1} has menu, making it visible`);
                menu.style.opacity = '1';
                menu.style.visibility = 'visible';
                menu.style.display = 'flex';
            } else {
                console.log(`Item ${index + 1} missing menu, adding one`);
                // Add menu if missing
                const menuWrapper = document.createElement('div');
                menuWrapper.className = 'block-menu-wrapper';
                menuWrapper.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
                item.insertBefore(menuWrapper, item.firstChild);
            }
        });
        
        // Also handle checklists separately
        const checklistItems = document.querySelectorAll('.checklist-item');
        console.log('Found checklist items for force visibility:', checklistItems.length);
        checklistItems.forEach((item, index) => {
            const menu = item.querySelector('.block-menu-wrapper');
            if (menu) {
                console.log(`Checklist item ${index + 1} has menu, making it visible`);
                menu.style.opacity = '1';
                menu.style.visibility = 'visible';
                menu.style.display = 'flex';
            } else {
                console.log(`Checklist item ${index + 1} missing menu, adding one`);
                const menuWrapper = document.createElement('div');
                menuWrapper.className = 'block-menu-wrapper';
                menuWrapper.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
                item.insertBefore(menuWrapper, item.firstChild);
                console.log(`Added menu to checklist item ${index + 1}`);
            }
        });
        
        console.log('List menu visibility forced');
    }

    forceChecklistMenuVisibility() {
        console.log('Forcing checklist menu visibility specifically...');
        
        // Find all checklist items and ensure they have menus
        const checklistItems = document.querySelectorAll('.checklist-item');
        console.log('Found checklist items:', checklistItems.length);
        
        checklistItems.forEach((item, index) => {
            console.log(`Processing checklist item ${index + 1}:`, item.textContent.trim());
            
            // Remove any existing menu first
            const existingMenu = item.querySelector('.block-menu-wrapper');
            if (existingMenu) {
                existingMenu.remove();
            }
            
            // Create new menu
            const menuWrapper = document.createElement('div');
            menuWrapper.className = 'block-menu-wrapper';
            menuWrapper.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
            
            // Insert at the beginning of the item
            item.insertBefore(menuWrapper, item.firstChild);
            
            // Force visibility immediately
            menuWrapper.style.opacity = '1';
            menuWrapper.style.visibility = 'visible';
            menuWrapper.style.display = 'flex';
            menuWrapper.style.position = 'absolute';
            menuWrapper.style.left = '-35px';
            menuWrapper.style.top = '2px';
            menuWrapper.style.zIndex = '10';
            
            console.log(`Added menu to checklist item ${index + 1}`);
        });
        
        // Also try to find checklist items in a different way
        const allLists = document.querySelectorAll('.checklist-list');
        console.log('Found checklist lists:', allLists.length);
        
        allLists.forEach((list, listIndex) => {
            const items = list.querySelectorAll('li.checklist-item');
            console.log(`List ${listIndex + 1} has ${items.length} checklist items`);
            
            items.forEach((item, index) => {
                console.log(`Processing list ${listIndex + 1}, item ${index + 1}`);
                
                // Force add menu if missing
                let menu = item.querySelector('.block-menu-wrapper');
                if (!menu) {
                    console.log(`Adding menu to list ${listIndex + 1}, item ${index + 1}`);
                    const menuWrapper = document.createElement('div');
                    menuWrapper.className = 'block-menu-wrapper';
                    menuWrapper.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
                    item.insertBefore(menuWrapper, item.firstChild);
                }
                
                // Force visibility
                menu = item.querySelector('.block-menu-wrapper');
                if (menu) {
                    menu.style.opacity = '1';
                    menu.style.visibility = 'visible';
                    menu.style.display = 'flex';
                    menu.style.position = 'absolute';
                    menu.style.left = '-35px';
                    menu.style.top = '2px';
                    menu.style.zIndex = '10';
                }
            });
        });
        
        console.log('Checklist menu visibility forced');
    }

    makeAllChecklistMenusVisible() {
        console.log('Making all checklist menus visible...');
        
        // Find all checklist items
        const checklistItems = document.querySelectorAll('.checklist-item');
        console.log('Found checklist items:', checklistItems.length);
        
        checklistItems.forEach((item, index) => {
            console.log(`Making checklist item ${index + 1} menu visible`);
            
            // Find or create menu
            let menu = item.querySelector('.block-menu-wrapper');
            if (!menu) {
                console.log(`Creating menu for checklist item ${index + 1}`);
                menu = document.createElement('div');
                menu.className = 'block-menu-wrapper';
                menu.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
                item.insertBefore(menu, item.firstChild);
            }
            
            // Force visibility with !important styles
            menu.style.setProperty('opacity', '1', 'important');
            menu.style.setProperty('visibility', 'visible', 'important');
            menu.style.setProperty('display', 'flex', 'important');
            menu.style.setProperty('position', 'absolute', 'important');
            menu.style.setProperty('left', '-32px', 'important');
            menu.style.setProperty('top', '50%', 'important');
            menu.style.setProperty('transform', 'translateY(-50%)', 'important');
            menu.style.setProperty('z-index', '10', 'important');
            
            // Also force the button visibility
            const button = menu.querySelector('.block-menu-btn');
            if (button) {
                button.style.setProperty('opacity', '1', 'important');
                button.style.setProperty('visibility', 'visible', 'important');
                button.style.setProperty('display', 'flex', 'important');
            }
            
            console.log(`Checklist item ${index + 1} menu made visible`);
        });
        
        console.log('All checklist menus made visible');
    }

    ensureChecklistMenus(checklistBlock) {
        console.log('Ensuring checklist menus for block:', checklistBlock);
        
        const checklistItems = checklistBlock.querySelectorAll('.checklist-item');
        console.log('Found checklist items to ensure menus:', checklistItems.length);
        
        checklistItems.forEach((item, index) => {
            let menu = item.querySelector('.block-menu-wrapper');
            if (!menu) {
                console.log(`Adding menu to checklist item ${index + 1}`);
                menu = document.createElement('div');
                menu.className = 'block-menu-wrapper';
                menu.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
                item.insertBefore(menu, item.firstChild);
            }
            
            // Force visibility
            menu.style.setProperty('opacity', '1', 'important');
            menu.style.setProperty('visibility', 'visible', 'important');
            menu.style.setProperty('display', 'flex', 'important');
            menu.style.setProperty('position', 'absolute', 'important');
            menu.style.setProperty('left', '-32px', 'important');
            menu.style.setProperty('top', '50%', 'important');
            menu.style.setProperty('transform', 'translateY(-50%)', 'important');
            menu.style.setProperty('z-index', '10', 'important');
        });
        
        console.log('Checklist menus ensured');
    }

    ensureListItemMenuVisible(listItem) {
        console.log('Ensuring menu visibility for list item:', listItem);
        console.log('List item classes:', listItem.className);
        console.log('List item HTML:', listItem.outerHTML);
        
        // Clean up any existing menus first to prevent nesting
        const existingMenus = listItem.querySelectorAll('.block-menu-wrapper');
        if (existingMenus.length > 1) {
            console.log('Found multiple menus, cleaning up...');
            existingMenus.forEach((menu, index) => {
                if (index > 0) { // Keep only the first one
                    menu.remove();
                }
            });
        }
        
        let menu = listItem.querySelector('.block-menu-wrapper');
        if (menu) {
            console.log('Found existing menu, making it visible');
            // Force visibility with !important styles
            menu.style.setProperty('opacity', '1', 'important');
            menu.style.setProperty('visibility', 'visible', 'important');
            menu.style.setProperty('display', 'flex', 'important');
            menu.style.setProperty('position', 'absolute', 'important');
            menu.style.setProperty('left', '-32px', 'important');
            menu.style.setProperty('z-index', '10', 'important');
            
            // Set appropriate top positioning based on item type
            if (listItem.classList.contains('checklist-item')) {
                menu.style.setProperty('top', '50%', 'important');
                menu.style.setProperty('transform', 'translateY(-50%)', 'important');
            } else {
                menu.style.setProperty('top', '2px', 'important');
            }
            
            console.log('Menu made visible for list item');
        } else {
            console.log('No menu found for list item, creating one');
            // Create menu if it doesn't exist
            const newMenu = document.createElement('div');
            newMenu.className = 'block-menu-wrapper';
            newMenu.innerHTML = '<button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>';
            listItem.insertBefore(newMenu, listItem.firstChild);
            
            // Force visibility
            newMenu.style.setProperty('opacity', '1', 'important');
            newMenu.style.setProperty('visibility', 'visible', 'important');
            newMenu.style.setProperty('display', 'flex', 'important');
            newMenu.style.setProperty('position', 'absolute', 'important');
            newMenu.style.setProperty('left', '-32px', 'important');
            newMenu.style.setProperty('z-index', '10', 'important');
            
            if (listItem.classList.contains('checklist-item')) {
                newMenu.style.setProperty('top', '50%', 'important');
                newMenu.style.setProperty('transform', 'translateY(-50%)', 'important');
            } else {
                newMenu.style.setProperty('top', '2px', 'important');
            }
            
            console.log('Created and made visible new menu for list item');
        }
        
        // Double-check that the menu is actually visible
        setTimeout(() => {
            const finalMenu = listItem.querySelector('.block-menu-wrapper');
            if (finalMenu) {
                console.log('Final check - menu exists:', finalMenu);
                console.log('Final check - menu computed styles:', {
                    opacity: getComputedStyle(finalMenu).opacity,
                    visibility: getComputedStyle(finalMenu).visibility,
                    display: getComputedStyle(finalMenu).display,
                    position: getComputedStyle(finalMenu).position,
                    left: getComputedStyle(finalMenu).left,
                    top: getComputedStyle(finalMenu).top
                });
            } else {
                console.log('Final check - NO MENU FOUND!');
            }
        }, 50);
    }

    ensureAllListItemsHaveMenus() {
        console.log('Ensuring all list items have visible menus...');
        
        // Find all list items
        const allListItems = document.querySelectorAll('.bullet-item, .numbered-item, .checklist-item');
        console.log('Found list items to ensure menus:', allListItems.length);
        
        allListItems.forEach((item, index) => {
            console.log(`Processing list item ${index + 1}:`, item.className);
            this.ensureListItemMenuVisible(item);
        });
        
        console.log('All list items processed for menu visibility');
    }

    // ==================== MENTION FEATURES ====================

    initializeMentionFeatures() {
        const editor = document.getElementById('sprintspace-editor');
        if (!editor) return;
        
        console.log('Initializing mention features...');
        
        // Remove any existing mention handlers
        editor.removeEventListener('input', this.mentionInputHandler);
        editor.removeEventListener('keydown', this.mentionKeydownHandler);
        
        // Set up mention input handler
        this.mentionInputHandler = (e) => {
            this.handleMentionInput(e);
        };
        
        // Set up mention keydown handler
        this.mentionKeydownHandler = (e) => {
            this.handleMentionKeydown(e);
            // Also check for @ on keydown
            if (e.key === '@' || e.key === 'Shift' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(() => this.checkForMention(), 10);
            }
        };
        
        // Add event listeners
        editor.addEventListener('input', this.mentionInputHandler);
        editor.addEventListener('keydown', this.mentionKeydownHandler);
        editor.addEventListener('keyup', (e) => {
            if (e.key === '@' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(() => this.checkForMention(), 10);
            }
        });
        
        console.log('Mention features initialized');
        
        // Add debug function to window for testing
        window.debugMentions = () => {
            console.log('Debug mentions - current state:', this.mentionState);
            console.log('Editor element:', this.editor);
            console.log('Editor content:', this.editor ? this.editor.innerHTML : 'No editor');
            this.checkForMention();
        };
    }

    checkForMention() {
        console.log('Checking for mention...');
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            console.log('No selection range in checkForMention');
            return;
        }
        
        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;
        
        // Get the text content from the current position
        let text = '';
        let cursorPos = 0;
        
        if (textNode.nodeType === Node.TEXT_NODE) {
            text = textNode.textContent;
            cursorPos = range.startOffset;
        } else {
            // If we're in an element, get the text content and find cursor position
            const textContent = textNode.textContent || '';
            text = textContent;
            // Try to estimate cursor position
            cursorPos = textContent.length;
        }
        
        console.log('CheckForMention - Text:', text, 'Cursor:', cursorPos);
        
        // Look for @ mention pattern
        const mentionMatch = this.findMentionPattern(text, cursorPos);
        
        if (mentionMatch) {
            console.log('Mention pattern found in checkForMention:', mentionMatch);
            this.showMentionMenu(mentionMatch.query, range);
        } else {
            console.log('No mention pattern found in checkForMention');
            this.hideMentionMenu();
        }
    }

    handleMentionInput(e) {
        console.log('Mention input handler triggered');
        const editor = e.target;
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            console.log('No selection range');
            return;
        }
        
        const range = selection.getRangeAt(0);
        let textNode = range.startContainer;
        
        // If we're not in a text node, find the nearest text node
        if (textNode.nodeType !== Node.TEXT_NODE) {
            // Look for text content in the current element or its children
            const textContent = textNode.textContent || '';
            if (textContent.includes('@')) {
                // Create a temporary text node for processing
                const tempTextNode = document.createTextNode(textContent);
                textNode = tempTextNode;
            } else {
                console.log('No @ symbol found in current element');
                return;
            }
        }
        
        const text = textNode.textContent;
        const cursorPos = range.startOffset;
        
        console.log('Text content:', text, 'Cursor position:', cursorPos);
        
        // Look for @ mention pattern
        const mentionMatch = this.findMentionPattern(text, cursorPos);
        
        if (mentionMatch) {
            console.log('Mention pattern found:', mentionMatch);
            this.showMentionMenu(mentionMatch.query, range);
        } else {
            console.log('No mention pattern found');
            this.hideMentionMenu();
        }
    }

    findMentionPattern(text, cursorPos) {
        console.log('Finding mention pattern in text:', text, 'at position:', cursorPos);
        
        // Look backwards from cursor for @ symbol
        let start = cursorPos - 1;
        while (start >= 0 && text[start] !== '@' && text[start] !== ' ' && text[start] !== '\n') {
            start--;
        }
        
        if (start < 0 || text[start] !== '@') {
            console.log('No @ symbol found before cursor');
            return null;
        }
        
        // Extract the query after @
        const query = text.substring(start + 1, cursorPos);
        console.log('Extracted query:', query);
        
        // Show menu even for empty query (just @)
        return {
            start: start,
            end: cursorPos,
            query: query
        };
    }

    async showMentionMenu(query, range) {
        try {
            console.log('Showing mention menu for query:', query);
            // Search for users
            const response = await frappe.call({
                method: 'sprintspace.sprintspace.doctype.sprintspace_page.sprintspace_page.search_company_users',
                args: { query: query || '' }
            });
            
            const users = response.message || [];
            console.log('Found users:', users.length);
            
            if (users.length === 0) {
                console.log('No users found, hiding menu');
                this.hideMentionMenu();
                return;
            }
            
            // Update mention state
            this.mentionState.isShowingMentions = true;
            this.mentionState.mentionQuery = query;
            this.mentionState.mentionPosition = range;
            this.mentionState.mentionUsers = users;
            this.mentionState.selectedMentionIndex = 0;
            
            // Create or update mention menu
            this.renderMentionMenu(users, range);
            
        } catch (error) {
            console.error('Error searching users for mentions:', error);
            this.hideMentionMenu();
        }
    }

    renderMentionMenu(users, range) {
        // Remove existing mention menu
        this.hideMentionMenu();
        
        // Create mention menu element
        const mentionMenu = document.createElement('div');
        mentionMenu.id = 'sprintspace-mention-menu';
        mentionMenu.className = 'sprintspace-mention-menu';
        mentionMenu.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            max-height: 200px;
            overflow-y: auto;
            min-width: 200px;
        `;
        
        // Add user options
        users.forEach((user, index) => {
            const userOption = document.createElement('div');
            userOption.className = 'mention-option';
            userOption.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid #f3f4f6;
            `;
            
            if (index === 0) {
                userOption.style.backgroundColor = '#f0f9ff';
            }
            
            // User avatar
            const avatar = document.createElement('div');
            avatar.style.cssText = `
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 500;
                color: #6b7280;
            `;
            
            if (user.image_url) {
                avatar.style.backgroundImage = `url(${user.image_url})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
            } else {
                avatar.textContent = (user.full_name || user.name || 'U').charAt(0).toUpperCase();
            }
            
            // User info
            const userInfo = document.createElement('div');
            userInfo.style.cssText = `
                display: flex;
                flex-direction: column;
                min-width: 0;
            `;
            
            const userName = document.createElement('div');
            userName.style.cssText = `
                font-weight: 500;
                color: #1f2937;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            userName.textContent = user.full_name || user.name;
            
            const userEmail = document.createElement('div');
            userEmail.style.cssText = `
                color: #6b7280;
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            userEmail.textContent = user.email;
            
            userInfo.appendChild(userName);
            userInfo.appendChild(userEmail);
            
            userOption.appendChild(avatar);
            userOption.appendChild(userInfo);
            
            // Add click handler
            userOption.addEventListener('click', () => {
                this.selectMention(user, range);
            });
            
            // Add hover handler
            userOption.addEventListener('mouseenter', () => {
                // Remove previous selection
                mentionMenu.querySelectorAll('.mention-option').forEach(opt => {
                    opt.style.backgroundColor = '';
                });
                // Add selection to current option
                userOption.style.backgroundColor = '#f0f9ff';
                this.mentionState.selectedMentionIndex = index;
            });
            
            mentionMenu.appendChild(userOption);
        });
        
        // Position the menu
        const rect = range.getBoundingClientRect();
        const editorRect = document.getElementById('sprintspace-editor').getBoundingClientRect();
        
        mentionMenu.style.left = `${rect.left - editorRect.left}px`;
        mentionMenu.style.top = `${rect.bottom - editorRect.top + 5}px`;
        
        // Add to editor
        document.getElementById('sprintspace-editor').appendChild(mentionMenu);
    }

    handleMentionKeydown(e) {
        if (!this.mentionState.isShowingMentions) return;
        
        const mentionMenu = document.getElementById('sprintspace-mention-menu');
        if (!mentionMenu) return;
        
        const options = mentionMenu.querySelectorAll('.mention-option');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.mentionState.selectedMentionIndex = Math.min(
                    this.mentionState.selectedMentionIndex + 1,
                    options.length - 1
                );
                this.updateMentionSelection();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.mentionState.selectedMentionIndex = Math.max(
                    this.mentionState.selectedMentionIndex - 1,
                    0
                );
                this.updateMentionSelection();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.mentionState.mentionUsers[this.mentionState.selectedMentionIndex]) {
                    this.selectMention(
                        this.mentionState.mentionUsers[this.mentionState.selectedMentionIndex],
                        this.mentionState.mentionPosition
                    );
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.hideMentionMenu();
                break;
        }
    }

    updateMentionSelection() {
        const mentionMenu = document.getElementById('sprintspace-mention-menu');
        if (!mentionMenu) return;
        
        const options = mentionMenu.querySelectorAll('.mention-option');
        options.forEach((option, index) => {
            if (index === this.mentionState.selectedMentionIndex) {
                option.style.backgroundColor = '#f0f9ff';
            } else {
                option.style.backgroundColor = '';
            }
        });
    }

    selectMention(user, range) {
        console.log('Selecting mention for user:', user);
        
        // Create mention element
        const mentionElement = document.createElement('span');
        mentionElement.className = 'mention';
        mentionElement.style.cssText = `
            background: #e0e7ff;
            color: #4f46e5;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 500;
            font-size: 14px;
        `;
        mentionElement.textContent = `@${user.full_name || user.name}`;
        mentionElement.setAttribute('data-user-id', user.name);
        mentionElement.setAttribute('data-user-name', user.full_name || user.name);
        mentionElement.setAttribute('data-user-email', user.email);
        
        // Get the current text content and cursor position
        const textNode = range.startContainer;
        const text = textNode.textContent;
        const cursorPos = range.startOffset;
        
        // Find the @ symbol and everything after it to replace
        let start = cursorPos - 1;
        while (start >= 0 && text[start] !== '@' && text[start] !== ' ' && text[start] !== '\n') {
            start--;
        }
        
        if (start >= 0 && text[start] === '@') {
            // Create a new range that includes the @ and everything after it
            const newRange = document.createRange();
            newRange.setStart(textNode, start);
            newRange.setEnd(textNode, cursorPos);
            
            // Replace the entire @query with the mention element
            newRange.deleteContents();
            newRange.insertNode(mentionElement);
            
            // Add space after mention
            const spaceNode = document.createTextNode(' ');
            newRange.setStartAfter(mentionElement);
            newRange.insertNode(spaceNode);
            
            // Move cursor after the space
            newRange.setStartAfter(spaceNode);
            newRange.setEndAfter(spaceNode);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // Fallback: just insert the mention at current position
            range.deleteContents();
            range.insertNode(mentionElement);
            
            // Add space after mention
            const spaceNode = document.createTextNode(' ');
            range.setStartAfter(mentionElement);
            range.insertNode(spaceNode);
            
            // Move cursor after the space
            range.setStartAfter(spaceNode);
            range.setEndAfter(spaceNode);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // Hide mention menu
        this.hideMentionMenu();
        
        // Trigger auto-save
        setTimeout(() => {
            this.autoSavePage();
        }, 100);
        
        console.log('Mention inserted successfully');
    }

    hideMentionMenu() {
        const mentionMenu = document.getElementById('sprintspace-mention-menu');
        if (mentionMenu) {
            mentionMenu.remove();
        }
        
        this.mentionState.isShowingMentions = false;
        this.mentionState.mentionQuery = '';
        this.mentionState.mentionPosition = null;
        this.mentionState.mentionUsers = [];
        this.mentionState.selectedMentionIndex = 0;
    }
}

// Export for global access
window.SprintSpaceWorkspaceApp = SprintSpaceWorkspaceApp;

// Make debugging methods available globally
window.forceListConversion = () => {
    if (window.sprintSpaceApp) {
        window.sprintSpaceApp.forceListConversion();
    } else {
        console.error('SprintSpace app not initialized');
    }
};

window.testListCreation = () => {
    if (window.sprintSpaceApp) {
        const editor = document.getElementById('sprintspace-editor');
        if (editor) {
            // Create a test bullet list
            const testList = document.createElement('ul');
            testList.className = 'bullet-list';
            testList.innerHTML = `
                <li class="bullet-item" data-item-id="test1">
                    <div class="block-menu-wrapper">
                        <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                    </div>
                    <div class="item-content">Test bullet item 1</div>
                </li>
                <li class="bullet-item" data-item-id="test2">
                    <div class="block-menu-wrapper">
                        <button class="block-menu-btn" onclick="event.stopPropagation(); window.sprintSpaceApp.showBlockMenu(event, this.parentElement.parentElement)">⋮</button>
                    </div>
                    <div class="item-content">Test bullet item 2</div>
                </li>
            `;
            
            // Add to editor
            editor.appendChild(testList);
            
            // Force menu visibility
            window.sprintSpaceApp.forceListMenuVisibility();
            
            console.log('Test list created and added to editor');
        }
    } else {
        console.error('SprintSpace app not initialized');
    }
};