// js/user-guide.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    setupModalListeners,
    setupUserMenuAndAuth,
    loadSVGs
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper style for inline buttons to make them look good in the guide
const btnStyle = `style="display: inline-block; pointer-events: none; margin: 0 4px; transform: scale(0.9);"`;
// New styles for the flex layout
const howToContainerStyle = `style="display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap;"`;
const textContentStyle = `style="flex: 1; min-width: 300px;"`;
const imageContainerStyle = `style="flex: 1; min-width: 300px; max-width: 700px;"`;
const imgStyle = `style="width: 100%; border-radius: 8px; border: 1px solid var(--border-color);"`;


const userGuideContent = {
    "introduction": `
        <div>
            <div class="guide-card">
                <h2>Welcome to the Mission! 🚀</h2>
                <p>Let's be honest. Modern sales can feel like trying to navigate an asteroid field in a spaceship held together with duct tape. You're juggling tasks, chasing leads, fighting off writer's block, and trying to find that one golden nugget of information that'll close the deal. It's... a lot.</p>
                <p><strong>That's where Constellation comes in.</strong></p>
                <p>Think of it less as a CRM and more as your mission control. It’s the co-pilot that’s had three cups of coffee before you've even had one. It's designed to clear the clutter from your dashboard so you can focus on what you actually do best: building relationships and closing deals.</p>
            </div>
            <div class="guide-card">
                <h4>What's the big idea?</h4>
                <p>We built Constellation around three core principles:</p>
                <ul>
                    <li><strong>Clarity Over Chaos:</strong> Your <strong>Command Center</strong> tells you exactly what to do and when. No more guessing games, just a clear flight path for your day.</li>
                    <li><strong>Automate the Annoying Stuff:</strong> With <strong>Sequences</strong> and <strong>Campaigns</strong>, you can build powerful outreach engines that work for you, ensuring no prospect ever falls through the cracks just because you got busy.</li>
                    <li><strong>Intelligence is Your Superpower:</strong> With <strong>Cognito</strong> and our other AI tools, you get an unfair advantage. We'll find the buying signals, help you write the perfect email, and even take notes from a business card for you. It's like having a secret research team at your beck and call.</li>
                </ul>
                <p>This guide will walk you through every button, feature, and AI-powered trick in the book. So grab your helmet, strap in, and let's get ready to launch. Your sales universe is about to get a whole lot bigger (and easier to manage).</p>
            </div>
        </div>
    `,
    "global-search": `
        <div>
            <div class="guide-card">
                <h2>1. Global Search: Your Universal Finder</h2>
                <p>The global search bar, located in the navigation sidebar of all main pages, allows you to search across all of your records simultaneously. It's the fastest way to find a specific contact, account, or deal without navigating away from your current page.</p>
                <h4>How to Use:</h4>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <ol>
                            <li>Simply type a name, company, or keyword into the "Global Search" bar.</li>
                            <li>The results will appear in a dropdown menu as you type, providing quick links to the relevant records.</li>
                            <li>Clicking a result will take you directly to that contact, account, or deal's detail page.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/command-center.PNG" alt="Global Search Bar Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "command-center": `
        <div>
            <div class="guide-card">
                <h2>2. The Command Center: Your Daily Hub</h2>
                <p>The Command Center is your home base. It’s the first page you see after logging in and is designed to show you exactly what you need to focus on for the day, from manual tasks to automated sequence steps.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>My Tasks</strong>: This table lists all tasks you've manually created. Tasks that are past their due date are highlighted so you can prioritize them.</li>
                    <li><strong>Add New Task Button</strong>: Quickly create new tasks and link them to contacts or accounts.</li>
                    <li><strong>Sequence Steps Due</strong>: Your automated to-do list, showing sequence steps due today or overdue.</li>
                    <li><strong>Actionable Steps</strong>: Dedicated buttons for streamlining sequence steps (e.g., "Go to LinkedIn," "Send Email").</li>
                    <li><strong>Upcoming Sequence Steps</strong>: A forward-looking view of automated outreach, helping you prepare for future engagements.</li>
                    <li><strong>Recent Activities</strong>: A log of your most recent logged activities, providing a quick look back at your work.</li>
                    <li><strong>Download Templates</strong>: You can download CSV templates for bulk importing data into the \`Contacts\`, \`Accounts\`, and \`Sequences\` pages.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Your Day from the Command Center</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Managing Manual Tasks:</h4>
                        <ol>
                            <li>On the Command Center page, click the <button class="btn-primary" ${btnStyle}>Add New Task</button> button.</li>
                            <li>In the pop-up, enter the task Description, an optional Due Date, and link it to a Contact or Account.</li>
                            <li>Click "Add Task".</li>
                            <li>To complete, edit, or delete a task, use the <button class="btn-primary" ${btnStyle}>Complete</button>, <button class="btn-secondary" ${btnStyle}>Edit</button>, or <button class="btn-danger" ${btnStyle}>Delete</button> buttons in the "Actions" column.</li>
                        </ol>
                        <h4>Completing Sequence Steps:</h4>
                        <ol>
                            <li>In the "Sequence Steps Due" table, identify the contact and the required action.</li>
                            <li>Use the action buttons like <button class="btn-primary" ${btnStyle}>Send Email</button> or <button class="btn-primary" ${btnStyle}>Go to LinkedIn</button> to execute the step.</li>
                            <li>After completing the action, click the final <button class="btn-primary" ${btnStyle}>Complete</button> button for that row to log the activity and advance the contact in the sequence.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/command-center.PNG" alt="Command Center Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "deals": `
        <div>
            <div class="guide-card">
                <h2>3. Deals: Managing Your Pipeline</h2>
                <p>The Deals page is where you track your sales pipeline from start to finish. It provides both a detailed table of your deals and high-level visual insights to help you forecast accurately.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Metric Cards</strong>: Real-time snapshots of key sales figures: your current commit, best case, total funnel, and month-to-date closed-won revenue. Managers can toggle between "My Deals" and "My Team's Deals."</li>
                    <li><strong>Deals Table</strong>: A comprehensive list of all your deals. Click any column header to sort the table, or click a deal's name to navigate directly to its associated account.</li>
                    <li><strong>"Committed" Checkbox</strong>: A key feature for forecasting.</li>
                    <li><strong>Deal Insights Charts</strong>: Visual breakdowns of your pipeline by Stage and a 30/60/90 Day Funnel.</li>
                    <li><strong>Deal Integrity</strong>: Deals cannot be deleted; move lost deals to the "Closed Lost" stage to maintain accurate history.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Deals</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Creating a New Deal:</h4>
                        <ol>
                            <li>Navigate to the <strong>Accounts</strong> page and select an account.</li>
                            <li>In the account's detail panel, click the <button class="btn-secondary" ${btnStyle}>New Deal</button> button.</li>
                            <li>Fill in the deal details and click "Create Deal".</li>
                        </ol>
                        <h4>Editing & Committing Deals:</h4>
                        <ol>
                            <li>On the Deals page, locate the deal in the table.</li>
                            <li>Click the <button class="btn-secondary" ${btnStyle}>Edit</button> button to update details in the modal.</li>
                            <li>Check the "Committed" checkbox in the first column to include the deal in your forecast.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/deals.PNG" alt="Deals Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "contacts": `
        <div>
            <div class="guide-card">
                <h2>4. Contacts: Your Relationship Hub</h2>
                <p>The Contacts page uses a powerful split-screen layout. On the left is a searchable list of contacts, and on the right is a detailed panel to view and edit their information.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Contact List Icons</strong>: See key information at a glance: a \`★\` indicates an organic contact, a \`🔥\` means recent activity, and a \`✈️\` means they are in an active sequence.</li>
                    <li><strong>Pending Task Reminders</strong>: A banner will appear at the top of a contact's details if they have any pending tasks, ensuring you never miss a follow-up.</li>
                    <li><strong>Action Buttons</strong>: Quickly <button class="btn-secondary" ${btnStyle}>Log Activity</button>, <button class="btn-secondary" ${btnStyle}>Assign Sequence</button>, or <button class="btn-secondary" ${btnStyle}>Add Task</button>.</li>
                    <li><strong>Contact Name Display Toggle</strong>: A feature on the Contacts page allows you to toggle the display format of contact names in the list view between "First Last" and "Last, First".</li>
                    <li><strong>Bulk Data Export</strong>: The Contacts page includes a button to download all of your records as a CSV file, enabling easy data backup or use in external tools.</li>
                    <li><strong>Sequence Status</strong>: See if a contact is in an automated sequence and manage their enrollment.</li>
                    <li><strong>AI Tools</strong>: Use <button class="btn-secondary" ${btnStyle}>Import Contact Screenshot</button> for data entry and <button class="btn-primary" ${btnStyle}>AI Activity Insight</button> for summaries.</li>
                    <li><strong>AI Email Generation</strong>: The Contacts page has a button to generate an email draft for a selected contact using an AI prompt.</li>
                </ul>
            </div>
             <div class="guide-card">
                <h3>Supercharge Your Workflow: Automatic Email Logging</h3>
                <p>Constellation offers a powerful way to keep your contact records up-to-date without any extra effort: automatic email logging. By simply adding a special address to the BCC field of your emails, Constellation will handle the rest.</p>
                <p><strong>Your unique logging address is:</strong> <code>bcc@constellation-crm.com</code></p>
                <h4>How It Works:</h4>
                <ul>
                    <li><strong>Automatic Association:</strong> When you send an email and include the address above in the BCC field, Constellation automatically scans the "To" field. If an email address matches a contact in your Constellation database, the entire email—including the subject, body, and even attachments—is saved as an activity for that contact.</li>
                    <li><strong>Attachment Handling:</strong> Any files attached to your email will be securely stored and linked to the activity log, so you'll always have a complete record of what you've sent.</li>
                    <li><strong>Privacy Guaranteed:</strong> Using BCC ensures that your contacts will never see the logging address. It's your secret tool for a perfectly updated CRM.</li>
                </ul>
            </div>
             <div class="guide-card">
                <h3>Your Personal AI Analyst: AI Activity Insight</h3>
                <p>Stop scrolling through months of activity logs. With a single click, Constellation's AI can analyze all past interactions with a contact and give you a concise summary and actionable advice.</p>
                <h4>How It Works:</h4>
                <ul>
                    <li><strong>Instant Summaries:</strong> Select any contact and click the <button class="btn-primary" ${btnStyle}>AI Activity Insight</button> button. The AI reads through all logged activities—emails, calls, notes, and sequence steps—to give you a quick overview of the relationship.</li>
                    <li><strong>Actionable Next Steps:</strong> Beyond just summarizing, the AI provides intelligent suggestions for your next move. Whether it's the perfect time to follow up, a topic to discuss, or a question to ask, you'll have a clear path forward.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>Beat Writer's Block: Write Email with AI</h3>
                <p>Staring at a blank email draft is a thing of the past. Let Constellation's AI be your personal copywriter, drafting effective outreach emails in seconds.</p>
                <h4>How It Works:</h4>
                <ol>
                    <li>Select a contact who has an email address.</li>
                    <li>Click the <button class="btn-primary" ${btnStyle}>Write Email with AI</button> button.</li>
                    <li>In the pop-up, simply tell the AI what you want to achieve. For example: "Write a follow-up email after our meeting about the new project," or "Draft a cold outreach email mentioning their company's recent expansion."</li>
                    <li>The AI will generate a complete email, including a subject line and body, ready for you to review and send.</li>
                </ol>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Contacts</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Adding & Editing:</h4>
                        <ol>
                            <li>Click <button class="btn-primary" ${btnStyle}>Add New Contact</button> to create a new record.</li>
                            <li>Select a contact and edit their details in the right-hand panel, then click <button class="btn-primary" ${btnStyle}>Save Changes</button>.</li>
                        </ol>
                        <h4>Sorting & Importing:</h4>
                        <ol>
                            <li>Use the <button class="btn-secondary" ${btnStyle}>First Name</button> or <button class="btn-secondary" ${btnStyle}>Last Name</button> toggles to sort the list.</li>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Bulk Import from CSV</button> to upload a file.</li>
                            <li>Click the <button class="btn-secondary" ${btnStyle}>Download Contacts CSV</button> button to export your contacts.</li>
                        </ol>
                        <h4>Using AI Tools:</h4>
                        <ol>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Import Contact Screenshot</button> and paste an image of a signature or use your camera for a business card.</li>
                            <li>Select a contact and click <button class="btn-primary" ${btnStyle}>AI Activity Insight</button> for an instant summary and next-step suggestions.</li>
                            <li>Click the <button class="btn-primary" ${btnStyle}>Write Email with AI</button> button to generate an email draft for a selected contact.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/contacts.PNG" alt="Contacts Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "accounts": `
        <div>
            <div class="guide-card">
                <h2>5. Accounts: Your 360-Degree Company View</h2>
                <p>The Accounts page is your central repository for all company-level information, using the same powerful split-screen layout as the Contacts page.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Account List Icons</strong>: See key information at a glance: a \`$\` indicates an open deal, and a \`🔥\` means recent activity.</li>
                    <li><strong>Account Filtering</strong>: Use the dropdown menu above the account list to filter by \`Hot Accounts\`, \`Accounts with Open Deals\`, \`Customers\`, or \`Prospects\`.</li>
                    <li><strong>Bulk Data Export</strong>: The Accounts page includes a button to download all of your records as a CSV file, enabling easy data backup or use in external tools.</li>
                    <li><strong>Action Buttons</strong>: <button class="btn-secondary" ${btnStyle}>New Deal</button> or <button class="btn-primary" ${btnStyle}>Add Task</button> directly from an account's page.</li>
                    <li><strong>Related Information</strong>: View all associated contacts, activities, and deals for a complete picture.</li>
                    <li><strong>AI Account Insight</strong>: Get instant summaries of interaction history for the entire account.</li>
                    <li><strong>Quick Link to Website</strong>: When you add a URL to the "Website" field for an account, a convenient external link icon appears, allowing you to open the company's website in a new tab with a single click.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>Your Personal AI Analyst: AI Account Insight</h3>
                <p>Get a bird's-eye view of your entire relationship with an account. This tool functions just like the AI Insight for contacts but analyzes activities across all contacts associated with the account.</p>
                <h4>How It Works:</h4>
                <ul>
                    <li><strong>Holistic Summaries:</strong> Select an account and click the <button class="btn-secondary" ${btnStyle}>AI Account Insight</button> button. The AI synthesizes all logged activities for every contact at that company to provide a comprehensive summary of the entire account relationship.</li>
                    <li><strong>Strategic Guidance:</strong> The AI doesn't just summarize—it provides strategic advice on how to best engage the account as a whole, helping you identify key players and craft a unified outreach strategy.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Accounts</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Adding & Editing:</h4>
                        <ol>
                            <li>Click <button class="btn-primary" ${btnStyle}>Add New Account</button> to create a new record.</li>
                            <li>Select an account, edit details in the right-hand panel, and click <button class="btn-primary" ${btnStyle}>Save Changes</button>.</li>
                        </ol>
                        <h4>Importing & Actions:</h4>
                        <ol>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Bulk Import from CSV</button> to upload a file.</li>
                            <li>Click the <button class="btn-secondary" ${btnStyle}>Bulk Export to CSV</button> button to export your accounts.</li>
                            <li>Select an account and click <button class="btn-secondary" ${btnStyle}>New Deal</button> to create a new sales opportunity.</li>
                            <li>Click <button class="btn-secondary" ${btnStyle}>AI Account Insight</button> for a summary of all activities related to the account.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/accounts.PNG" alt="Accounts Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "campaigns": `
        <div>
            <div class="guide-card">
                <h2>6. Campaigns: Targeted Outreach at Scale</h2>
                <p>The Campaigns page allows you to create and execute targeted outreach efforts to a filtered list of your contacts, perfect for product announcements, event invitations, or promotions.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Campaign Types</strong>: Create Call Blitz, Email Merge, or Guided Email campaigns.</li>
                    <li><strong>Dynamic Contact Filtering</strong>: Precisely target contacts based on account industry or customer/prospect status when creating a new campaign.</li>
                    <li><strong>Campaign Execution</strong>: A dedicated workflow UI guides you through each step.</li>
                    <li><strong>Email Template Management</strong>: A built-in tool to create, edit, clone, and delete reusable email templates for your campaigns.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Campaigns</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Creating a Campaign:</h4>
                        <ol>
                            <li>Click <button class="btn-primary" ${btnStyle}>Create New Campaign</button>, select a type, name it, and use filters to build your audience.</li>
                        </ol>
                        <h4>Managing Email Templates:</h4>
                        <ol>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Manage Email Templates</button> to open a modal where you can create new templates, or edit, delete, and clone existing ones.</li>
                        </ol>
                        <h4>Executing a Call Blitz:</h4>
                        <ol>
                            <li>Select an active Call Blitz and click <button class="btn-primary" ${btnStyle}>Start Calling</button>.</li>
                            <li>The UI presents contacts one-by-one. Log notes and click <button class="btn-primary" ${btnStyle}>Log Call & Next</button>.</li>
                        </ol>
                        <h4>Executing a Guided Email Campaign:</h4>
                        <ol>
                            <li>Select an active Guided Email campaign and click <button class="btn-primary" ${btnStyle}>Start Guided Emails</button>.</li>
                            <li>Review and personalize each email, then click <button class="btn-primary" ${btnStyle}>Open in Email Client & Next</button>.</li>
                        </ol>
                        <h4>Executing an Email Merge:</h4>
                        <ol>
                            <li>Select an active Email Merge campaign.</li>
                            <li>Click <button class="btn-primary" ${btnStyle}>Download Contacts (.csv)</button> and <button class="btn-secondary" ${btnStyle}>Download Email Template (.txt)</button> for use in an external tool.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/campaigns.PNG" alt="Campaigns Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "sequences": `
        <div>
            <div class="guide-card">
                <h2>7. Sequences: Automate Your Outreach</h2>
                <p>The Sequences page is where you build multi-step, automated outreach plans to ensure consistent follow-up with your prospects.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Personal vs. Marketing Sequences</strong>: Create your own or import pre-built templates.</li>
                    <li><strong>Multi-Step Builder</strong>: Add steps like emails, calls, or LinkedIn interactions. The step table allows you to edit, delete, or reorder steps.</li>
                    <li><strong>Pacing Delays</strong>: Define delays in days between each step.</li>
                    <li><strong>AI Generation</strong>: Effortlessly create entire sequences by defining your goals and letting AI draft the content.</li>
                    <li><strong>Bulk Assign Contacts</strong>: On the Sequences page, you can assign multiple contacts to a sequence at once from a single pop-up menu.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>Your Personal Strategist: AI Sequence Generation</h3>
                <p>Why build a sequence from scratch when you can have a sales expert design one for you? Constellation's AI Sequence Generator acts as your personal strategist, creating multi-step outreach campaigns tailored to your specific goals.</p>
                <h4>How It Works:</h4>
                <p>Simply provide the AI with a few key details:</p>
                <ul>
                    <li><strong>Your Goal:</strong> What do you want to achieve? (e.g., "Cold outreach for cloud solutions," "Follow-up after a webinar").</li>
                    <li><strong>The Structure:</strong> How many steps should it have, over how many days, and what kind of steps (Email, Call, LinkedIn, etc.)?</li>
                    <li><strong>Your Voice:</strong> Describe your sales persona (e.g., "Friendly and casual," "Formal B2B expert").</li>
                </ul>
                <p>Click <button class="btn-primary" ${btnStyle}>Generate Sequence with AI</button>, and Constellation will instantly draft a complete, multi-step sequence with professionally written email copy and logical follow-up tasks, all ready for you to review, save, and deploy.</p>
            </div>
            <div class="guide-card">
                <h3>How-To: Manage Sequences</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Creating a Sequence Manually:</h4>
                        <ol>
                            <li>Click <button class="btn-primary" ${btnStyle}>Add New Sequence</button>, give it a name, and click "Create".</li>
                            <li>With the sequence selected, click <button class="btn-secondary" ${btnStyle}>Add New Step</button> to build it out. You can also reorder steps using the arrows in the action column.</li>
                        </ol>
                        <h4>Importing a Marketing Sequence:</h4>
                        <ol>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Import Marketing Sequence</button> to see a list of pre-built templates created by your marketing team.</li>
                            <li>Select a template and click 'Import' to create a personal copy.</li>
                        </ol>
                        <h4>Using AI to Generate a Sequence:</h4>
                        <ol>
                            <li>Scroll to the "AI Generate New Sequence" section.</li>
                            <li>Fill in the details (Goal, Steps, Duration, Persona).</li>
                            <li>Click <button class="btn-primary" ${btnStyle}>Generate Sequence with AI</button>.</li>
                            <li>Review, edit, and click <button class="btn-primary" ${btnStyle}>Save AI Generated Sequence</button>.</li>
                        </ol>
                        <h4>Bulk Assigning Contacts:</h4>
                        <ol>
                            <li>Select a sequence from the list.</li>
                            <li>Click the <button class="btn-primary" ${btnStyle}>Bulk Assign Contacts</button> button to open a selection modal.</li>
                            <li>Select the contacts you wish to add to the sequence and confirm.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/sequences.PNG" alt="Sequences Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "cognito": `
        <div>
            <div class="guide-card">
                <h2>8. Cognito: Your AI-Powered Intelligence Agent</h2>
                <p>Cognito is your integrated tool for modern, intelligent selling, monitoring the web for timely buying signals.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Intelligence Alerts</strong>: An AI agent monitors news for buying signals related to your accounts. The \`Cognito\` nav button will display a bell icon (\`🔔\`) if there are new, unread alerts.</li>
                    <li><strong>Filters</strong>: The \`New Alerts\` section can be filtered by \`Trigger Type\`, \`Relevance\`, and \`Account\` to help you find the most important alerts.</li>
                    <li><strong>The Action Center</strong>: Clicking "Action" on an alert opens a modal where Cognito's AI drafts a personalized outreach email based on the news.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Use Cognito Intelligence Alerts</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <h4>Acting on an Alert:</h4>
                        <ol>
                            <li>Navigate to the Cognito page and review the Alert Cards.</li>
                            <li>On a relevant alert, click the <button class="btn-primary" ${btnStyle}>Action</button> button.</li>
                            <li>The Action Center modal opens with an AI-drafted email.</li>
                            <li>Review the draft, use the <button class="btn-tertiary" ${btnStyle}>Refine with Custom Prompt</button> button to regenerate it if needed.</li>
                            <li>Once satisfied, log the email and create follow-up tasks directly from the modal.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/cognito.PNG" alt="Cognito Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
            <div class="guide-card">
                <h3>Closing the Loop: Your Manual Next Steps</h3>
                <p>Cognito automates the discovery and the initial outreach, but the final, crucial steps are up to you. To maintain a clean and accurate record of your sales activities, it's essential to log your actions within the Action Center.</p>
                <h4>Why it Matters:</h4>
                <ul>
                    <li><strong>Logging an Interaction</strong> creates a permanent record on the contact's activity timeline. This is vital for your own memory and for the AI tools (like AI Insight) that rely on this history to provide accurate summaries.</li>
                    <li><strong>Creating a Task</strong> ensures you never forget to follow up. This action places a new to-do item directly in your Command Center, integrating your AI-driven outreach with your daily workflow.</li>
                </ul>
                 <h4>How-To: Log and Follow-Up</h4>
                 <ol>
                    <li>After sending your email, use the "Log an Interaction" section in the Action Center to jot down a quick note (e.g., "Emailed the new CIO about their recent funding round").</li>
                    <li>Use the "Create a Task" section to schedule your next step (e.g., "Follow up in 3 days if no reply").</li>
                 </ol>
            </div>
        </div>
    `,
    "social-hub": `
        <div>
            <div class="guide-card">
                <h2>9. Social Hub: Build Your Brand</h2>
                <p>The Social Hub makes it effortless to build your professional brand by providing a steady stream of high-quality, relevant content to share.</p>
                <h4>Key Features:</h4>
                <ul>
                    <li><strong>Curated Content</strong>: The Hub provides AI-curated news articles and pre-approved posts from your marketing team, clearly tagged as "News Article" or "Campaign Asset". The \`Social Hub\` nav button will display a bell icon (\`🔔\`) if there is new content to view.</li>
                    <li><strong>AI-Assisted Posting</strong>: When you prepare a post, the AI will generate suggested text which you can refine before sharing.</li>
                    <li><strong>Dismiss Irrelevant Content</strong>: You can permanently hide any post from your view by clicking the "Dismiss" button, keeping your feed tailored to what's most relevant to you and your network.</li>
                </ul>
            </div>
            <div class="guide-card">
                <h3>How-To: Share AI-Curated News</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <ol>
                            <li>Navigate to the Social Hub page.</li>
                            <li>Find a post tagged as "News Article".</li>
                            <li>Click <button class="btn-primary" ${btnStyle}>Prepare Post</button>.</li>
                            <li>A modal will open with AI-generated copy. You can refine this with a custom prompt.</li>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Copy Text</button> and then <button class="btn-primary" ${btnStyle}>Post to LinkedIn</button> to share.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/social-hub.PNG" alt="Social Hub Page Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
            <div class="guide-card">
                <h3>How-To: Share Marketing-Generated Posts</h3>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <ol>
                            <li>Find a post tagged as "Campaign Asset". These are pre-approved by your marketing team.</li>
                            <li>Click <button class="btn-primary" ${btnStyle}>Prepare Post</button>.</li>
                            <li>The modal will open with the pre-approved text, ready to go.</li>
                            <li>Click <button class="btn-secondary" ${btnStyle}>Copy Text</button> and then <button class="btn-primary" ${btnStyle}>Post to LinkedIn</button>.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/social-hub-II.PNG" alt="Social Hub Marketing Post Screenshot" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `,
    "theme-management": `
        <div>
            <div class="guide-card">
                <h2>10. User Menu</h2>
                <p>The User Menu, located at the bottom of the navigation bar, provides access to application themes, the user guide, and the logout function. Your name is displayed when the menu is collapsed.</p>
                <h4>How-To: Use the Menu</h4>
                <div ${howToContainerStyle}>
                    <div ${textContentStyle}>
                        <ol>
                            <li>Click your user name at the bottom of the navigation bar to open the user menu.</li>
                            <li>Click <button class="nav-button" ${btnStyle}>Theme: <span id="theme-name">Dark</span></button> to cycle through the available visual themes.</li>
                            <li>Click <a href="user-guide.html" class="nav-button" ${btnStyle}>User Guide</a> to access this guide at any time.</li>
                             <li>Click <button class="nav-button" ${btnStyle} style="background-color: #773030;">Logout</button> to securely sign out of the application.</li>
                        </ol>
                    </div>
                    <div ${imageContainerStyle}>
                        <img src="assets/user-guide/command-center-II.PNG" alt="User Menu with Theme Toggle" ${imgStyle}>
                    </div>
                </div>
            </div>
        </div>
    `
};

const state = { currentUser: null };

const authContainer = document.getElementById("auth-container");
const mainAppContainer = document.getElementById("user-guide-container");
const navList = document.getElementById('user-guide-nav');
const contentPane = document.getElementById('user-guide-content');

const loadContent = (sectionId) => {
    if (!contentPane) return;
    const content = userGuideContent[sectionId] || `<h2>Content Not Found</h2>`;
    contentPane.innerHTML = content;
};

function setupPageEventListeners() {
    setupModalListeners();
    if (navList) {
        navList.addEventListener('click', (event) => {
            event.preventDefault();
            const navButton = event.target.closest('.nav-button');
            if (navButton) {
                document.querySelectorAll('#user-guide-nav .nav-button').forEach(btn => btn.classList.remove('active'));
                navButton.classList.add('active');
                const sectionId = navButton.dataset.section;
                loadContent(sectionId);
            }
        });
    }
}

async function initializePage() {
    await loadSVGs();
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            state.currentUser = session.user;
            if (authContainer) authContainer.classList.add('hidden');
            if (mainAppContainer) mainAppContainer.classList.remove('hidden');
            await setupUserMenuAndAuth(supabase, state);
            const initialSection = navList?.querySelector('.nav-button.active');
            if (initialSection) {
                loadContent(initialSection.dataset.section);
            }
        } else {
            state.currentUser = null;
            if (authContainer) authContainer.classList.remove('hidden');
            if (mainAppContainer) mainAppContainer.classList.add('hidden');
        }
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        if (authContainer) authContainer.classList.remove('hidden');
        if (mainAppContainer) mainAppContainer.classList.add('hidden');
    }
    setupPageEventListeners();
}

document.addEventListener("DOMContentLoaded", initializePage);
