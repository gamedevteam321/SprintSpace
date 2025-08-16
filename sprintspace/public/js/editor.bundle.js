(function() {
  'use strict';
  
  // Utility functions
  function loadScript(src) {
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
  }

  function loadCSS(href) {
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function showError(message) {
    frappe.show_alert({
      message: message,
      indicator: 'red'
    });
  }

  function showSuccess(message) {
    frappe.show_alert({
      message: message,
      indicator: 'green'
    });
  }

  // Kanban configuration
  const kanbanConfig = {
    taskDoctype: "Task",
    projectField: "project",
    statusField: "status",
    statuses: ["Backlog", "To Do", "In Progress", "Review", "Done"],
    linkMode: "by_title" // will be auto-updated to by_name if sprintspace_project exists
  };

  // Dynamically derive link field and statuses from Task meta
  let __kanbanConfigured = false;
  async function configureKanbanFromMeta() {
    if (__kanbanConfigured) return;
    try {
      const meta = await frappe.call({
        method: "frappe.client.get_meta",
        args: { doctype: kanbanConfig.taskDoctype }
      });
      const fields = (meta && meta.message && meta.message.fields) || [];
      if (fields.some(f => f.fieldname === "sprintspace_project")) {
        kanbanConfig.projectField = "sprintspace_project";
        kanbanConfig.linkMode = "by_name";
      }
      const statusFieldMeta = fields.find(f => f.fieldname === kanbanConfig.statusField);
      if (statusFieldMeta && statusFieldMeta.options) {
        const opts = String(statusFieldMeta.options).split("\n").map(s => s.trim()).filter(Boolean);
        if (opts.length) kanbanConfig.statuses = opts;
      }
    } catch (e) {
      console.warn("Kanban meta config fallback:", e);
    } finally {
      __kanbanConfigured = true;
    }
  }

  // Custom Kanban Tool for Editor.js
  class SprintSpaceKanbanTool {
    static get toolbox() {
      return {
        title: 'Kanban Board',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="6" height="16" rx="2"></rect><rect x="15" y="4" width="6" height="10" rx="2"></rect></svg>'
      };
    }

    constructor({data}) {
      this.data = data || {};
      this.wrapper = null;
    }

    render() {
      this.wrapper = document.createElement('div');
      this.wrapper.classList.add('kanban-wrap');
      this.wrapper.innerHTML = '<div class="kanban-loading">Loading kanban board...</div>';
      
      // Load kanban data after a short delay to ensure the element is in DOM
      setTimeout(() => {
        this.loadAndRender();
      }, 100);
      
      return this.wrapper;
    }

    async loadAndRender() {
      await configureKanbanFromMeta();
      if (!cur_frm || !cur_frm.doc) {
        this.showError('No project context available');
        return;
      }

      const projectKey = (kanbanConfig.linkMode === "by_title") ? cur_frm.doc.title : cur_frm.doc.name;
      
      if (!projectKey) {
        this.showError('Please save the project first');
        return;
      }

      try {
        const response = await frappe.call({
          method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.get_tasks_for_project",
          args: { 
            project_name: projectKey, 
            project_field: kanbanConfig.projectField, 
            status_field: kanbanConfig.statusField 
          }
        });

        const tasksByStatus = response.message || {};
        this.renderKanban(tasksByStatus, projectKey);

      } catch (error) {
        console.error('Error loading kanban:', error);
        this.showError('Failed to load kanban board. Check permissions.');
      }
    }

    renderKanban(tasksByStatus, projectKey) {
      this.wrapper.innerHTML = "";

      kanbanConfig.statuses.forEach(status => {
        const column = this.createColumn(status, tasksByStatus[status] || []);
        this.wrapper.appendChild(column);
      });

      // Add drag and drop event listeners
      this.setupDragAndDrop();
      
      // Add button to create sample tasks if no tasks exist
      if (Object.keys(tasksByStatus).length === 0 || 
          Object.values(tasksByStatus).every(tasks => tasks.length === 0)) {
        this.addSampleTasksButton(projectKey);
      }
    }

    createColumn(status, tasks) {
      const column = document.createElement('div');
      column.className = 'kanban-col';
      column.dataset.status = status;

      const header = document.createElement('h4');
      header.textContent = `${status} (${tasks.length})`;
      column.appendChild(header);

      const list = document.createElement('div');
      list.className = 'kanban-list';

      if (tasks.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No tasks';
        list.appendChild(emptyState);
      } else {
        tasks.forEach(task => {
          const card = this.createTaskCard(task);
          list.appendChild(card);
        });
      }

      column.appendChild(list);
      return column;
    }

    createTaskCard(task) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      card.dataset.name = task.name;

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = task.subject || task.name;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        <span>${task.owner || 'Unassigned'}</span>
        <span>${task.exp_end_date ? frappe.datetime.str_to_user(task.exp_end_date) : ''}</span>
      `;

      card.appendChild(title);
      card.appendChild(meta);

      return card;
    }

    setupDragAndDrop() {
      // Drag start
      this.wrapper.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('kanban-card')) {
          e.target.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      // Drag end
      this.wrapper.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('kanban-card')) {
          e.target.classList.remove('dragging');
        }
        // Remove drag-over class from all columns
        this.wrapper.querySelectorAll('.kanban-col').forEach(col => {
          col.classList.remove('drag-over');
        });
      });

      // Drag over
      this.wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        const column = e.target.closest('.kanban-col');
        if (column) {
          // Remove drag-over from all columns first
          this.wrapper.querySelectorAll('.kanban-col').forEach(col => {
            col.classList.remove('drag-over');
          });
          column.classList.add('drag-over');
        }
      });

      // Drop
      this.wrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        const column = e.target.closest('.kanban-col');
        const draggingCard = this.wrapper.querySelector('.kanban-card.dragging');

        if (column && draggingCard) {
          const newStatus = column.dataset.status;
          const taskName = draggingCard.dataset.name;
          const list = column.querySelector('.kanban-list');

          // Remove empty state if it exists
          const emptyState = list.querySelector('.empty-state');
          if (emptyState) {
            emptyState.remove();
          }

          // Move the card visually
          list.appendChild(draggingCard);

          // Update the status in the backend
          try {
            await frappe.call({
              method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.update_task_status",
              args: { 
                task_name: taskName, 
                new_status: newStatus, 
                status_field: kanbanConfig.statusField 
              }
            });

            showSuccess(`Moved ${taskName} → ${newStatus}`);
            
            // Update column headers with new counts
            this.updateColumnCounts();

          } catch (error) {
            console.error('Error updating task status:', error);
            showError('Failed to update task status');
            // Reload the kanban to revert the visual change
            this.loadAndRender();
          }
        }

        // Clean up drag-over class
        this.wrapper.querySelectorAll('.kanban-col').forEach(col => {
          col.classList.remove('drag-over');
        });
      });
    }

    updateColumnCounts() {
      this.wrapper.querySelectorAll('.kanban-col').forEach(column => {
        const status = column.dataset.status;
        const taskCount = column.querySelectorAll('.kanban-card').length;
        const header = column.querySelector('h4');
        header.textContent = `${status} (${taskCount})`;
      });
    }

    addSampleTasksButton(projectKey) {
      const buttonContainer = document.createElement('div');
      buttonContainer.style.textAlign = 'center';
      buttonContainer.style.padding = '20px';

      const button = document.createElement('button');
      button.textContent = 'Create Sample Tasks';
      button.className = 'btn btn-sm btn-primary';
      button.onclick = async () => {
        try {
          button.disabled = true;
          button.textContent = 'Creating...';

          await frappe.call({
            method: "sprintspace.sprintspace.doctype.sprintspace_project.sprintspace_project.create_sample_tasks",
            args: { project_name: projectKey }
          });

          showSuccess('Sample tasks created successfully!');
          this.loadAndRender(); // Reload the kanban

        } catch (error) {
          console.error('Error creating sample tasks:', error);
          showError('Failed to create sample tasks');
          button.disabled = false;
          button.textContent = 'Create Sample Tasks';
        }
      };

      buttonContainer.appendChild(button);
      this.wrapper.appendChild(buttonContainer);
    }

    showError(message) {
      this.wrapper.innerHTML = `<div class="kanban-error">${message}</div>`;
    }

    save() {
      return {
        type: 'kanban',
        timestamp: Date.now()
      };
    }
  }

  // Main editor initialization function
  async function initSprintSpaceEditor(frm) {
    if (frm.__sprintspace_editor_inited) return;
    frm.__sprintspace_editor_inited = true;

    if (!frm.fields_dict.content_json) return;

    const $wrapper = frm.fields_dict.content_json.$wrapper;
    $wrapper.empty();

    // Add toolbar hint
    const hint = $(`
      <div class="sprintspace-toolbar-hint">
        <span class="sprintspace-brand">SprintSpace</span> • 
        Type <b>/</b> for commands (text, header, checklist, table, image, divider, kanban)
      </div>
    `);
    $wrapper.append(hint);

    // Add editor container
    const editorContainer = $(`
      <div class="editor-holder sprintspace-canvas">
        <div id="sprintspace-editorjs-holder"></div>
      </div>
    `);
    $wrapper.append(editorContainer);

    // Load CSS
    loadCSS("/assets/sprintspace/css/editor.css");

    try {
      // Load Editor.js and plugins
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.30.7/dist/editorjs.umd.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/checklist@1.6.0/dist/checklist.umd.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/table@2.4.1/dist/table.umd.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/simple-image@1.6.0/dist/bundle.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@editorjs/delimiter@1.4.0/dist/bundle.min.js");

      // Parse existing content
      let data = {};
      try {
        data = frm.doc.content_json ? JSON.parse(frm.doc.content_json) : {};
      } catch(e) {
        console.warn('Invalid JSON in content_json field:', e);
        data = {};
      }

      // Initialize Editor.js
      let __saveDebounce;
      const editor = new EditorJS({
        holder: "sprintspace-editorjs-holder",
        autofocus: true,
        placeholder: "Type '/' for commands or start writing...",
        tools: {
          header: Header,
          checklist: Checklist,
          table: Table,
          image: SimpleImage,
          delimiter: Delimiter,
          kanban: SprintSpaceKanbanTool
        },
        data: (data && data.blocks) ? data : {
          time: Date.now(),
          blocks: [{
            type: 'header',
            data: {
              text: frm.doc.title || 'Untitled Project',
              level: 2
            }
          }]
        },
        onChange: async () => {
          clearTimeout(__saveDebounce);
          __saveDebounce = setTimeout(async () => {
            try {
              const output = await editor.save();
              frm.set_value('content_json', JSON.stringify(output));
            } catch (error) {
              console.error('Error saving editor content:', error);
            }
          }, 400);
        }
      });

      // Store editor instance for potential future use
      frm.sprintspace_editor = editor;

    } catch (error) {
      console.error('Error initializing SprintSpace editor:', error);
      $wrapper.html(`
        <div class="kanban-error">
          Failed to load SprintSpace editor. Please check your internet connection and try refreshing the page.
        </div>
      `);
    }
  }

  // Form event handlers
  frappe.ui.form.on("Sprintspace Project", {
    refresh: function(frm) {
      initSprintSpaceEditor(frm);
    },

    onload: function(frm) {
      // Set default content if new document
      if (frm.is_new() && !frm.doc.content_json) {
        const defaultContent = {
          time: Date.now(),
          blocks: [
            {
              type: 'header',
              data: {
                text: frm.doc.title || 'New Project',
                level: 2
              }
            },
            {
              type: 'paragraph',
              data: {
                text: 'Welcome to SprintSpace! Type / to add blocks or use the kanban board to manage your tasks.'
              }
            }
          ]
        };
        frm.set_value('content_json', JSON.stringify(defaultContent));
      }
    }
  });

})();
