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
        currentView: 'resource', 
        trades: [],
        projects: [],
        tasks: [],
        availability: [], 
        isDragging: false,
        dragTask: null,
        dragEl: null,
        dragStartX: 0,
        dragStartLeft: 0,
        hasMoved: false
    };

    // ------------------------------------------------------------------------
    // 3. HELPERS (BUSINESS DAYS & COLORS)
    // ------------------------------------------------------------------------
    
    // 5-DAY WORK WEEK CALCULATION
    function addBusinessDays(date, daysToAdd) {
        let d = dayjs(date);
        let added = 0;
        // If daysToAdd is 0, just return current, but ensure it's a weekday? 
        // For simplicity, we assume start dates are valid.
        while (added < daysToAdd) {
            d = d.add(1, 'day');
            // 0 = Sunday, 6 = Saturday. Skip them.
            if (d.day() !== 0 && d.day() !== 6) {
                added++;
            }
        }
        return d;
    }

    // Industrial Color Palette
    const TRADE_COLORS = {
        1: '#546E7A', // Kickoff (Blue Grey)
        2: '#1E88E5', // Design (Engineering Blue)
        3: '#D4AF37', // Fabrication (Metallic Gold/Bronze)
        4: '#8D6E63', // Woodworking (Walnut)
        5: '#66BB6A', // Installation (Green)
        6: '#7E57C2'  // Finishing (Purple)
    };

    function getProjectColor(id) {
        const colors = ['#37474F', '#00695C', '#BF360C', '#4A148C', '#0D47A1', '#827717'];
        return colors[id % colors.length];
    }

    function getTradeColor(id) {
        return TRADE_COLORS[id] || 'var(--primary-gold)'; 
    }

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

    function checkAvailabilityConflict(taskId, newStartDate, newEndDate) {
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !task.assigned_talent_id) return null; 

        const start = dayjs(newStartDate);
        const end = dayjs(newEndDate);
        const days = end.diff(start, 'day') + 1;
        
        for (let i = 0; i < days; i++) {
            const checkDate = start.add(i, 'day').format('YYYY-MM-DD');
            const conflict = state.availability.find(a => 
                a.talent_id === task.assigned_talent_id && 
                a.date === checkDate && 
                a.status === 'PTO'
            );
            if (conflict) return { date: checkDate, talentId: task.assigned_talent_id };
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // 4. VIEW CONTROL
    // ------------------------------------------------------------------------
    const btnResource = document.getElementById('view-resource-btn');
    const btnProject = document.getElementById('view-project-btn');

    if (btnResource && btnProject) {
        btnResource.addEventListener('click', () => switchView('resource'));
        btnProject.addEventListener('click', () => switchView('project'));
    }

    function switchView(view) {
        state.currentView = view;
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
        renderGantt();
    }

    // ------------------------------------------------------------------------
    // 5. DATA LOADING
    // ------------------------------------------------------------------------
    async function loadShopData() {
        console.log("Loading Ten Works Production Data...");
        
        const [tradesRes, tasksRes, projectsRes, availRes] = await Promise.all([
            supabase.from('shop_trades').select('*').order('id'),
            supabase.from('project_tasks').select(`*, projects(name), shop_trades(name)`),
            supabase.from('projects').select('*').order('start_date'),
            supabase.from('talent_availability').select('*') 
        ]);

        if (tradesRes.error) console.error("Error loading data:", tradesRes.error);
        
        state.trades = tradesRes.data || [];
        state.tasks = tasksRes.data || [];
        state.projects = projectsRes.data || [];
        state.availability = availRes.data || []; 

        renderGantt();
        updateMetrics();
    }

    // ------------------------------------------------------------------------
    // 6. RENDER ENGINE (5-DAY LOGIC + CRDD INDICATORS)
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
            
            // Visual tweak: Grey out weekends to emphasize 5-day work week
            const bgStyle = isWeekend ? 'background:rgba(255,255,255,0.05);' : '';

            dateHtml += `
                <div class="date-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}" style="${bgStyle}">
                    <span style="font-weight:700;">${current.format('DD')}</span>
                    <span>${current.format('ddd')}</span>
                </div>
            `;
        }
        dateHeader.innerHTML = dateHtml;
        const totalWidth = daysToRender * dayWidth;
        dateHeader.style.width = `${totalWidth}px`;
        gridCanvas.style.width = `${totalWidth}px`;
        
        gridCanvas.style.backgroundImage = 'linear-gradient(90deg, var(--border-color) 1px, transparent 1px)';
        gridCanvas.style.backgroundSize = '100px 100%'; 

        // B. ROWS & BARS
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        const rows = state.currentView === 'resource' ? state.trades : state.projects;
        let currentY = 0; 

        rows.forEach((rowItem, index) => {
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                else return t.project_id === rowItem.id;
            });

            const numLanes = packTasks(rowTasks);
            const barHeight = 26;
            const barMargin = 6;
            const rowPadding = 20;
            const calculatedHeight = Math.max(70, (numLanes * (barHeight + barMargin)) + rowPadding);

            const isOdd = index % 2 === 1;
            const rowBackground = isOdd ? 'rgba(255, 255, 255, 0.025)' : 'transparent'; 

            // 1. Sidebar
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            rowEl.style.height = `${calculatedHeight}px`; 
            rowEl.style.backgroundColor = rowBackground; 
            
            if (state.currentView === 'resource') {
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>`;
            } else {
                let statusColor = '#888';
                if(rowItem.status === 'In Progress') statusColor = 'var(--primary-blue)';
                if(rowItem.status === 'Completed') statusColor = '#4CAF50';
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role" style="color:${statusColor}">${rowItem.status}</div>`;
            }
            resourceList.appendChild(rowEl);

            // 2. Grid Row Background
            const rowBg = document.createElement('div');
            rowBg.style.position = 'absolute';
            rowBg.style.top = `${currentY}px`;
            rowBg.style.left = '0';
            rowBg.style.width = '100%';
            rowBg.style.height = `${calculatedHeight}px`;
            rowBg.style.backgroundColor = rowBackground;
            rowBg.style.borderBottom = '1px solid var(--border-color)';
            rowBg.style.zIndex = '0';
            gridCanvas.appendChild(rowBg);

            // --- 3. CRDD (TARGET COMPLETION) HIGHLIGHT ---
            // Only relevant in Project View
            if (state.currentView === 'project' && rowItem.end_date) {
                const targetDate = dayjs(rowItem.end_date);
                const targetDiff = targetDate.diff(startDate, 'day');
                
                if (targetDiff >= 0 && targetDiff < daysToRender) {
                    const targetCell = document.createElement('div');
                    targetCell.style.position = 'absolute';
                    targetCell.style.top = `${currentY}px`;
                    targetCell.style.left = `${targetDiff * dayWidth}px`; // Occupy the whole day cell
                    targetCell.style.width = `${dayWidth}px`;
                    targetCell.style.height = `${calculatedHeight}px`;
                    
                    // Visuals: Checkered BG and Gold Border
                    targetCell.style.background = 'repeating-linear-gradient(45deg, rgba(212, 175, 55, 0.1), rgba(212, 175, 55, 0.1) 10px, rgba(212, 175, 55, 0.05) 10px, rgba(212, 175, 55, 0.05) 20px)';
                    targetCell.style.borderRight = '3px solid var(--primary-gold)'; // The Finish Line
                    targetCell.style.zIndex = '0'; // Behind bars
                    targetCell.title = `Target Completion: ${targetDate.format('MMM D')}`;
                    
                    // Large Flag Icon
                    const flag = document.createElement('div');
                    flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
                    flag.style.position = 'absolute';
                    flag.style.bottom = '5px'; // Bottom right
                    flag.style.right = '5px';
                    flag.style.color = 'var(--primary-gold)';
                    flag.style.fontSize = '24px'; // Larger as requested
                    flag.style.opacity = '0.8';
                    
                    targetCell.appendChild(flag);
                    gridCanvas.appendChild(targetCell);
                }
            }
            // ---------------------------------------------

            // 4. Render Task Bars
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

                // Industrial Colors
                let barColor;
                if (state.currentView === 'project') {
                    barColor = getTradeColor(task.trade_id);
                } else {
                    barColor = getProjectColor(task.project_id);
                }
                bar.style.backgroundColor = barColor;
                bar.style.backgroundImage = 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(0,0,0,0.1))';
                bar.style.border = '1px solid rgba(255,255,255,0.15)';

                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.5)';
                const label = state.currentView === 'resource' ? task.projects?.name : task.shop_trades?.name;

                bar.innerHTML = `
                    <span class="gantt-task-info" style="pointer-events:none; line-height:${barHeight}px; text-shadow:0 1px 3px black; padding-left:8px;">${label || task.name}</span>
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
    // 7. PHYSICS ENGINE
    // ------------------------------------------------------------------------
    function handleDragStart(e, task, element) {
        if (e.button !== 0) return; 

        state.isDragging = true;
        state.dragTask = task;
        state.dragEl = element;
        state.dragStartX = e.clientX;
        state.dragStartLeft = parseInt(element.style.left || 0);
        state.hasMoved = false;

        element.style.cursor = 'grabbing';
        element.style.zIndex = 1000;
        element.style.transition = 'none'; 

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!state.isDragging) return;
        const deltaX = e.clientX - state.dragStartX;
        if (Math.abs(deltaX) > 5) state.hasMoved = true;
        state.dragEl.style.left = `${state.dragStartLeft + deltaX}px`;
    }

    async function handleDragEnd(e) {
        if (!state.isDragging) return;

        state.isDragging = false;
        state.dragEl.style.cursor = 'grab';
        state.dragEl.style.zIndex = '';
        state.dragEl.style.transition = 'all 0.2s'; 
        
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        if (!state.hasMoved) {
            state.dragEl.style.left = `${state.dragStartLeft}px`; 
            openTaskModal(state.dragTask);
            return;
        }

        const currentLeft = parseInt(state.dragEl.style.left || 0);
        const snapLeft = Math.round(currentLeft / 100) * 100; 
        state.dragEl.style.left = `${snapLeft}px`; 

        const pixelShift = snapLeft - state.dragStartLeft;
        const dayShift = Math.round(pixelShift / 100);

        if (dayShift !== 0) {
            console.log(`Shifting task ${state.dragTask.name} by ${dayShift} days.`);

            // Note: Drag physics still uses calendar days for consistency with grid visual
            // Only the Mission Planner uses the strict 5-day logic for creation
            const oldStart = state.dragTask.start_date;
            const newStart = dayjs(state.dragTask.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
            const newEnd = dayjs(state.dragTask.end_date).add(dayShift, 'day').format('YYYY-MM-DD');

            const conflict = checkAvailabilityConflict(state.dragTask.id, newStart, newEnd);
            if (conflict) {
                const confirmMove = confirm(`WARNING: The assigned staff member is marked as PTO on ${conflict.date}.\n\nDo you still want to move this task?`);
                if (!confirmMove) {
                    state.dragEl.style.left = `${state.dragStartLeft}px`;
                    return; 
                }
            }

            state.dragTask.start_date = newStart;
            state.dragTask.end_date = newEnd;

            const { error } = await supabase.from('project_tasks')
                .update({ start_date: newStart, end_date: newEnd })
                .eq('id', state.dragTask.id);

            if (error) {
                console.error("Move failed, reverting...", error);
                state.dragTask.start_date = oldStart; 
                loadShopData(); 
                return;
            }

            // Cascade
            const { data: children } = await supabase.from('project_tasks').select('*').eq('dependency_task_id', state.dragTask.id);
            if (children && children.length > 0) {
                const updatePromises = children.map(child => {
                    const cStart = dayjs(child.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    const cEnd = dayjs(child.end_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    return supabase.from('project_tasks').update({ start_date: cStart, end_date: cEnd }).eq('id', child.id);
                });
                await Promise.all(updatePromises);
            }
            loadShopData();
        }
    }

    // ------------------------------------------------------------------------
    // 8. EDIT MODAL
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

    function updateMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        
        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');
        
        if(revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if(countEl) countEl.textContent = activeProjects.length;

        const today = dayjs();
        const activeTasks = state.tasks.filter(t => 
            dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)
        ).length;
        
        const capacity = 13; 
        const load = Math.min((activeTasks / capacity) * 100, 100);
        
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    // ------------------------------------------------------------------------
    // 10. MISSION PLANNER (With 5-Day Logic & CRDD)
    // ------------------------------------------------------------------------
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            const { data: deals, error } = await supabase.from('deals_tw').select('*').order('created_at', { ascending: false });
            if (error) { alert("Error fetching deals: " + error.message); return; }
            if (!deals || deals.length === 0) { alert("No deals found in 'deals_tw' table."); return; }

            const options = deals.map(d => {
                const name = d.deal_name || d.name || 'Unnamed';
                const amt = d.amount || 0;
                return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)})</option>`;
            }).join('');

            // Initialize Calculation Defaults
            const today = dayjs();
            const start = today; 
            
            // 5-Day Work Week Waterfall
            // We use the helper addBusinessDays(start, days)
            const p1End = addBusinessDays(start, 2);  // Kickoff: 2 biz days
            const p2Start = addBusinessDays(p1End, 1);
            const p2End = addBusinessDays(p2Start, 7); // Design: 7 biz days
            const p3Start = addBusinessDays(p2End, 1);
            const p3End = addBusinessDays(p3Start, 14); // Fab: 14 biz days
            const p4Start = addBusinessDays(p3End, 1);
            const p4End = addBusinessDays(p4Start, 4); // Install: 4 biz days

            // Default Requested Completion (CRDD) - Default to end of installation
            const defTarget = p4End.format('YYYY-MM-DD');

            showModal('Launch Project Plan', `
                <div class="form-group"><label>Select Deal</label><select id="launch-deal" class="form-control" style="background:var(--bg-dark); color:white; padding:10px; width:100%; box-sizing:border-box;">${options}</select></div>
                <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h4 style="color:var(--text-bright); margin:0;">Phase Scheduling</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width:350px;">
                            <div>
                                <label style="margin:0; font-size:0.7rem; color:var(--text-dim);">Project Start:</label>
                                <input type="date" id="master-start-date" class="form-control" style="width:100%;" value="${start.format('YYYY-MM-DD')}">
                            </div>
                            <div>
                                <label style="margin:0; font-size:0.7rem; color:var(--primary-gold);">Target Completion:</label>
                                <input type="date" id="master-end-date" class="form-control" style="width:100%; border:1px solid var(--primary-gold);" value="${defTarget}">
                            </div>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; align-items:center; margin-bottom:5px; font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;"><span>Phase</span><span>Start</span><span>End</span><span>Est. Hrs</span></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Kickoff</span><input type="date" id="p1-start" class="form-control" value="${start.format('YYYY-MM-DD')}"><input type="date" id="p1-end" class="form-control" value="${p1End.format('YYYY-MM-DD')}"><input type="number" id="p1-hrs" class="form-control" value="5"></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Design</span><input type="date" id="p2-start" class="form-control" value="${p2Start.format('YYYY-MM-DD')}"><input type="date" id="p2-end" class="form-control" value="${p2End.format('YYYY-MM-DD')}"><input type="number" id="p2-hrs" class="form-control" value="20"></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Fabrication</span><input type="date" id="p3-start" class="form-control" value="${p3Start.format('YYYY-MM-DD')}"><input type="date" id="p3-end" class="form-control" value="${p3End.format('YYYY-MM-DD')}"><input type="number" id="p3-hrs" class="form-control" value="80"></div>
                    <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Installation</span><input type="date" id="p4-start" class="form-control" value="${p4Start.format('YYYY-MM-DD')}"><input type="date" id="p4-end" class="form-control" value="${p4End.format('YYYY-MM-DD')}"><input type="number" id="p4-hrs" class="form-control" value="24"></div>
                </div>
            `, async () => {
                const sel = document.getElementById('launch-deal');
                if(!sel.value) return;
                const name = sel.options[sel.selectedIndex].dataset.name;
                const amt = sel.options[sel.selectedIndex].dataset.amt;
                const crdd = document.getElementById('master-end-date').value; // User requested date

                const dates = {
                    p1s: document.getElementById('p1-start').value, p1e: document.getElementById('p1-end').value, p1h: document.getElementById('p1-hrs').value,
                    p2s: document.getElementById('p2-start').value, p2e: document.getElementById('p2-end').value, p2h: document.getElementById('p2-hrs').value,
                    p3s: document.getElementById('p3-start').value, p3e: document.getElementById('p3-end').value, p3h: document.getElementById('p3-hrs').value,
                    p4s: document.getElementById('p4-start').value, p4e: document.getElementById('p4-end').value, p4h: document.getElementById('p4-hrs').value,
                };

                // Create Project with CRDD as end_date
                const { data: proj, error: projError } = await supabase.from('projects').insert([{ 
                    deal_id: sel.value, 
                    name, 
                    start_date: dates.p1s, 
                    end_date: crdd, // Use the Target Date here
                    project_value: amt, 
                    status: 'Pre-Production' 
                }]).select();
                
                if(projError) { alert(projError.message); return; }
                const pid = proj[0].id;

                // Create Tasks (Using the Waterfall Dates)
                const { data: t1 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff & Plan', start_date: dates.p1s, end_date: dates.p1e, estimated_hours: dates.p1h }).select();
                const { data: t2 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[1]?.id||2, name: 'CAD Drawings', start_date: dates.p2s, end_date: dates.p2e, estimated_hours: dates.p2h, dependency_task_id: t1[0].id }).select();
                const { data: t3 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fabrication', start_date: dates.p3s, end_date: dates.p3e, estimated_hours: dates.p3h, dependency_task_id: t2[0].id }).select();
                await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Installation', start_date: dates.p4s, end_date: dates.p4e, estimated_hours: dates.p4h, dependency_task_id: t3[0].id });

                loadShopData();
            });
            
            // SMART AUTO-UPDATER (Recalculate waterfall using 5-Day Logic)
            document.getElementById('master-start-date').addEventListener('change', (e) => {
                const s = dayjs(e.target.value);
                
                // Recalculate Business Days
                const d1e = addBusinessDays(s, 2);
                const d2s = addBusinessDays(d1e, 1);
                const d2e = addBusinessDays(d2s, 7);
                const d3s = addBusinessDays(d2e, 1);
                const d3e = addBusinessDays(d3s, 14);
                const d4s = addBusinessDays(d3e, 1);
                const d4e = addBusinessDays(d4s, 4);

                document.getElementById('p1-start').value = s.format('YYYY-MM-DD');
                document.getElementById('p1-end').value = d1e.format('YYYY-MM-DD');
                document.getElementById('p2-start').value = d2s.format('YYYY-MM-DD');
                document.getElementById('p2-end').value = d2e.format('YYYY-MM-DD');
                document.getElementById('p3-start').value = d3s.format('YYYY-MM-DD');
                document.getElementById('p3-end').value = d3e.format('YYYY-MM-DD');
                document.getElementById('p4-start').value = d4s.format('YYYY-MM-DD');
                document.getElementById('p4-end').value = d4e.format('YYYY-MM-DD');
                
                // Also auto-update target completion to match natural end
                document.getElementById('master-end-date').value = d4e.format('YYYY-MM-DD');
            });
        });
    }
    
    // START
    loadShopData();
});
