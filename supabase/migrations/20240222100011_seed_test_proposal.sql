-- Seed one robust test proposal for the Proposal Generator.
-- Uses the first auth user so it shows in Load proposal. To assign to a different user, run:
--   UPDATE proposals_tw SET user_id = 'your-user-uuid' WHERE title = 'Key Construction – Main St';

insert into public.proposals_tw (
  user_id,
  deal_id,
  project_id,
  title,
  client_name,
  content_json,
  status
)
select
  u.id,
  null,
  null,
  'Key Construction – Main St',
  'Key Construction',
  '{
    "client_name": "Key Construction",
    "sales_rep": "Chad Hershberger",
    "project_start": "2026-03-15",
    "project_complete": "2026-06-30",
    "cover_letter": "Dear Key Construction team,\n\nThank you for the opportunity to propose on the Main Street lobby and staircase package. Ten Works is prepared to deliver custom metal and wood fabrication that meets your schedule and quality standards.\n\nThis proposal outlines scope, deliverables, exclusions, and proposed costs. We have included a project timeline that aligns with your spring groundbreaking.\n\nWe look forward to discussing next steps.\n\nBest regards,\nChad Hershberger\nTen Works",
    "proposal_notes": "Follow up Tuesday. Ask about Phase 2 millwork.",
    "element_order": ["title", "cover", "scope_finishes", "deliverables", "exclusions", "pricing", "project_timeline"],
    "locations": [
      {
        "id": "a1b2c3d4-0001-4000-8000-000000000001",
        "name": "Main St Lobby",
        "rows": [
          { "description": "Custom steel stringers and tread supports", "qty": 1, "amount": "18500" },
          { "description": "Oak treads and risers (finished)", "qty": 24, "amount": "420" },
          { "description": "Metal rail and baluster package", "qty": 1, "amount": "9200" },
          { "description": "Delivery and staging", "qty": 1, "amount": "850" }
        ]
      },
      {
        "id": "a1b2c3d4-0002-4000-8000-000000000002",
        "name": "Landing & guard",
        "rows": [
          { "description": "Guard assembly (powder coat)", "qty": 1, "amount": "3400" },
          { "description": "Installation (2 days)", "qty": 1, "amount": "2800" }
        ]
      }
    ],
    "scope_finishes": {
      "narrative": "Scope includes design-assist for connection details, fabrication of steel stair structure and wood treads/risers, and metal rail/guard. All work per approved shop drawings. Finish: oak treads and risers with oil-based clear; steel with specified powder coat. Installation by Ten Works crew over two days with crane/staging as needed.",
      "materials": [
        { "name": "Structural steel", "finish": "Prime + field paint per spec" },
        { "name": "Treads & risers", "finish": "White oak, oil clear" },
        { "name": "Rail / baluster", "finish": "Black powder coat" }
      ]
    },
    "deliverables": [
      { "item": "Shop drawings", "description": "Stair and rail for approval", "qty": 1 },
      { "item": "Steel submittal", "description": "Material certs and finish", "qty": 1 },
      { "item": "Tread/riser mock-up", "description": "Finish sample on site", "qty": 1 },
      { "item": "As-built", "description": "Final dimensions and photos", "qty": 1 }
    ],
    "exclusions": [
      "Site preparation and leveling",
      "Electrical hookups and permitting",
      "Concrete work at base",
      "Painting beyond prime on steel"
    ],
    "project_timeline": [
      { "taskName": "Shop drawings approved", "startDate": "2026-03-15", "endDate": "2026-03-22" },
      { "taskName": "Material order / lead time", "startDate": "2026-03-25", "endDate": "2026-04-30" },
      { "taskName": "Fabrication", "startDate": "2026-05-01", "endDate": "2026-06-15" },
      { "taskName": "Delivery & install", "startDate": "2026-06-20", "endDate": "2026-06-30" }
    ]
  }'::jsonb,
  'draft'
from (select id from auth.users order by created_at asc limit 1) u
where not exists (
  select 1 from public.proposals_tw p
  where p.title = 'Key Construction – Main St' and p.user_id = u.id
);
