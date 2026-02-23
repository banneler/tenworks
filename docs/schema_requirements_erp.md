# Schema requirements (ERP & proposals)

The app expects these columns. Run the migration in `supabase_erp_proposal_columns.sql` if you use Supabase.

## projects
| Column        | Type   | Nullable | Notes |
|---------------|--------|----------|--------|
| proposal_id   | uuid   | yes      | FK to `proposals_tw.id`. Set when launching a project from a deal (latest proposal for that deal). |

## project_tasks
| Column        | Type    | Nullable | Notes |
|---------------|---------|----------|--------|
| actual_hours  | numeric | yes      | Burned hours for job costing and progress. Enter in Schedule (Edit Task) or Projects (Timeline → Actual Hrs). |

## inventory_items
| Column        | Type    | Nullable | Notes |
|---------------|---------|----------|--------|
| reorder_point | numeric | yes      | Low-stock threshold; alert when `qty_on_hand <= reorder_point`. |
| uom           | text    | yes      | Unit of measure (e.g. ea, ft, lb). Default `ea`. |

## purchase_orders (reorder & receiving)
| Column             | Type    | Nullable | Notes |
|--------------------|---------|----------|--------|
| inventory_item_id  | bigint  | no       | FK to inventory_items(id). |
| qty_ordered        | numeric | no       | Quantity to order. |
| qty_received       | numeric | no       | Default 0; updated on Receive. |
| status             | text    | no       | pending \| ordered \| received \| cancelled. |
| expected_date      | date    | yes      | Optional expected delivery. |
| notes              | text    | yes      | Optional. |

Migrations are in `supabase/migrations/` and applied via `supabase db push --linked`. (If applying manually, use `inventory_item_id bigint` if your `inventory_items.id` is bigint.)

## shop_talent (optional, for capacity)
| Column          | Type    | Nullable | Notes |
|-----------------|---------|----------|--------|
| hours_per_week | numeric | yes      | Default 40. Used for capacity/load and utilization. |

## task_assignments (optional)
| Column | Type | Nullable | Notes |
|--------|------|----------|--------|
| hours  | numeric | yes   | If present, Command Center uses it for Staffing Gaps; otherwise 8 hrs/row. |
