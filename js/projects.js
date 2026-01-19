import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs, 
    setupGlobalSearch 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // ------------------------------------------------------------------------
    // 1. INITIALIZATION & AUTHENTICATION
    // ------------------------------------------------------------------------
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // ------------------------------------------------------------------------
    // 2. CENTRAL STATE MANAGEMENT
    // ------------------------------------------------------------------------
    let state = {
        // View Mode: 'resource' (Capacity) or 'project' (Timeline)
        currentView: 'resource', 
        
        // Data Containers
        trades: [],
        projects: [],
        tasks: [],
        availability: [], // Store PTO records
        
        // Physics Engine State (Drag & Drop)
        isDragging: false,
        dragTask: null, // The task object being moved
        dragEl: null,   // The DOM element being moved
        dragStartX: 0,  // Mouse X position at start
        dragStartLeft: 0, // Element Left position at start
        hasMoved: false   // Distinguishes between Click and Drag
    };

    // ------------------------------------------------------------------------
    // 3. COLOR PALETTES (REFINED - INDUSTRIAL THEME)
    // ------------------------------------------------------------------------
    
    // Trade Colors: Muted, Professional Tones
    // Used in Project View to show Phases
    const TRADE_COLORS = {
        1: '#546E7A', // Kickoff (Blue Grey)
        2: '#42A5F5', // Design (Technical Blue)
        3: '#FFA726', // Fabrication (Sparks/Bronze)
        4: '#8D6E63', // Woodworking (Walnut)
        5: '#66BB6A', // Installation (Safety Green)
        6: '#AB47BC'  // Finishing (Purple)
    };

    // Project Colors: Distinct but Dark/Muted
    // Used in Resource View to distinguish Jobs
    function getProjectColor(id) {
        const colors = [
            '#37474F', // Slate
            '#00695C', // Teal
            '#BF360C', // Burnt Orange
            '#4A148C', // Deep Purple
            '#0D47A1', // Navy
            '#827717'  // Olive
        ];
        return colors[id % colors.length];
    }

    function getTradeColor(id) {
        return TRADE_COLORS[id] || 'var(--primary-gold)'; 
    }

    // ------------------------------------------------------------------------
    // 4. VIEW CONTROL LOGIC (Toggle Buttons)
    // ------------------------------------------------------------------------
    const btnResource = document.getElementById('view-resource-btn');
    const btnProject = document.getElementById('view-project-btn');

    if (btnResource && btnProject) {
        btnResource.addEventListener('click', () => switchView('resource'));
        btnProject.addEventListener('click', () => switchView('project'));
    }

    function switchView(view) {
        state.currentView = view;
        
        // Update Button Styling
        if(view === 'resource') {
            btnResource.classList.add('active');
            btnResource.style.background = 'var(--primary-blue)';
            btnResource.style.color = 'white';
            
            btnProject.classList.remove('active');
            btnProject.style.background = 'transparent';
            btnProject.style.color = 'var(--text-dim)';
        } else {
            btnProject.classList.add('active');
            btnProject.style.background = 'var(--primary-blue)';
            btnProject.style.color = 'white';
            
            btnResource.classList.remove('active');
            btnResource.style.background = 'transparent';
            btnResource.style.color = 'var(--text-dim)';
        }
        
        // Re-render the grid immediately
        renderGantt();
    }

    // ------------------------------------------------------------------------
    // 5. ROBUST DATA LOADING (Parallel Processing)
    // ------------------------------------------------------------------------
    async function loadShopData() {
        console.log("Loading Ten Works Production Data...");
        
        // We use Promise.all to fetch all tables simultaneously for speed
        const [tradesRes, tasksRes, projectsRes, availRes] = await Promise.all([
            supabase.from('shop_trades').select('*').order('id'),
            supabase.from('project_tasks').select(`*, projects(name), shop_trades(name)`),
            supabase.from('projects').select('*').order('start_date'),
            supabase.from('talent_availability').select('*') // Fetch PTO
        ]);

        if (tradesRes.error) console.error("Error loading trades:", tradesRes.error);
        if (tasksRes.error) console.error("Error loading tasks:", tasksRes.error);
        if (projectsRes.error) console.error("Error loading projects:", projectsRes.error);
        if (availRes.error) console.error("Error loading availability:", availRes.error);

        // Update State
        state.trades = tradesRes.data || [];
        state.tasks = tasksRes.data || [];
        state.projects = projectsRes.data || [];
        state.availability = availRes.data || []; 

        // Update UI
        renderGantt();
        updateMetrics();
    }

    // --- HELPER: LANE PACKING ALGORITHM ---
    function packTasks(tasks) {
        const sorted = [...tasks].sort((a,b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
        const lanes = []; 

        sorted.forEach(task => {
            let placed = false;
            for(let i=0; i<lanes.length; i++) {
                if (dayjs(lanes[i]).isBefore(dayjs(task.start_date))) {
                    task.laneIndex = i;
                    lanes[i] = task.end_date;
                    placed = true;
                    break;
                }
            }
            if(!placed) {
                task.laneIndex = lanes.length;
                lanes.push(task.end_date);
            }
        });
        return lanes.length; 
    }

    // --- HELPER: CHECK AVAILABILITY CONFLICT ---
    function checkAvailabilityConflict(taskId, newStartDate, newEndDate) {
        // 1. Find the task to get the assigned person
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !task.assigned_talent_id) return null; // No person assigned, no conflict

        // 2. Generate array of dates for the new span
        const start = dayjs(newStartDate);
        const end = dayjs(newEndDate);
        const days = end.diff(start, 'day') + 1;
        
        // 3. Check each day against state.availability
        for (let i = 0; i < days; i++) {
            const checkDate = start.add(i, 'day').format('YYYY-MM-DD');
            const conflict = state.availability.find(a => 
                a.talent_id === task.assigned_talent_id && 
                a.date === checkDate && 
                a.status === 'PTO'
            );

            if (conflict) {
                return { date: checkDate, talentId: task.assigned_talent_id };
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // 6. RENDER ENGINE (With Stacking, Colors, and Target Flags)
    // ------------------------------------------------------------------------
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        if (!resourceList || !gridCanvas || !dateHeader) return;

        // A. TIMELINE
        let dateHtml = '';
        const startDate = dayjs().subtract(5, 'day');
        const daysToRender = 60;
        const dayWidth = 100;

        for (let i = 0; i < daysToRender; i++) {
            const current = startDate.add(i, 'day');
            const isWeekend = current.day() === 0 || current.day() === 6;
            const isToday = current.isSame(dayjs(), 'day');
            dateHtml += `
                <div class="date-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">
                    <span style="font-weight:700;">${current.format('DD')}</span>
                    <span>${current.format('ddd')}</span>
                </div>
            `;
        }
        dateHeader.innerHTML = dateHtml;
        const totalWidth = daysToRender * dayWidth;
        dateHeader.style.width = `${totalWidth}px`;
        gridCanvas.style.width = `${totalWidth}px`;
        
        // Remove fixed grid background to allow dynamic row heights
        gridCanvas.style.backgroundImage = 'linear-gradient(90deg, var(--border-color) 1px, transparent 1px)';
        gridCanvas.style.backgroundSize = '100px 100%'; 

        // B. ROWS & BARS
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        const rows = state.currentView === 'resource' ? state.trades : state.projects;
        let currentY = 0; 

        rows.forEach((rowItem, index) => {
            // 1. Get Tasks
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                else return t.project_id === rowItem.id;
            });

            // 2. Calculate Stacking
            const numLanes = packTasks(rowTasks);
            const barHeight = 26;
            const barMargin = 6;
            const rowPadding = 20;
            const calculatedHeight = Math.max(70, (numLanes * (barHeight + barMargin)) + rowPadding);

            // --- ZEBRA STRIPING LOGIC ---
            const isOdd = index % 2 === 1;
            const rowBackground = isOdd ? 'rgba(255, 255, 255, 0.025)' : 'transparent'; 

            // 3. Render Sidebar Row
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            rowEl.style.height = `${calculatedHeight}px`; 
            rowEl.style.backgroundColor = rowBackground; // <--- Apply to Sidebar
            
            if (state.currentView === 'resource') {
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>`;
            } else {
                let statusColor = '#888';
                if(rowItem.status === 'In Progress') statusColor = 'var(--primary-blue)';
                if(rowItem.status === 'Completed') statusColor = '#4CAF50';
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role" style="color:${statusColor}">${rowItem.status}</div>`;
            }
            resourceList.appendChild(rowEl);

            // 4. Render Grid Row Background
            const rowBg = document.createElement('div');
            rowBg.style.position = 'absolute';
            rowBg.style.top = `${currentY}px`;
            rowBg.style.left = '0';
            rowBg.style.width = '100%';
            rowBg.style.height = `${calculatedHeight}px`;
            rowBg.style.backgroundColor = rowBackground; // <--- Apply to Grid
            rowBg.style.borderBottom = '1px solid var(--border-color)';
            rowBg.style.zIndex = '0';
            gridCanvas.appendChild(rowBg);

            // --- 5. TARGET COMPLETION INDICATOR (Projects View Only) ---
            if (state.currentView === 'project' && rowItem.end_date) {
                const targetDate = dayjs(rowItem.end_date);
                const targetDiff = targetDate.diff(startDate, 'day');
                
                // Only draw if within current view range
                if (targetDiff >= 0 && targetDiff < daysToRender) {
                    const targetLine = document.createElement('div');
                    targetLine.style.position = 'absolute';
                    targetLine.style.top = `${currentY}px`;
                    targetLine.style.left = `${(targetDiff + 1) * dayWidth}px`; // +1 to place at end of day
                    targetLine.style.height = `${calculatedHeight}px`;
                    targetLine.style.borderLeft = '2px dashed var(--primary-gold)';
                    targetLine.style.zIndex = '1';
                    targetLine.style.opacity = '0.6';
                    targetLine.title = `Target Completion: ${targetDate.format('MMM D')}`;
                    
                    // The "Flag" Icon at top
                    const flag = document.createElement('div');
                    flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
                    flag.style.position = 'absolute';
                    flag.style.top = '5px';
                    flag.style.left = '-10px'; // Center over line
                    flag.style.color = 'var(--primary-gold)';
                    flag.style.fontSize = '12px';
                    
                    targetLine.appendChild(flag);
                    gridCanvas.appendChild(targetLine);
                }
            }
            // -----------------------------------------------------------

            // 6. Render Bars
            rowTasks.forEach(task => {
                const start = dayjs(task.start_date);
                const end = dayjs(task.end_date);
                const diff = start.diff(startDate, 'day');
                const duration = end.diff(start, 'day') + 1;

                if (diff + duration < 0) return;

                const bar = document.createElement('div');
                bar.className = 'gantt-task-bar';
                
                const laneOffset = (task.laneIndex || 0) * (barHeight + barMargin);
                bar.style.top = `${currentY + 10 + laneOffset}px`; 
                bar.style.left = `${diff * dayWidth}px`;
                bar.style.width = `${(duration * dayWidth) - 10}px`;
                bar.style.height = `${barHeight}px`;
                bar.style.fontSize = '0.7rem';
                bar.style.cursor = 'grab';

                // --- DYNAMIC COLOR LOGIC ---
                let barColor;
                if (state.currentView === 'project') {
                    // In Project View, color by TRADE (Phase)
                    barColor = getTradeColor(task.trade_id);
                } else {
                    // In Resource View, color by PROJECT (Job)
                    barColor = getProjectColor(task.project_id);
                }
                bar.style.backgroundColor = barColor;
                bar.style.border = '1px solid rgba(255,255,255,0.15)'; // Subtle border
                // ---------------------------

                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                // If over budget, burn line is bright red. Otherwise, a lighter tint.
                const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.5)';
                
                const label = state.currentView === 'resource' ? task.projects?.name : task.shop_trades?.name;

                bar.innerHTML = `
                    <span class="gantt-task-info" style="pointer-events:none; line-height:${barHeight}px; text-shadow:0 1px 2px black; padding-left:5px;">${label || task.name}</span>
                    <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor}; pointer-events:none;"></div>
                `;
                bar.addEventListener('mousedown', (e) => handleDragStart(e, task, bar));
                gridCanvas.appendChild(bar);
            });

            currentY += calculatedHeight;
        });
        
        gridCanvas.style.height = `${currentY}px`;
    }

    // ------------------------------------------------------------------------
    // 7. PHYSICS ENGINE (Drag & Cascade Logic)
    // ------------------------------------------------------------------------
    function handleDragStart(e, task, element) {
        if (e.button !== 0) return; // Only Left Click

        state.isDragging = true;
        state.dragTask = task;
        state.dragEl = element;
        state.dragStartX = e.clientX;
        state.dragStartLeft = parseInt(element.style.left || 0);
        state.hasMoved = false;

        // Visual Feedback: Lift the element
        element.style.cursor = 'grabbing';
        element.style.zIndex = 1000;
        element.style.transition = 'none'; // Disable smoothing for instant follow

        // Attach Global Listeners
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!state.isDragging) return;
        
        const deltaX = e.clientX - state.dragStartX;
        
        // Threshold: If moved more than 5 pixels, consider it a drag
        if (Math.abs(deltaX) > 5) state.hasMoved = true;

        state.dragEl.style.left = `${state.dragStartLeft + deltaX}px`;
    }

    async function handleDragEnd(e) {
        if (!state.isDragging) return;

        // Cleanup
        state.isDragging = false;
        state.dragEl.style.cursor = 'grab';
        state.dragEl.style.zIndex = '';
        state.dragEl.style.transition = 'all 0.2s'; // Re-enable smoothing
        
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        // CASE A: It was a Click -> Open Edit Modal
        if (!state.hasMoved) {
            state.dragEl.style.left = `${state.dragStartLeft}px`; // Snap back
            openTaskModal(state.dragTask);
            return;
        }

        // CASE B: It was a Drag -> Move & Cascade
        const currentLeft = parseInt(state.dragEl.style.left || 0);
        const snapLeft = Math.round(currentLeft / 100) * 100; // Snap to 100px grid
        state.dragEl.style.left = `${snapLeft}px`; // Visual snap

        const pixelShift = snapLeft - state.dragStartLeft;
        const dayShift = Math.round(pixelShift / 100);

        if (dayShift !== 0) {
            console.log(`Shifting task ${state.dragTask.name} by ${dayShift} days.`);

            // 1. Calculate Proposed Dates
            const oldStart = state.dragTask.start_date;
            const newStart = dayjs(state.dragTask.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
            const newEnd = dayjs(state.dragTask.end_date).add(dayShift, 'day').format('YYYY-MM-DD');

            // --- INTERCEPT: CHECK PTO CONFLICT ---
            const conflict = checkAvailabilityConflict(state.dragTask.id, newStart, newEnd);
            if (conflict) {
                // Found a conflict!
                const confirmMove = confirm(
                    `WARNING: The assigned staff member is marked as PTO on ${conflict.date}.\n\nDo you still want to move this task?`
                );
                
                if (!confirmMove) {
                    // User cancelled: Snap back visually and abort
                    state.dragEl.style.left = `${state.dragStartLeft}px`;
                    return; 
                }
            }
            // -------------------------------------

            // 2. Optimistic UI Update (Update local state immediately)
            state.dragTask.start_date = newStart;
            state.dragTask.end_date = newEnd;

            // 3. Database Update (Parent Task)
            const { error } = await supabase.from('project_tasks')
                .update({ start_date: newStart, end_date: newEnd })
                .eq('id', state.dragTask.id);

            if (error) {
                console.error("Move failed, reverting...", error);
                state.dragTask.start_date = oldStart; 
                loadShopData(); // Hard refresh to fix UI
                return;
            }

            // 4. THE DOMINO EFFECT (Cascade Children)
            // Find dependent tasks
            const { data: children } = await supabase
                .from('project_tasks')
                .select('*')
                .eq('dependency_task_id', state.dragTask.id);

            if (children && children.length > 0) {
                console.log(`Cascading move to ${children.length} downstream tasks...`);
                
                // Use Promise.all to update children concurrently
                const updatePromises = children.map(child => {
                    const cStart = dayjs(child.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    const cEnd = dayjs(child.end_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    
                    return supabase.from('project_tasks')
                        .update({ start_date: cStart, end_date: cEnd })
                        .eq('id', child.id);
                });

                await Promise.all(updatePromises);
            }

            // Reload to ensure full sync
            loadShopData();
        }
    }

    // ------------------------------------------------------------------------
    // 8. EDIT MODAL (Update Hours, Status, Delete)
    // ------------------------------------------------------------------------
    function openTaskModal(task) {
        showModal(`Edit Task: ${task.name}`, `
            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div>
                    <label>Status</label>
                    <select id="edit-status" class="form-control" style="background:var(--bg-dark); color:white; padding:8px;">
                        <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                <div>
                    <label>Actual Hours (Burn)</label>
                    <input type="number" id="edit-actual" class="form-control" value="${task.actual_hours}">
                    <small style="color:var(--text-dim)">Est: ${task.estimated_hours} hrs</small>
                </div>
                <div>
                    <label>Start Date</label>
                    <input type="date" id="edit-start" class="form-control" value="${task.start_date}">
                </div>
                <div>
                    <label>End Date</label>
                    <input type="date" id="edit-end" class="form-control" value="${task.end_date}">
                </div>
            </div>
            <div style="margin-top:20px; text-align:right; border-top:1px solid var(--border-color); padding-top:15px;">
                <button id="delete-task-btn" style="background:#773030; color:white; border:none; padding:8px 12px; border-radius:4px; float:left;">Delete Task</button>
            </div>
        `, async () => {
            // SAVE LOGIC
            const newStatus = document.getElementById('edit-status').value;
            const newActual = document.getElementById('edit-actual').value;
            const newStart = document.getElementById('edit-start').value;
            const newEnd = document.getElementById('edit-end').value;

            const { error } = await supabase.from('project_tasks').update({ 
                status: newStatus, 
                actual_hours: newActual, 
                start_date: newStart, 
                end_date: newEnd 
            }).eq('id', task.id);

            if (error) alert('Error: ' + error.message);
            else loadShopData();
        });

        // Delete Logic
        setTimeout(() => {
            const delBtn = document.getElementById('delete-task-btn');
            if(delBtn) delBtn.onclick = async () => {
                if(confirm("Are you sure you want to delete this task?")) {
                    await supabase.from('project_tasks').delete().eq('id', task.id);
                    hideModal();
                    loadShopData();
                }
            };
        }, 100);
    }

    // ------------------------------------------------------------------------
    // 9. METRICS DASHBOARD
    // ------------------------------------------------------------------------
    function updateMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        
        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');
        
        if(revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if(countEl) countEl.textContent = activeProjects.length;

        // Load Logic: Count tasks active today
        const today = dayjs();
        const activeTasks = state.tasks.filter(t => 
            dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)
        ).length;
        
        const capacity = 5; // Adjustable Shop Capacity
        const load = Math.min((activeTasks / capacity) * 100, 100);
        
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    // ------------------------------------------------------------------------
    // 10. MISSION PLANNER (Dynamic Launch Modal)
    // ------------------------------------------------------------------------
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            // 1. Fetch Deals
            const { data: deals, error } = await supabase
                .from('deals_tw')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) { alert("Error fetching deals: " + error.message); return; }
            if (!deals || deals.length === 0) { alert("No deals found in 'deals_tw' table."); return; }

            // 2. Build Options (Handling Undefined Fields)
            const options = deals.map(d => {
                const name = d.deal_name || d.name || 'Unnamed';
                const amt = d.amount || 0;
                return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)})</option>`;
            }).join('');

            // 3. Calculate Default Dates (Waterfall)
            const today = dayjs();
            const defDates = {
                pmStart: today.format('YYYY-MM-DD'), pmEnd: today.add(2, 'day').format('YYYY-MM-DD'),
                cadStart: today.add(3, 'day').format('YYYY-MM-DD'), cadEnd: today.add(10, 'day').format('YYYY-MM-DD'),
                fabStart: today.add(11, 'day').format('YYYY-MM-DD'), fabEnd: today.add(25, 'day').format('YYYY-MM-DD'),
                instStart: today.add(26, 'day').format('YYYY-MM-DD'), instEnd: today.add(30, 'day').format('YYYY-MM-DD')
            };

            showModal('Launch Project Plan', `
                <div class="form-group">
                    <label>Select Deal</label>
                    <select id="launch-deal" class="form-control" style="background:var(--bg-dark); color:white; padding:10px; width:100%; box-sizing:border-box;">${options}</select>
                </div>
                
                <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h4 style="color:var(--text-bright); margin:0;">Phase Scheduling</h4>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <label style="margin:0; font-size:0.8rem; color:var(--text-dim);">Project Start:</label>
                            <input type="date" id="master-start-date" class="form-control" style="width:140px;" value="${defDates.pmStart}">
                        </div>
                    </div>
                    
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; align-items:center; margin-bottom:5px; font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;">
                        <span>Phase</span><span>Start</span><span>End</span><span>Est. Hrs</span>
                    </div>

                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;">
                        <span style="align-self:center; color:var(--text-bright);">Kickoff</span>
                        <input type="date" id="p1-start" class="form-control" value="${defDates.pmStart}">
                        <input type="date" id="p1-end" class="form-control" value="${defDates.pmEnd}">
                        <input type="number" id="p1-hrs" class="form-control" value="5">
                    </div>

                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;">
                        <span style="align-self:center; color:var(--text-bright);">Design</span>
                        <input type="date" id="p2-start" class="form-control" value="${defDates.cadStart}">
                        <input type="date" id="p2-end" class="form-control" value="${defDates.cadEnd}">
                        <input type="number" id="p2-hrs" class="form-control" value="20">
                    </div>

                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;">
                        <span style="align-self:center; color:var(--text-bright);">Fabrication</span>
                        <input type="date" id="p3-start" class="form-control" value="${defDates.fabStart}">
                        <input type="date" id="p3-end" class="form-control" value="${defDates.fabEnd}">
                        <input type="number" id="p3-hrs" class="form-control" value="80">
                    </div>

                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;">
                        <span style="align-self:center; color:var(--text-bright);">Installation</span>
                        <input type="date" id="p4-start" class="form-control" value="${defDates.instStart}">
                        <input type="date" id="p4-end" class="form-control" value="${defDates.instEnd}">
                        <input type="number" id="p4-hrs" class="form-control" value="24">
                    </div>
                </div>
            `, async () => {
                // CONFIRM ACTION
                const sel = document.getElementById('launch-deal');
                if(!sel.value) return;

                const name = sel.options[sel.selectedIndex].dataset.name;
                const amt = sel.options[sel.selectedIndex].dataset.amt;
                
                // Harvest Inputs
                const dates = {
                    p1s: document.getElementById('p1-start').value, p1e: document.getElementById('p1-end').value, p1h: document.getElementById('p1-hrs').value,
                    p2s: document.getElementById('p2-start').value, p2e: document.getElementById('p2-end').value, p2h: document.getElementById('p2-hrs').value,
                    p3s: document.getElementById('p3-start').value, p3e: document.getElementById('p3-end').value, p3h: document.getElementById('p3-hrs').value,
                    p4s: document.getElementById('p4-start').value, p4e: document.getElementById('p4-end').value, p4h: document.getElementById('p4-hrs').value,
                };

                // 1. Create Project Container
                const { data: proj, error: projError } = await supabase.from('projects').insert([{
                    deal_id: sel.value, name, start_date: dates.p1s, end_date: dates.p4e, project_value: amt, status: 'Pre-Production'
                }]).select();
                
                if(projError) { alert(projError.message); return; }
                const pid = proj[0].id;

                // 2. Create Tasks (With explicit user-defined dates & hours)
                const { data: t1 } = await supabase.from('project_tasks').insert({ 
                    project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff & Plan', 
                    start_date: dates.p1s, end_date: dates.p1e, estimated_hours: dates.p1h 
                }).select();

                const { data: t2 } = await supabase.from('project_tasks').insert({ 
                    project_id: pid, trade_id: state.trades[1]?.id||2, name: 'CAD Drawings', 
                    start_date: dates.p2s, end_date: dates.p2e, estimated_hours: dates.p2h, 
                    dependency_task_id: t1[0].id 
                }).select();

                const { data: t3 } = await supabase.from('project_tasks').insert({ 
                    project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fabrication', 
                    start_date: dates.p3s, end_date: dates.p3e, estimated_hours: dates.p3h, 
                    dependency_task_id: t2[0].id 
                }).select();

                await supabase.from('project_tasks').insert({ 
                    project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Installation', 
                    start_date: dates.p4s, end_date: dates.p4e, estimated_hours: dates.p4h, 
                    dependency_task_id: t3[0].id 
                });

                loadShopData();
            });
            
            // SMART AUTO-UPDATER (Recalculate waterfall if Master Start changes)
            document.getElementById('master-start-date').addEventListener('change', (e) => {
                const start = dayjs(e.target.value);
                document.getElementById('p1-start').value = start.format('YYYY-MM-DD');
                document.getElementById('p1-end').value = start.add(2, 'day').format('YYYY-MM-DD');
                document.getElementById('p2-start').value = start.add(3, 'day').format('YYYY-MM-DD');
                document.getElementById('p2-end').value = start.add(10, 'day').format('YYYY-MM-DD');
                document.getElementById('p3-start').value = start.add(11, 'day').format('YYYY-MM-DD');
                document.getElementById('p3-end').value = start.add(25, 'day').format('YYYY-MM-DD');
                document.getElementById('p4-start').value = start.add(26, 'day').format('YYYY-MM-DD');
                document.getElementById('p4-end').value = start.add(30, 'day').format('YYYY-MM-DD');
            });
        });
    }
    
    // START
    loadShopData();
});
