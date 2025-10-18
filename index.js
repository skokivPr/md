// --- CONSTANTS & STATE ---
const FILE_STORAGE_KEY = 'monaco-markdown-files';
const AppState = {
    files: [],
    activeFileId: null,
};
let editor; // Monaco editor instance
let saveStatusTimeout;
let hasUnsavedChanges = false;
let autoSaveInterval;

// --- LOCALSTORAGE TESTING ---
const testLocalStorage = () => {
    try {
        const testKey = 'localStorage-test';
        const testValue = 'test-value-' + Date.now();

        // Test write
        localStorage.setItem(testKey, testValue);

        // Test read
        const readValue = localStorage.getItem(testKey);

        // Test remove
        localStorage.removeItem(testKey);

        if (readValue === testValue) {
            console.log('✅ localStorage is working correctly');
            return true;
        } else {
            console.error('❌ localStorage read/write test failed');
            return false;
        }
    } catch (error) {
        console.error('❌ localStorage is not available:', error);
        return false;
    }
};


// --- DOM ELEMENTS CACHE ---
const dom = {
    appContainer: document.getElementById('app-container'),
    sidebar: document.getElementById('sidebar'),
    fileList: document.getElementById('file-list'),
    editorContainer: document.getElementById('editor-container'),
    preview: document.getElementById('markdown-preview'),
    newFileBtn: document.getElementById('new-file-btn'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    activeFileName: document.getElementById('active-file-name'),
    wordCount: document.getElementById('word-count'),
    saveStatus: document.getElementById('save-status'),
    toolbar: document.querySelector('.markdown-toolbar'),
    undoBtn: document.getElementById('undo-btn'),
    redoBtn: document.getElementById('redo-btn'),
    exportBtn: document.getElementById('export-btn'),
    exportMenu: document.getElementById('export-menu'),
    exportHtmlBtn: document.getElementById('export-html-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    manualSaveBtn: document.getElementById('manual-save-btn'),
    contextMenu: document.getElementById('context-menu'),
    contextSaveLocally: document.getElementById('context-save-locally'),
    contextExportHtml: document.getElementById('context-export-html'),
    contextExportPdf: document.getElementById('context-export-pdf'),
    deleteModalOverlay: document.getElementById('delete-modal-overlay'),
    deleteFilename: document.getElementById('delete-filename'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
    editorMainGrid: document.getElementById('editor-main-grid'),
    resizer: document.getElementById('resizer'),
    bottomRuler: document.getElementById('bottom-ruler'),
    rulerMarks: document.getElementById('ruler-marks'),
    rulerIndicator: document.getElementById('ruler-indicator'),
};


// --- FILE MANAGEMENT ---
const loadFiles = () => {
    console.log('Loading files from localStorage...');

    try {
        const storedFiles = localStorage.getItem(FILE_STORAGE_KEY);
        const storedActiveId = localStorage.getItem(`${FILE_STORAGE_KEY}-active`);

        console.log('Stored files:', storedFiles);
        console.log('Stored active ID:', storedActiveId);

        if (storedFiles && storedFiles !== 'null' && storedFiles !== 'undefined') {
            const parsedFiles = JSON.parse(storedFiles);
            console.log('Parsed files:', parsedFiles);

            if (Array.isArray(parsedFiles) && parsedFiles.length > 0) {
                AppState.files = parsedFiles;
                AppState.activeFileId = storedActiveId;

                // Validate active file ID
                if (!AppState.files.find(f => f.id === AppState.activeFileId)) {
                    AppState.activeFileId = AppState.files[0].id;
                    console.log('Active file ID not found, using first file:', AppState.activeFileId);
                }

                console.log('Files loaded successfully:', AppState.files.length, 'files');
                return;
            }
        }

        console.log('No valid stored files found, creating welcome file');
        createWelcomeFile();

    } catch (error) {
        console.error('Error loading files from localStorage:', error);
        console.log('Creating welcome file due to error');
        createWelcomeFile();
    }
};

const createWelcomeFile = () => {
    const welcomeFile = {
        id: Date.now().toString(),
        name: 'welcome.md',
        content: `# Welcome to Monaco Markdown!

This is a simple file-based markdown editor powered by Monaco, the editor that powers VS Code.

- Create new files using the **<i class="fas fa-plus"></i> button** in the sidebar.
- **Rename** and **delete** files from the file list.
- Your work is saved automatically to your browser's local storage.

## Test your auto-save

Try typing something here and wait 30 seconds, or switch to another tab and come back. Your changes should be automatically saved!`
    };
    AppState.files = [welcomeFile];
    AppState.activeFileId = welcomeFile.id;
    console.log('Welcome file created:', welcomeFile);
    saveFiles();
};

const saveFiles = () => {
    try {
        console.log('Saving files to localStorage...', AppState.files.length, 'files');
        console.log('Active file ID:', AppState.activeFileId);

        // Ensure we have valid data to save
        if (!AppState.files || !Array.isArray(AppState.files)) {
            console.error('Invalid files data, cannot save:', AppState.files);
            return;
        }

        const filesToSave = JSON.stringify(AppState.files);
        localStorage.setItem(FILE_STORAGE_KEY, filesToSave);
        localStorage.setItem(`${FILE_STORAGE_KEY}-active`, AppState.activeFileId);

        // Verify the save worked
        const verification = localStorage.getItem(FILE_STORAGE_KEY);
        if (verification === filesToSave) {
            console.log('Files saved successfully to localStorage');
        } else {
            console.error('Save verification failed!');
        }

        hasUnsavedChanges = false;

        // Don't update UI here since instant save handles it
        // Just ensure manual save button is hidden and file name is clean
        if (dom.manualSaveBtn) {
            dom.manualSaveBtn.style.display = 'none';
        }

        // Update file name display to remove unsaved indicator
        const activeFile = AppState.files.find(f => f.id === AppState.activeFileId);
        if (activeFile && dom.activeFileName) {
            dom.activeFileName.textContent = activeFile.name;
        }

    } catch (error) {
        console.error('Error saving files to localStorage:', error);
        if (dom.saveStatus) {
            dom.saveStatus.textContent = 'Save failed!';
            dom.saveStatus.style.color = 'var(--danger-color)';
        }
    }
};

const createNewFile = () => {
    const newFileName = `untitled-${AppState.files.length + 1}.md`;
    const newFile = {
        id: Date.now().toString(),
        name: newFileName,
        content: '# New File\n\n'
    };
    AppState.files.unshift(newFile);
    renderFileList();
    selectFile(newFile.id);
    saveFiles();
};

const selectFile = (id) => {
    if (!editor) return;

    const file = AppState.files.find(f => f.id === id);
    if (!file) return;

    // Only skip if it's the same file and editor already has the content
    if (AppState.activeFileId === id && editor.getValue() === file.content) return;

    AppState.activeFileId = id;
    editor.setValue(file.content);
    dom.activeFileName.textContent = file.name;

    document.querySelectorAll('.file-item.active').forEach(el => el.classList.remove('active'));
    document.querySelector(`.file-item[data-id="${id}"]`)?.classList.add('active');

    localStorage.setItem(`${FILE_STORAGE_KEY}-active`, id);

    // Update preview and status bar after selecting file
    updatePreview();
    updateStatusBar();
};

const deleteFile = (id) => {
    const file = AppState.files.find(f => f.id === id);
    if (!file) return;

    // Show custom confirmation modal
    showDeleteConfirmation(file.name, () => {
        // This callback runs when user confirms deletion
        AppState.files = AppState.files.filter(f => f.id !== id);

        if (AppState.activeFileId === id) {
            AppState.activeFileId = AppState.files.length > 0 ? AppState.files[0].id : null;
            if (AppState.activeFileId) {
                const nextFile = AppState.files.find(f => f.id === AppState.activeFileId);
                editor.setValue(nextFile.content);
            } else {
                editor.setValue('');
            }
        }

        renderFileList();
        if (AppState.activeFileId) {
            selectFile(AppState.activeFileId);
        } else {
            dom.activeFileName.textContent = "";
            updatePreview();
        }

        saveFiles();

        // Show success message in status bar
        dom.saveStatus.textContent = `File "${file.name}" deleted`;
        dom.saveStatus.style.color = 'var(--text-muted-color)';
        setTimeout(() => {
            dom.saveStatus.textContent = '';
        }, 3000);
    });
};

const renameFile = (id, newName) => {
    const file = AppState.files.find(f => f.id === id);
    if (file) {
        file.name = newName;
        if (id === AppState.activeFileId) {
            dom.activeFileName.textContent = newName;
        }
        saveFiles();
    }
};

// --- AUTO-SAVE ---
const autoSave = () => {
    if (hasUnsavedChanges && AppState.activeFileId && editor) {
        // Show auto-saving indicator with animation
        dom.saveStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto-saving...';
        dom.saveStatus.style.color = 'var(--accent-color)';
        console.log('Auto-saving file:', AppState.activeFileId);

        // Update current file content from editor
        const currentFile = AppState.files.find(f => f.id === AppState.activeFileId);
        if (currentFile && editor) {
            currentFile.content = editor.getValue();
        }

        // Use a small timeout to ensure the user can see the "Auto-saving..." message
        setTimeout(() => {
            saveFiles();
            console.log('Auto-save completed');

            // Show success indicator briefly
            dom.saveStatus.innerHTML = '<i class="fas fa-check"></i> Auto-saved';
            dom.saveStatus.style.color = 'var(--accent-color)';

            // Clear after 2 seconds
            setTimeout(() => {
                if (dom.saveStatus.textContent.includes('Auto-saved')) {
                    dom.saveStatus.textContent = '';
                    dom.saveStatus.style.color = '';
                }
            }, 2000);
        }, 300);
    }
};

// Enhanced auto-save with multiple triggers and better UX
const setupAutoSave = () => {
    console.log('Setting up enhanced auto-save system...');

    // Get auto-save interval from localStorage or default to 10 seconds
    const autoSaveIntervalMs = parseInt(localStorage.getItem('auto-save-interval') || '10000');

    // Regular interval auto-save (configurable, default 10 seconds)
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }
    autoSaveInterval = setInterval(() => {
        console.log('Auto-save interval triggered. hasUnsavedChanges:', hasUnsavedChanges);
        autoSave();
    }, autoSaveIntervalMs);

    // Auto-save after user stops typing (debounced)
    let typingTimeout;
    const autoSaveAfterTyping = () => {
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (hasUnsavedChanges) {
                console.log('Auto-save triggered after typing pause');
                autoSave();
            }
        }, 3000); // 3 seconds after stopping typing
    };

    // Save when page becomes hidden (user switches tabs, etc.)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && hasUnsavedChanges) {
            console.log('Page hidden, triggering auto-save');
            autoSave();
        }
    });

    // Save when window loses focus
    window.addEventListener('blur', () => {
        if (hasUnsavedChanges) {
            console.log('Window lost focus, triggering auto-save');
            autoSave();
        }
    });

    // Save before page unload
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            console.log('Page unloading, triggering auto-save');
            autoSave();
            // Don't show warning for auto-save, just save silently
        }
    });

    // Save on browser/tab close
    window.addEventListener('pagehide', () => {
        if (hasUnsavedChanges) {
            console.log('Page hiding, triggering auto-save');
            autoSave();
        }
    });

    // Expose typing auto-save function
    window.triggerTypingAutoSave = autoSaveAfterTyping;

    console.log(`Auto-save system initialized. Interval: ${autoSaveIntervalMs / 1000}s, Typing delay: 3s`);
};

// Manual save function for testing
const manualSave = () => {
    console.log('Manual save triggered');
    if (AppState.activeFileId && editor) {
        const currentFile = AppState.files.find(f => f.id === AppState.activeFileId);
        if (currentFile) {
            currentFile.content = editor.getValue();
            hasUnsavedChanges = true;
            autoSave();
        }
    }
};

// Debug function to show localStorage info
const showStorageInfo = () => {
    console.log('=== STORAGE DEBUG INFO ===');
    console.log('localStorage available:', typeof Storage !== 'undefined');
    console.log('Files in AppState:', AppState.files.length);
    console.log('Active file ID:', AppState.activeFileId);

    const storedFiles = localStorage.getItem(FILE_STORAGE_KEY);
    const storedActiveId = localStorage.getItem(`${FILE_STORAGE_KEY}-active`);

    console.log('Stored files (raw):', storedFiles);
    console.log('Stored active ID:', storedActiveId);

    if (storedFiles) {
        try {
            const parsed = JSON.parse(storedFiles);
            console.log('Parsed files count:', parsed.length);
            console.log('Parsed files:', parsed);
        } catch (e) {
            console.error('Error parsing stored files:', e);
        }
    }

    // Show localStorage usage
    let totalSize = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            totalSize += localStorage[key].length;
        }
    }
    console.log('Total localStorage usage:', totalSize, 'characters');
    console.log('========================');
};

// Make debug function available globally
window.showStorageInfo = showStorageInfo;


// --- DELETE CONFIRMATION MODAL ---
let deleteConfirmCallback = null;

const showDeleteConfirmation = (filename, onConfirm) => {
    dom.deleteFilename.textContent = filename;
    dom.deleteModalOverlay.classList.add('active');
    deleteConfirmCallback = onConfirm;

    // Focus on cancel button by default (safer)
    dom.deleteCancelBtn.focus();
};

const hideDeleteConfirmation = () => {
    dom.deleteModalOverlay.classList.remove('active');
    deleteConfirmCallback = null;
};

const handleDeleteConfirm = () => {
    if (deleteConfirmCallback) {
        deleteConfirmCallback();
    }
    hideDeleteConfirmation();
};

const handleDeleteCancel = () => {
    hideDeleteConfirmation();
};


// --- RESIZER FUNCTIONALITY ---
let isResizing = false;
let startX = 0;
let startLeftWidth = 0;
let startRightWidth = 0;

// Snap points for magnetic effect - more precise options
const SNAP_POINTS = [
    10, 15, 20, 22.5, 25, 27.5, 30, 32.5, 33.33, 35, 37.5, 40, 42.5, 45, 47.5,
    50, 52.5, 55, 57.5, 60, 62.5, 65, 66.67, 67.5, 70, 72.5, 75, 77.5, 80, 82.5, 85, 90
];
const SNAP_THRESHOLD = 2.5; // percentage threshold for snapping (reduced for more precision)

const findNearestSnapPoint = (percentage) => {
    let nearest = null;
    let minDistance = Infinity;

    SNAP_POINTS.forEach(snapPoint => {
        const distance = Math.abs(percentage - snapPoint);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = snapPoint;
        }
    });

    // Return snap point only if within threshold
    return minDistance <= SNAP_THRESHOLD ? nearest : null;
};

// Bottom ruler functions
const createRulerMarks = () => {
    dom.rulerMarks.innerHTML = '';

    // Create major marks every 25%
    for (let i = 0; i <= 100; i += 25) {
        const mark = document.createElement('div');
        mark.className = 'ruler-mark major';
        mark.style.left = `${i}%`;

        const label = document.createElement('div');
        label.className = 'ruler-label';
        label.textContent = `${i}%`;
        mark.appendChild(label);

        dom.rulerMarks.appendChild(mark);
    }

    // Create marks every 10% (but not on major marks)
    for (let i = 10; i <= 90; i += 10) {
        if (i % 25 !== 0) {
            const mark = document.createElement('div');
            mark.className = 'ruler-mark minor';
            mark.style.left = `${i}%`;
            mark.style.height = '15px';
            dom.rulerMarks.appendChild(mark);
        }
    }

    // Add snap points as special marks (excluding major and 10% marks)
    SNAP_POINTS.forEach(snapPoint => {
        const isExisting = snapPoint % 25 === 0 || snapPoint % 10 === 0;
        if (!isExisting) {
            const mark = document.createElement('div');
            mark.className = 'ruler-mark minor';
            mark.style.left = `${snapPoint}%`;
            mark.style.background = 'var(--text-muted-color)';
            mark.style.opacity = '0.5';
            mark.style.height = '8px';
            mark.style.width = '1.5px';
            dom.rulerMarks.appendChild(mark);
        }
    });
};

const showBottomRuler = (percentage) => {
    if (!dom.bottomRuler.classList.contains('active')) {
        createRulerMarks();
        dom.bottomRuler.classList.add('active');
    }

    // Update indicator position and label
    dom.rulerIndicator.style.left = `${percentage}%`;
    dom.rulerIndicator.setAttribute('data-percentage', `${Math.round(percentage)}%`);
};

const hideBottomRuler = () => {
    dom.bottomRuler.classList.remove('active');
};

const initializeResizer = () => {
    let leftPanel, rightPanel;

    const startResize = (e) => {
        isResizing = true;
        startX = e.clientX;

        // Get current grid template columns
        const computedStyle = window.getComputedStyle(dom.editorMainGrid);
        const columns = computedStyle.gridTemplateColumns.split(' ');

        // Parse current widths (assuming format like "300px 4px 400px")
        startLeftWidth = parseFloat(columns[0]);
        startRightWidth = parseFloat(columns[2]);

        dom.resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Show ruler with initial position
        const containerWidth = dom.editorMainGrid.offsetWidth - 4;
        const initialPercentage = (startLeftWidth / containerWidth) * 100;
        showBottomRuler(initialPercentage);

        // Prevent text selection during drag
        e.preventDefault();
    };

    const doResize = (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const containerWidth = dom.editorMainGrid.offsetWidth - 4; // Subtract resizer width

        // Calculate new widths as percentages
        const totalWidth = startLeftWidth + startRightWidth;
        let leftPercentage = ((startLeftWidth + deltaX) / containerWidth) * 100;
        let rightPercentage = 100 - leftPercentage;

        // Enforce minimum widths (15% each side for more flexibility)
        if (leftPercentage < 15 || rightPercentage < 15) return;

        // Check for magnetic snap
        const snapPoint = findNearestSnapPoint(leftPercentage);
        if (snapPoint !== null) {
            leftPercentage = snapPoint;
            rightPercentage = 100 - snapPoint;
        }

        // Update ruler indicator
        showBottomRuler(leftPercentage);

        // Update grid template columns
        dom.editorMainGrid.style.gridTemplateColumns = `${leftPercentage}% 4px ${rightPercentage}%`;

        // Trigger Monaco editor layout update
        if (editor) {
            setTimeout(() => {
                editor.layout();
            }, 0);
        }
    };

    const stopResize = () => {
        if (!isResizing) return;

        isResizing = false;
        dom.resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Hide ruler
        hideBottomRuler();

        // Save the current layout to localStorage
        const currentColumns = dom.editorMainGrid.style.gridTemplateColumns;
        if (currentColumns) {
            localStorage.setItem('editor-layout', currentColumns);
        }
    };

    // Add event listeners
    dom.resizer.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    // Load saved layout
    const savedLayout = localStorage.getItem('editor-layout');
    if (savedLayout) {
        dom.editorMainGrid.style.gridTemplateColumns = savedLayout;
    }
};


// --- CONTEXT MENU FUNCTIONALITY ---
let contextMenuVisible = false;

const showContextMenu = (x, y) => {
    dom.contextMenu.style.left = `${x}px`;
    dom.contextMenu.style.top = `${y}px`;
    dom.contextMenu.classList.add('active');
    contextMenuVisible = true;

    // Adjust position if menu would go off screen
    const rect = dom.contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
        dom.contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > viewportHeight) {
        dom.contextMenu.style.top = `${y - rect.height}px`;
    }
};

const hideContextMenu = () => {
    dom.contextMenu.classList.remove('active');
    contextMenuVisible = false;
};

const handleContextSaveLocally = () => {
    console.log('Context menu: Save Locally triggered');
    manualSave();
    hideContextMenu();
};

const handleContextExportHtml = () => {
    console.log('Context menu: Export HTML triggered');
    handleExportHTML();
    hideContextMenu();
};

const handleContextExportPdf = () => {
    console.log('Context menu: Export PDF triggered');
    handleExportPDF();
    hideContextMenu();
};


// --- EXPORT FUNCTIONALITY ---
const getHtmlTemplate = (title, content, theme) => {
    const hljsThemeUrl = theme === 'dark'
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';

    // Use the same styles as the preview in the app
    const styles = `
        /* CSS Variables for themes */
        :root {
            --font-mono: "JetBrains Mono", "Share Tech Mono", monaco, courier;
            ${theme === 'dark' ? `
            /* Dark Theme */
            --bg-color: #121212;
            --ui-bg-color: #000000;
            --text-color: #e9ecef;
            --text-muted-color: #8d8d8d;
            --border-color: #2a2a2a;
            --accent-color: #ff7300;
            ` : `
            /* Light Theme */
            --bg-color: #f8f9fa;
            --ui-bg-color: #ffffff;
            --text-color: #212529;
            --text-muted-color: #6c757d;
            --border-color: #dee2e6;
            --accent-color: #ff7300;
            `}
        }

        body {
            max-width: 800px;
            margin: 2em auto;
            padding: 16px 24px;
            font-family: var(--font-mono);
            background: var(--ui-bg-color);
            color: var(--text-color);
            line-height: 1.7;
        }

        /* Markdown Preview Styles - same as app */
        *:first-child {
            margin-top: 0;
        }

        h1, h2 {
            border-bottom: 1px solid var(--border-color);
            padding-bottom: .3em;
        }

        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.75em;
            font-weight: 700;
            line-height: 1.2;
        }

        h1 {
            font-size: 2em;
        }

        h2 {
            font-size: 1.5em;
        }

        h3 {
            font-size: 1.25em;
        }

        p {
            margin-bottom: 1em;
            line-height: 1.7;
        }

        a {
            color: var(--accent-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        ul, ol {
            padding-left: 2em;
            margin-bottom: 1em;
        }

        blockquote {
            border-left: 4px solid var(--border-color);
            padding-left: 1em;
            margin: 0 0 1em 0;
            color: var(--text-muted-color);
        }

        :not(pre) > code {
            font-family: var(--font-mono);
            background-color: var(--bg-color);
            color: var(--text-color);
            padding: .2em .4em;
            font-size: 85%;
            border: 1px solid var(--border-color);
            border-radius: 0;
        }

        pre {
            border: 1px solid var(--border-color);
            border-radius: 0;
            overflow-x: auto;
            margin-bottom: 1em;
            font-size: 0.9rem;
        }

        pre code.hljs {
            padding: 1em;
            border-radius: 0;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
        }

        th, td {
            border: 1px solid var(--border-color);
            padding: 8px 12px;
        }

        th {
            font-weight: bold;
            background-color: var(--bg-color);
        }

        hr {
            border: none;
            border-top: 2px solid var(--border-color);
            margin: 2em 0;
        }

        img {
            max-width: 100%;
            height: auto;
            border-radius: 0;
        }
    `;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${hljsThemeUrl}">
    <style>${styles}</style>
</head>
<body>
    ${content}
</body>
</html>`;
};

const handleExportHTML = () => {
    const activeFile = AppState.files.find(f => f.id === AppState.activeFileId);
    if (!activeFile) return;

    const contentHtml = marked.parse(activeFile.content);
    const currentTheme = document.documentElement.getAttribute('theme') || 'dark';
    const fullHtml = getHtmlTemplate(activeFile.name, contentHtml, currentTheme);

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name.replace(/\.md$/, '.html');
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    dom.exportMenu.classList.remove('active');
};

const handleExportPDF = () => {
    const activeFile = AppState.files.find(f => f.id === AppState.activeFileId);
    if (!activeFile) return;

    const filename = activeFile.name.replace(/\.md$/, '.pdf');
    const element = dom.preview;

    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().from(element).set(opt).save();
    dom.exportMenu.classList.remove('active');
};


// --- UI RENDERING & UPDATES ---
const renderFileList = () => {
    dom.fileList.innerHTML = '';
    AppState.files.forEach(file => {
        const li = document.createElement('li');
        li.className = `file-item ${file.id === AppState.activeFileId ? 'active' : ''}`;
        li.dataset.id = file.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-item-name';
        nameSpan.textContent = file.name;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-item-actions';
        actionsDiv.innerHTML = `
            <button class="rename-btn" title="Rename"><i class="fas fa-pen"></i></button>
            <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
        `;

        li.appendChild(nameSpan);
        li.appendChild(actionsDiv);
        dom.fileList.appendChild(li);
    });
};

const updatePreview = () => {
    if (!editor) {
        console.log('updatePreview: Editor not available');
        return;
    }
    const content = editor.getValue();
    console.log('updatePreview: Content length:', content.length);
    dom.preview.innerHTML = marked.parse(content);

    // Apply syntax highlighting to all code blocks
    dom.preview.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    console.log('updatePreview: Preview updated with syntax highlighting');
};

const updateStatusBar = () => {
    if (!editor) return;
    const model = editor.getModel();
    const value = model.getValue();
    const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
    dom.wordCount.textContent = `${wordCount} words`;
};


// --- MONACO EDITOR SETUP ---
const setupMonacoEditor = () => new Promise((resolve, reject) => {
    try {
        // Check if Monaco is already loaded
        if (typeof monaco !== 'undefined') {
            initializeEditor();
            resolve();
            return;
        }

        require.config({
            paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }
        });

        require(['vs/editor/editor.main'], () => {
            initializeEditor();
            resolve();
        }, (error) => {
            console.error('Failed to load Monaco Editor:', error);
            reject(error);
        });
    } catch (error) {
        console.error('Error setting up Monaco Editor:', error);
        reject(error);
    }

    function initializeEditor() {
        editor = monaco.editor.create(dom.editorContainer, {
            language: 'markdown',
            theme: 'vs-dark',
            automaticLayout: true,
            wordWrap: 'on',
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 1.5,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: true,
            // Enhanced editor features
            multiCursorModifier: 'ctrlCmd',
            selectionHighlight: true,
            occurrencesHighlight: true,
            codeLens: true,
            folding: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'mouseover',
            matchBrackets: 'always',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoSurround: 'languageDefined',
            bracketPairColorization: { enabled: true },
            guides: {
                bracketPairs: true,
                indentation: true
            },
            suggest: {
                showKeywords: true,
                showSnippets: true,
                showFunctions: true
            },
            quickSuggestions: {
                other: true,
                comments: true,
                strings: true
            },
            parameterHints: { enabled: true },
            formatOnPaste: true,
            formatOnType: true
        });

        // Define custom theme with accent color selection and background colors
        monaco.editor.defineTheme('custom-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: '', foreground: 'e9ecef', background: '000000' },
                { token: 'comment', foreground: '8d8d8d', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'ff7300', fontStyle: 'bold' },
                { token: 'string', foreground: '98d982' },
                { token: 'number', foreground: 'f5c747' }
            ],
            colors: {
                // Background colors
                'editor.background': '#131313ff',
                'editor.foreground': '#e9ecef',
                'editorLineNumber.foreground': '#8d8d8d',
                'editorLineNumber.activeForeground': '#ff7300',
                'editor.lineHighlightBackground': '#1a1a1a',
                'editor.lineHighlightBorder': '#2a2a2a',
                'editorCursor.foreground': '#ff7300',
                'editorWhitespace.foreground': '#2a2a2a',

                // Selection colors - more subtle for dark theme
                'editor.selectionBackground': '#ff730040',
                'editor.selectionHighlightBackground': '#ff730020',
                'editor.inactiveSelectionBackground': '#ff730030',
                'editor.findMatchBackground': '#ff730050',
                'editor.findMatchHighlightBackground': '#ff730025',
                'editor.wordHighlightBackground': '#ff730020',
                'editor.wordHighlightStrongBackground': '#ff730040',

                // Scrollbar
                'scrollbar.shadow': '#000000',
                'scrollbarSlider.background': '#2a2a2a',
                'scrollbarSlider.hoverBackground': '#ff7300',
                'scrollbarSlider.activeBackground': '#ff7300'
            }
        });

        monaco.editor.defineTheme('custom-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: '', foreground: '212529', background: 'ffffff' },
                { token: 'comment', foreground: '6c757d', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'ff7300', fontStyle: 'bold' },
                { token: 'string', foreground: '28a745' },
                { token: 'number', foreground: 'fd7e14' }
            ],
            colors: {
                // Background colors
                'editor.background': '#ffffff',
                'editor.foreground': '#212529',
                'editorLineNumber.foreground': '#6c757d',
                'editorLineNumber.activeForeground': '#ff7300',
                'editor.lineHighlightBackground': '#f8f9fa',
                'editor.lineHighlightBorder': '#dee2e6',
                'editorCursor.foreground': '#ff7300',
                'editorWhitespace.foreground': '#dee2e6',

                // Selection colors - more subtle for light theme
                'editor.selectionBackground': '#ff730030',
                'editor.selectionHighlightBackground': '#ff730015',
                'editor.inactiveSelectionBackground': '#ff730020',
                'editor.findMatchBackground': '#ff730040',
                'editor.findMatchHighlightBackground': '#ff730018',
                'editor.wordHighlightBackground': '#ff730015',
                'editor.wordHighlightStrongBackground': '#ff730030',

                // Scrollbar
                'scrollbar.shadow': '#ffffff',
                'scrollbarSlider.background': '#dee2e6',
                'scrollbarSlider.hoverBackground': '#ff7300',
                'scrollbarSlider.activeBackground': '#ff7300'
            }
        });

        // Apply custom theme based on current theme
        const currentTheme = document.documentElement.getAttribute('theme') || 'dark';
        monaco.editor.setTheme(currentTheme === 'dark' ? 'custom-dark' : 'custom-light');

        // Instant save on content changes with minimal debounce
        let contentChangeTimeout;
        editor.onDidChangeModelContent(() => {
            clearTimeout(contentChangeTimeout);
            contentChangeTimeout = setTimeout(() => {
                const currentFile = AppState.files.find(f => f.id === AppState.activeFileId);
                if (currentFile) {
                    const newContent = editor.getValue();
                    if (currentFile.content !== newContent) {
                        currentFile.content = newContent;
                        hasUnsavedChanges = true;

                        // Show saving indicator immediately
                        dom.saveStatus.innerHTML = '<i class="fas fa-circle" style="font-size: 0.6em; animation: pulse 1s infinite;"></i> Saving...';
                        dom.saveStatus.style.color = 'var(--accent-color)';

                        // Hide manual save button since we're auto-saving
                        dom.manualSaveBtn.style.display = 'none';

                        // Remove asterisk from file name since we're saving
                        const activeFile = AppState.files.find(f => f.id === AppState.activeFileId);
                        if (activeFile) {
                            dom.activeFileName.textContent = activeFile.name;
                        }

                        // Instant save with minimal delay
                        setTimeout(() => {
                            saveFiles();
                            // Show brief success indicator
                            dom.saveStatus.innerHTML = '<i class="fas fa-check" style="font-size: 0.8em;"></i> Saved';
                            dom.saveStatus.style.color = 'var(--accent-color)';

                            // Clear status after 1 second
                            setTimeout(() => {
                                if (dom.saveStatus.textContent.includes('Saved')) {
                                    dom.saveStatus.textContent = '';
                                    dom.saveStatus.style.color = '';
                                }
                            }, 1000);
                        }, 100); // Very short delay for instant feel
                    }
                }
                updatePreview();
                updateStatusBar();
            }, 50); // Reduced debounce to 50ms for instant feel
        });

        // Add advanced keyboard shortcuts and commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveFiles();
        });

        // Undo/Redo commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
            editor.trigger('keyboard', 'undo', {});
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => {
            editor.trigger('keyboard', 'redo', {});
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => {
            editor.trigger('keyboard', 'redo', {});
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        });

        // Text manipulation commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
            editor.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL, () => {
            editor.trigger('keyboard', 'editor.action.selectHighlights', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
            editor.trigger('keyboard', 'expandLineSelection', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, () => {
            editor.trigger('keyboard', 'editor.action.deleteLines', {});
        });

        editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
            editor.trigger('keyboard', 'editor.action.moveLinesUpAction', {});
        });

        editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
            editor.trigger('keyboard', 'editor.action.moveLinesDownAction', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow, () => {
            editor.trigger('keyboard', 'editor.action.copyLinesUpAction', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow, () => {
            editor.trigger('keyboard', 'editor.action.copyLinesDownAction', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
            editor.trigger('keyboard', 'editor.action.commentLine', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash, () => {
            editor.trigger('keyboard', 'editor.action.blockComment', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => {
            editor.trigger('keyboard', 'cursorUndo', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyU, () => {
            editor.trigger('keyboard', 'cursorRedo', {});
        });

        // Multi-cursor commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
            editor.trigger('keyboard', 'editor.action.insertCursorAbove', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
            editor.trigger('keyboard', 'editor.action.insertCursorBelow', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI, () => {
            editor.trigger('keyboard', 'editor.action.insertCursorAtEndOfEachLineSelected', {});
        });

        // Text transformation commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyCode.KeyU, () => {
            editor.trigger('keyboard', 'editor.action.transformToUppercase', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyCode.KeyL, () => {
            editor.trigger('keyboard', 'editor.action.transformToLowercase', {});
        });

        // Indentation commands
        editor.addCommand(monaco.KeyCode.Tab, () => {
            editor.trigger('keyboard', 'tab', {});
        });

        editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
            editor.trigger('keyboard', 'outdent', {});
        });

        // Word navigation
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.RightArrow, () => {
            editor.trigger('keyboard', 'cursorWordRight', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.LeftArrow, () => {
            editor.trigger('keyboard', 'cursorWordLeft', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.RightArrow, () => {
            editor.trigger('keyboard', 'cursorWordRightSelect', {});
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.LeftArrow, () => {
            editor.trigger('keyboard', 'cursorWordLeftSelect', {});
        });

        // Markdown-specific commands
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
            insertMarkdownSyntax('**', '**', 'bold text');
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
            insertMarkdownSyntax('*', '*', 'italic text');
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
            insertMarkdownSyntax('[', '](https://)', 'link text');
        });

        // Custom markdown helper functions
        function insertMarkdownSyntax(before, after, placeholder) {
            const selection = editor.getSelection();
            const selectedText = editor.getModel().getValueInRange(selection);
            const textToInsert = selectedText || placeholder;
            const newText = before + textToInsert + after;

            editor.executeEdits('markdown-helper', [{
                range: selection,
                text: newText,
                forceMoveMarkers: true
            }]);

            if (!selectedText) {
                // Select the placeholder text
                const newSelection = new monaco.Selection(
                    selection.startLineNumber,
                    selection.startColumn + before.length,
                    selection.startLineNumber,
                    selection.startColumn + before.length + placeholder.length
                );
                editor.setSelection(newSelection);
            }

            editor.focus();
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        }

        // Listen for model changes to update button states
        editor.onDidChangeModelContent(() => {
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        });

        // Initial button state update
        setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 100);
    }
});


// --- THEME MANAGEMENT ---
const loadTheme = () => {
    const theme = localStorage.getItem('monaco-markdown-theme') || 'dark';
    document.documentElement.setAttribute('theme', theme);
    const icon = dom.themeToggleBtn.querySelector('i');
    const darkHljs = document.getElementById('hljs-theme-dark');
    const lightHljs = document.getElementById('hljs-theme-light');

    if (theme === 'dark') {
        icon.className = 'fas fa-sun';
        if (editor) monaco.editor.setTheme('custom-dark');
        darkHljs.disabled = false;
        lightHljs.disabled = true;
    } else {
        icon.className = 'fas fa-moon';
        if (editor) monaco.editor.setTheme('custom-light');
        darkHljs.disabled = true;
        lightHljs.disabled = false;
    }
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('monaco-markdown-theme', newTheme);
    loadTheme();
};


// --- EVENT LISTENERS ---
const setupEventListeners = () => {
    dom.newFileBtn.addEventListener('click', createNewFile);
    dom.sidebarToggleBtn.addEventListener('click', () => {
        // Toggle between expanded and collapsed
        if (dom.appContainer.classList.contains('sidebar-expanded')) {
            dom.appContainer.classList.remove('sidebar-expanded');
            dom.appContainer.classList.add('sidebar-collapsed');
        } else {
            dom.appContainer.classList.remove('sidebar-collapsed');
            dom.appContainer.classList.add('sidebar-expanded');
        }

        // On mobile, close sidebar when clicking outside
        if (window.innerWidth <= 768) {
            const handleClickOutside = (e) => {
                if (!dom.sidebar.contains(e.target) && !dom.sidebarToggleBtn.contains(e.target)) {
                    dom.appContainer.classList.remove('sidebar-expanded');
                    dom.appContainer.classList.add('sidebar-collapsed');
                    document.removeEventListener('click', handleClickOutside);
                }
            };

            if (dom.appContainer.classList.contains('sidebar-expanded')) {
                setTimeout(() => {
                    document.addEventListener('click', handleClickOutside);
                }, 100);
            }
        }
    });
    dom.themeToggleBtn.addEventListener('click', toggleTheme);

    // Manual save button
    dom.manualSaveBtn.addEventListener('click', () => {
        console.log('Manual save button clicked');
        manualSave();
    });

    // Export menu handling
    dom.exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.exportMenu.classList.toggle('active');
    });
    dom.exportHtmlBtn.addEventListener('click', handleExportHTML);
    dom.exportPdfBtn.addEventListener('click', handleExportPDF);
    document.addEventListener('click', () => {
        dom.exportMenu.classList.remove('active');
    });

    // Context menu event listeners
    dom.contextSaveLocally.addEventListener('click', handleContextSaveLocally);
    dom.contextExportHtml.addEventListener('click', handleContextExportHtml);
    dom.contextExportPdf.addEventListener('click', handleContextExportPdf);

    // Right-click context menu on editor area
    dom.editorContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    });

    // Right-click context menu on preview area
    dom.preview.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    });

    // Hide context menu on click outside or left click
    document.addEventListener('click', (e) => {
        if (contextMenuVisible && !dom.contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    // Hide context menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contextMenuVisible) {
            hideContextMenu();
        }
    });

    // Delete confirmation modal event listeners
    dom.deleteCancelBtn.addEventListener('click', handleDeleteCancel);
    dom.deleteConfirmBtn.addEventListener('click', handleDeleteConfirm);

    // Close modal when clicking on overlay
    dom.deleteModalOverlay.addEventListener('click', (e) => {
        if (e.target === dom.deleteModalOverlay) {
            handleDeleteCancel();
        }
    });

    // Handle keyboard shortcuts in modal
    document.addEventListener('keydown', (e) => {
        if (dom.deleteModalOverlay.classList.contains('active')) {
            if (e.key === 'Escape') {
                handleDeleteCancel();
            } else if (e.key === 'Enter') {
                handleDeleteConfirm();
            }
        }
    });


    dom.fileList.addEventListener('click', e => {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;

        const id = fileItem.dataset.id;

        if (e.target.closest('.delete-btn')) {
            deleteFile(id);
        } else if (e.target.closest('.rename-btn')) {
            const nameSpan = fileItem.querySelector('.file-item-name');
            const currentName = nameSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'rename-input';

            nameSpan.replaceWith(input);
            input.focus();
            input.select();

            const saveRename = () => {
                const newName = input.value.trim() || currentName;
                renameFile(id, newName);
                input.replaceWith(nameSpan);
                nameSpan.textContent = newName;
            };

            input.addEventListener('blur', saveRename);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') {
                    input.value = currentName;
                    input.blur();
                }
            });
        } else {
            selectFile(id);
        }
    });

    // Update undo/redo button states function
    window.updateUndoRedoButtons = function () {
        if (!editor || !dom.undoBtn || !dom.redoBtn) return;

        try {
            const model = editor.getModel();
            if (!model) return;

            // Check if undo/redo are available
            const canUndo = model.canUndo();
            const canRedo = model.canRedo();

            // Update button states
            dom.undoBtn.disabled = !canUndo;
            dom.redoBtn.disabled = !canRedo;

            // Update visual appearance
            if (canUndo) {
                dom.undoBtn.classList.remove('disabled');
            } else {
                dom.undoBtn.classList.add('disabled');
            }

            if (canRedo) {
                dom.redoBtn.classList.remove('disabled');
            } else {
                dom.redoBtn.classList.add('disabled');
            }
        } catch (error) {
            console.warn('Error updating undo/redo buttons:', error);
        }
    };

    // Undo/Redo button event listeners
    dom.undoBtn.addEventListener('click', () => {
        if (editor && !dom.undoBtn.disabled) {
            editor.trigger('button', 'undo', {});
            window.updateUndoRedoButtons();
        }
    });

    dom.redoBtn.addEventListener('click', () => {
        if (editor && !dom.redoBtn.disabled) {
            editor.trigger('button', 'redo', {});
            window.updateUndoRedoButtons();
        }
    });

    dom.toolbar.addEventListener('click', e => {
        const button = e.target.closest('.toolbar-btn');
        if (!button || !editor) return;

        // Skip undo/redo buttons as they have their own handlers
        if (button.id === 'undo-btn' || button.id === 'redo-btn') return;

        const action = button.dataset.action;
        const selection = editor.getSelection();
        const selectedText = editor.getModel().getValueInRange(selection);
        let newText;

        switch (action) {
            case 'bold':
                newText = `**${selectedText || 'bold text'}**`;
                break;
            case 'italic':
                newText = `*${selectedText || 'italic text'}*`;
                break;
            case 'heading':
                newText = `# ${selectedText || 'Heading'}`;
                break;
            case 'link':
                newText = `[${selectedText || 'link text'}](https://)`;
                break;
            case 'quote':
                newText = `> ${selectedText || 'Quote'}`;
                break;
            case 'code':
                newText = "\n```javascript\n" + (selectedText || 'console.log("Hello, world!");') + "\n```\n";
                break;
        }

        if (newText) {
            editor.executeEdits('toolbar', [{ range: selection, text: newText, forceMoveMarkers: true }]);
            editor.focus();
            setTimeout(() => window.updateUndoRedoButtons && window.updateUndoRedoButtons(), 0);
        }
    });
};


// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // --- MARKED.JS & HIGHLIGHT.JS SETUP ---
    marked.use({
        highlight: (code, lang) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
    });

    // Test localStorage first
    const localStorageWorks = testLocalStorage();
    if (!localStorageWorks) {
        console.warn('⚠️ localStorage not working - data will not persist');
    }

    loadFiles();
    renderFileList();
    loadTheme();
    setupMonacoEditor().then(() => {
        console.log('Monaco Editor loaded, initializing content...');

        // Load theme first
        loadTheme();

        // Then load the appropriate file
        if (AppState.activeFileId) {
            console.log('Loading active file:', AppState.activeFileId);
            selectFile(AppState.activeFileId);
        } else if (AppState.files.length > 0) {
            console.log('Loading first file:', AppState.files[0].id);
            selectFile(AppState.files[0].id);
        } else {
            console.log('No files found, creating new file');
            createNewFile();
        }

        // Ensure preview and status bar are updated
        setTimeout(() => {
            updatePreview();
            updateStatusBar();
            console.log('Initial content loaded and preview updated');
        }, 100);

        // Initialize resizer
        initializeResizer();

        // Start enhanced auto-save system
        setupAutoSave();
    }).catch((error) => {
        console.error('Failed to initialize Monaco Editor:', error);
        // Fallback: show error message to user
        dom.editorContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-muted-color);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Failed to load the editor. Please refresh the page.</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh Page</button>
            </div>
        `;
    });
    setupEventListeners();

    // Handle window resize for responsive behavior
    window.addEventListener('resize', () => {
        // Always keep sidebar collapsed by default
        if (!dom.appContainer.classList.contains('sidebar-expanded')) {
            dom.appContainer.classList.add('sidebar-collapsed');
        }

        // Trigger Monaco editor layout update
        if (editor) {
            setTimeout(() => {
                editor.layout();
            }, 300);
        }
    });

    // Set initial state - sidebar collapsed by default
    dom.appContainer.classList.add('sidebar-collapsed');
});
