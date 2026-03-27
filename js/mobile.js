import { SUPABASE_URL, SUPABASE_ANON_KEY, hideGlobalLoader } from './shared_constants.js';

console.log("Mobile JS starting...");

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

let state = {
    user: null,
    profile: null,
    talentRecord: null,
    isLeader: false,
    tasks: [],
    assignments: [],
    projects: [],
    team: []
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded, initializing mobile app...");
    // Register SW for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    console.log("Session fetched:", sessionData);
    if (sessionError) {
        hideGlobalLoader();
        console.error("Session Error:", sessionError);
        alert("Session error: " + sessionError.message);
        return;
    }
    
    const session = sessionData?.session;
    if (!session || !session.user) {
        console.log("No valid session, redirecting to index.html");
        window.location.href = 'index.html';
        return;
    }
    state.user = session.user;
    console.log("User authenticated:", state.user.email);

    document.getElementById('mobile-user-menu').addEventListener('click', async () => {
        if(confirm('Log out?')) {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        }
    });

    // Bottom Nav listener
    document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.dataset.target;
            document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.getElementById('leader-tab-tasks').classList.add('hidden');
            document.getElementById('leader-tab-team').classList.add('hidden');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    await loadData();
});

async function loadData() {
    console.log("Starting loadData...");
    // We removed the hardcoded loader from HTML, so we don't need to manipulate it here.
    document.getElementById('view-laborer').classList.add('hidden');
    document.getElementById('view-leader').classList.add('hidden');

    try {
        // 1. Determine Role
        // In TenWorks, we check if the user is a manager by looking at the auth metadata or falling back to a default.
        // If there is no user_profiles table, we can assume they are a manager for now, or check a different table.
        // For now, let's assume if they are logged in, they might be a manager if their email matches an admin list, 
        // or we just default to true for testing the leader view.
        state.isLeader = true; // Temporary fallback if user_profiles doesn't exist

        const { data: talent, error: talentErr } = await supabase.from('shop_talent').select('*').eq('active', true);
        if (talentErr) {
            console.error("Talent Error:", talentErr);
            throw talentErr;
        }
        state.team = talent || [];
        
        const fullName = state.user?.user_metadata?.full_name || '';
        state.talentRecord = state.team.find(t => t.name.toLowerCase() === fullName.toLowerCase());

        // 2. Fetch Tasks & Assignments for Today
        const todayStr = dayjs().format('YYYY-MM-DD');
        console.log("Fetching tasks for today:", todayStr);
        
        const [assignRes, tasksRes, projRes] = await Promise.all([
            supabase.from('task_assignments').select('*').eq('assigned_date', todayStr),
            supabase.from('project_tasks').select('*'),
            supabase.from('projects').select('*')
        ]);

        if (assignRes.error) { console.error("Assign Error:", assignRes.error); throw assignRes.error; }
        if (tasksRes.error) { console.error("Tasks Error:", tasksRes.error); throw tasksRes.error; }
        if (projRes.error) { console.error("Proj Error:", projRes.error); throw projRes.error; }

        state.assignments = assignRes.data || [];
        state.tasks = tasksRes.data || [];
        state.projects = projRes.data || [];
        
        console.log(`Loaded ${state.assignments.length} assignments, ${state.tasks.length} tasks, ${state.projects.length} projects`);

    } catch (error) {
        hideGlobalLoader();
        console.error("Error loading data:", error);
        alert("Failed to load data: " + error.message);
    } finally {
        console.log("loadData complete");
        hideGlobalLoader();
    }

    if (state.isLeader) {
        console.log("Rendering Leader View");
        document.getElementById('view-leader').classList.remove('hidden');
        document.getElementById('view-leader').style.display = 'block';
        document.getElementById('mobile-bottom-nav').classList.remove('hidden');
        document.getElementById('mobile-bottom-nav').style.display = 'flex';
        renderLeaderView();
    } else {
        console.log("Rendering Laborer View");
        document.getElementById('view-laborer').classList.remove('hidden');
        document.getElementById('view-laborer').style.display = 'block';
        renderLaborerView();
    }
}

function getTaskDetails(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return null;
    const project = state.projects.find(p => p.id === task.project_id);
    return { task, project };
}

// --- LABORER VIEW ---
function renderLaborerView() {
    const list = document.getElementById('laborer-tasks-list');
    if (!state.talentRecord) {
        list.innerHTML = '<p style="color:var(--text-dim);">Your user profile is not linked to a shop floor record.</p>';
        return;
    }

    const myAssignments = state.assignments.filter(a => a.talent_id === state.talentRecord.id);

    if (myAssignments.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim);">No tasks assigned for today.</p>';
        return;
    }

    list.innerHTML = myAssignments.map(a => {
        const details = getTaskDetails(a.task_id);
        if (!details) return '';
        const { task, project } = details;
        
        return `
            <div class="mobile-card">
                <div class="mobile-card-title">${task.name}</div>
                <div class="mobile-card-subtitle">${project ? project.name : 'Unknown Project'}</div>
                <div class="mobile-card-meta">
                    <span>Allocated: ${a.hours}h</span>
                    <span style="color: ${task.status === 'Completed' ? 'var(--success-green)' : 'var(--text-bright)'}">${task.status || 'Pending'}</span>
                </div>
                <div class="mobile-card-actions">
                    <button class="mobile-btn mobile-btn-secondary" onclick="window.openLogTimeModal(${task.id})">Log Time</button>
                    ${task.status !== 'Completed' ? `<button class="mobile-btn mobile-btn-success" onclick="window.markTaskComplete(${task.id})">Complete</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// --- LEADER VIEW ---
function renderLeaderView() {
    const tasksList = document.getElementById('leader-tasks-list');
    const teamList = document.getElementById('leader-team-list');

    // Render Tasks
    if (state.assignments.length === 0) {
        tasksList.innerHTML = '<p style="color:var(--text-dim);">No tasks scheduled for today.</p>';
    } else {
        tasksList.innerHTML = state.assignments.map(a => {
            const details = getTaskDetails(a.task_id);
            if (!details) return '';
            const { task, project } = details;
            const person = state.team.find(t => t.id === a.talent_id);
            
            return `
                <div class="mobile-card">
                    <div class="mobile-card-title">${task.name}</div>
                    <div class="mobile-card-subtitle">${project ? project.name : 'Unknown'}</div>
                    <div class="mobile-card-meta">
                        <span><i class="fas fa-user"></i> ${person ? person.name : 'Unassigned'}</span>
                        <span>${task.status || 'Pending'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Team
    teamList.innerHTML = state.team.map(t => {
        const personAssignments = state.assignments.filter(a => a.talent_id === t.id);
        const totalHours = personAssignments.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        
        return `
            <div class="mobile-team-member">
                <div class="mobile-team-name">${t.name}</div>
                <div class="mobile-team-status">${totalHours > 0 ? `${totalHours}h Assigned` : 'Idle'}</div>
            </div>
        `;
    }).join('');
}

// --- ACTIONS ---
window.openLogTimeModal = (taskId) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('mobile-modal-backdrop');
    document.getElementById('mobile-modal-title').textContent = 'Log Time';
    document.getElementById('mobile-modal-body').innerHTML = `
        <p style="margin-bottom:10px; font-size:0.9rem; color:var(--text-dim);">Task: ${task.name}</p>
        <label style="display:block; margin-bottom:5px;">Actual Hours</label>
        <input type="number" id="mobile-actual-hours" class="mobile-input" step="0.25" min="0" value="${task.actual_hours || 0}">
    `;
    
    document.getElementById('mobile-modal-actions').innerHTML = `
        <button class="mobile-btn mobile-btn-secondary" id="btn-cancel-modal">Cancel</button>
        <button class="mobile-btn mobile-btn-primary" id="btn-save-modal">Save</button>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-cancel-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('btn-save-modal').onclick = async () => {
        const hours = parseFloat(document.getElementById('mobile-actual-hours').value) || 0;
        const { error } = await supabase.from('project_tasks').update({ actual_hours: hours }).eq('id', taskId);
        if (error) {
            alert('Error saving hours: ' + error.message);
        } else {
            modal.classList.add('hidden');
            await loadData(); // refresh
        }
    };
};

window.markTaskComplete = async (taskId) => {
    if(confirm('Mark this task as completed?')) {
        const { error } = await supabase.from('project_tasks').update({ status: 'Completed' }).eq('id', taskId);
        if (error) {
            alert('Error: ' + error.message);
        } else {
            await loadData();
        }
    }
};