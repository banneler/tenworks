-- Ten Works Fab demo pack. Project ccrnueyxmnzqlaphqdjn ONLY. Never Constellation.
--
-- Real jobs from tenworksfab.com and @tenworksfab (Jul–Oct 2026 captions):
-- Portwest lazy-river stair, Table Rock 4-story walnut/glass elevator stair,
-- Kansas Health Foundation, Hutton HQ, The Hub / Suikang Zhao, Clair Donnelly,
-- Pracht Wetlands, Crestpoint, Garden City Airport, Exploration Place,
-- Voxel Clouds, Ark Valley, Burning Tree, plus the smaller pipeline
-- (HomeGrown, Larchers, Belmont, Hudson, Four Oaks, Central Standard,
-- MilkFloat, Intrust, tables, railings, dividers, shelving).
--
-- Tagged [tw-demo-pack], SKU DEMO-*, shop_talent.role = tw-demo-pack.
-- Re-run is safe: tagged rows are removed first. Wichita Biomed, Centennial,
-- and every untagged row stay. Roles and quotas are not touched.
-- Deals are copied onto every real login because deals_tw SELECT is
-- auth.uid() = user_id (a manager does not see another owner's cards).
-- Projects, BOM, inventory, tasks, and assignments are shop-wide and are
-- created once, linked to banneler@gpcom.com when that user exists.
--
-- Dates are relative to CURRENT_DATE so a later re-run stays "this week".
-- Sold stays Sold. If the board's won column is still stored as Closed Won,
-- cards use that value and the app labels it Sold. A Sold stage is added
-- only when neither Sold nor Closed Won exists.
--
-- Apply: paste this file into the TenWorks SQL editor and run it,
--   or:  DATABASE_URL=postgresql://...ccrnueyxmnzqlaphqdjn... node scripts/apply_demo_pack.mjs
-- Wipe: supabase/seed/tw_demo_pack_wipe.sql
--        node scripts/apply_demo_pack.mjs --wipe

BEGIN;

UPDATE public.project_tasks AS t
SET dependency_task_id = NULL
WHERE t.dependency_task_id IN (
    SELECT t2.id
    FROM public.project_tasks AS t2
    JOIN public.projects AS p ON p.id = t2.project_id
    WHERE p.description LIKE '%[tw-demo-pack]%'
);

DELETE FROM public.task_assignments AS a
USING public.project_tasks AS t, public.projects AS p
WHERE a.task_id = t.id
  AND t.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.task_assignments AS a
USING public.shop_talent AS st
WHERE a.talent_id = st.id
  AND st.role = 'tw-demo-pack';

DELETE FROM public.talent_availability AS av
USING public.shop_talent AS st
WHERE av.talent_id = st.id
  AND st.role = 'tw-demo-pack';

UPDATE public.project_tasks
SET assigned_talent_id = NULL
WHERE assigned_talent_id IN (
    SELECT id FROM public.shop_talent WHERE role = 'tw-demo-pack'
);

DELETE FROM public.project_bom AS b
USING public.projects AS p
WHERE b.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_bom
WHERE inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE sku LIKE 'DEMO-%'
);

DELETE FROM public.project_change_orders AS c
USING public.projects AS p
WHERE c.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_notes AS n
USING public.projects AS p
WHERE n.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_contacts AS c
USING public.projects AS p
WHERE c.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_tasks AS t
USING public.projects AS p
WHERE t.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

UPDATE public.projects
SET proposal_id = NULL
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.proposals_tw AS pr
USING public.deals_tw AS d
WHERE pr.deal_id = d.id
  AND d.notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.projects
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.purchase_orders
WHERE notes LIKE '%[tw-demo-pack]%'
   OR inventory_item_id IN (
        SELECT id FROM public.inventory_items WHERE sku LIKE 'DEMO-%'
   );

DELETE FROM public.inventory_items
WHERE sku LIKE 'DEMO-%';

DELETE FROM public.deals_tw
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.contacts
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.accounts
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_template_tasks AS tt
USING public.project_templates AS t
WHERE tt.template_id = t.id
  AND t.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_templates
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.shop_machines
WHERE name LIKE '%(tw-demo-pack)%';

DELETE FROM public.talent_skills AS s
USING public.shop_talent AS st
WHERE s.talent_id = st.id
  AND st.role = 'tw-demo-pack';

DELETE FROM public.shop_talent
WHERE role = 'tw-demo-pack';DO $seed$
DECLARE
    anchor uuid;
    anchor_email text;
    u record;
    won_stage text;
    lost_stage text;
    open_stages text[];
    disc_stage text;
    prop_stage text;
    neg_stage text;
    com_stage text;
    deal record;
    pid int;
    stage_name text;
    acct_id bigint;
    contact_id bigint;
    deal_id bigint;
    humans int[];
    n_open int;
    job record;
    phase record;
    pstart date;
    pend date;
    tstart date;
    tend date;
    prev_task int;
    new_task int;
    tstatus text;
    actual numeric;
    day_row record;
    tid int;
    booked numeric;
    pick int;
    hrs numeric;
    trade int;
BEGIN
    SELECT au.id, au.email
      INTO anchor, anchor_email
    FROM auth.users AS au
    WHERE au.email NOT ILIKE 'zz-agent%'
      AND au.email NOT ILIKE '%tenworks-test.invalid'
      AND au.email NOT ILIKE 'tw-demo-pack%'
    ORDER BY
        CASE lower(au.email)
            WHEN 'banneler@gpcom.com' THEN 0
            WHEN 'bryan.anneler@gmail.com' THEN 1
            ELSE 9
        END,
        au.created_at
    LIMIT 1;

    IF anchor IS NULL THEN
        RAISE EXCEPTION 'tw-demo-pack: no real auth user to own deals';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.deal_stages) THEN
        INSERT INTO public.deal_stages (user_id, stage_name, sort_order) VALUES
            (anchor, 'Discovery', 10),
            (anchor, 'Proposal', 20),
            (anchor, 'Negotiation', 30),
            (anchor, 'Committed', 40),
            (anchor, 'Sold', 50),
            (anchor, 'Closed Lost', 60);
    END IF;

    SELECT ds.stage_name INTO won_stage
    FROM public.deal_stages AS ds
    WHERE lower(ds.stage_name) IN ('sold', 'closed won', 'won')
       OR lower(ds.stage_name) LIKE '%closed won%'
       OR lower(ds.stage_name) LIKE '%sold%'
    ORDER BY
        CASE lower(ds.stage_name)
            WHEN 'sold' THEN 0
            WHEN 'closed won' THEN 1
            WHEN 'won' THEN 2
            ELSE 3
        END,
        ds.sort_order
    LIMIT 1;

    IF won_stage IS NULL THEN
        INSERT INTO public.deal_stages (user_id, stage_name, sort_order)
        VALUES (
            anchor,
            'Sold',
            COALESCE((SELECT max(sort_order) + 10 FROM public.deal_stages), 50)
        )
        RETURNING stage_name INTO won_stage;
    END IF;

    SELECT ds.stage_name INTO lost_stage
    FROM public.deal_stages AS ds
    WHERE lower(ds.stage_name) LIKE '%lost%'
    ORDER BY ds.sort_order
    LIMIT 1;

    SELECT COALESCE(array_agg(s.stage_name ORDER BY s.sort_order), ARRAY[]::text[])
      INTO open_stages
    FROM (
        SELECT min(ds.sort_order) AS sort_order, ds.stage_name
        FROM public.deal_stages AS ds
        WHERE ds.stage_name IS DISTINCT FROM won_stage
          AND (lost_stage IS NULL OR ds.stage_name IS DISTINCT FROM lost_stage)
        GROUP BY ds.stage_name
    ) AS s;

    n_open := COALESCE(array_length(open_stages, 1), 0);
    IF n_open = 0 THEN
        open_stages := ARRAY[won_stage];
        n_open := 1;
    END IF;
    disc_stage := open_stages[1];
    prop_stage := open_stages[LEAST(2, n_open)];
    neg_stage := open_stages[LEAST(3, n_open)];
    SELECT ds.stage_name INTO com_stage
    FROM public.deal_stages AS ds
    WHERE lower(ds.stage_name) LIKE '%commit%'
      AND ds.stage_name IS DISTINCT FROM won_stage
      AND (lost_stage IS NULL OR ds.stage_name IS DISTINCT FROM lost_stage)
    ORDER BY ds.sort_order
    LIMIT 1;
    IF com_stage IS NULL THEN
        com_stage := open_stages[n_open];
    END IF;

    CREATE TEMP TABLE seed_deals (
        slug text PRIMARY KEY,
        account_name text,
        deal_name text,
        stage_key text,
        deal_value numeric,
        month_offset int,
        elements text,
        is_committed boolean,
        launch boolean,
        project_status text,
        kind text,
        industry text,
        city text,
        contact_first text,
        contact_last text,
        contact_title text,
        blurb text
    ) ON COMMIT DROP;

    INSERT INTO seed_deals VALUES
    ('portwest','Portwest Residence','Portwest Residence','won',1850000,0,'Steel, Glass, Aluminum, Wood, Structural',false,true,'Fabrication','stair','Residential','Wichita, KS','Kurt','Skinner','Landscape Architect','[tw-demo-pack] Three-year residence. Curved monumental stair over the lazy river, 42 unique glass lites at 1/2 in parallel reveals. Stainless and aluminum entry gate, fountain planters, porte cochere, perimeter stainless fence, bridge, three stainless fire bowls, oak and aluminum stair, stainless and glass interior rail, stainless risers, pool stools, equipment screens. Kurt Skinner landscape, Jeff Cody interiors. IG: stairs + 3 fire bowls + bridge.'),
    ('tablerock','Table Rock Lake House','Table Rock Lake House','won',640000,0,'Steel, Glass, Wood, Structural',false,true,'Fabrication','stair','Residential','Table Rock Lake','Hive','Design','Designer','[tw-demo-pack] Jul 2026: 4-story stair, live-edge walnut and glass railing, winds around the glass elevator, catwalk out to the mezzanine. Single stringer steel, chrome glass mounts. Hive Design. Guest rooms below, entertainment floor above.'),
    ('khf','Kansas Health Foundation','Kansas Health Foundation','won',420000,-1,'Steel, Glass, Wood, Paint',false,true,'Fabrication','stair','Healthcare','Wichita, KS','Shelden','Architecture','Architect','[tw-demo-pack] Award remodel on Douglas. Monumental stair: rectangular-tube stringers, brake-formed tread pans in gloss automotive paint, solid white oak treads with CNC nosing and Rubio Monocoat, glass rails with stainless shoe and cap. 15 ft Kansas county map, backlit signage, illuminated peg wall (frosted acrylic rods, polished ends, hidden 85 in TV), interactive pegboard, rotating diamond panels. Shelden, Gardner, McCownGordon, MKEC.'),
    ('hutton','Hutton Construction','Hutton Headquarters','won',380000,0,'Steel, Wood, Structural',true,true,'In Progress','stair','Commercial','Wichita, KS','Hutton','Construction','Design','[tw-demo-pack] Hutton Builds world HQ. Channel, rod, and plate stair. Light ribbon in the reveal between 1/2 in plate pans and the gypsum, lit from the east curtain wall. 10x8x5/8 tube stringer held to the 3D scan. Douglas fir treads and handrail. Haas-milled rod posts, 5/16 in tension rods. IG: bare steel vs steel-and-wood.'),
    ('hub','Wichita Transit','The Hub — Suikang Zhao','won',210000,0,'Steel, Structural',false,true,'Fabrication','art','Transit','Wichita, KS','Sui Kang','Zhao','Artist','[tw-demo-pack] Oct 2026. Fabricating Suikang Zhao''s cityscape for Wichita Transit Facility "The Hub". Six weathering-steel panels on the garage, words from a lot of nations. Dondlinger. Structural steel and A588 plate.'),
    ('clair','City of Maize','Clair Donnelly Amphitheater','won',165000,-1,'Steel, Structural',false,true,'In Progress','shade','Community','Maize, KS','Conco','Construction','Contractor','[tw-demo-pack] Sep 2026 install vibes at Claire Donnelly amphitheater and park, Maize. Stainless shade awnings that echo the concentric circles in the concrete, like rain on a pond. Conco.'),
    ('pracht','Pracht Wetlands','Pracht Wetlands Shade','won',148000,0,'Steel, Powdercoat',true,true,'Fabrication','shade','Community','Kansas','Pracht','Wetlands','Owner''s rep','[tw-demo-pack] Oct 2026. Pracht Wetlands shade structure. Bronze and green finish. Frame is in the shop now.'),
    ('crestpoint','Crestpoint','Crestpoint Office','won',275000,-1,'Steel, Wood',false,true,'Fabrication','stair','Commercial office','East Wichita, KS','Shelden','Architecture','Architect','[tw-demo-pack] East Wichita medical and professional offices. West stair: custom guardrails, gray-stained maple handrail. East stair: mono-stringer monumental stair, matching gray maple treads. Shelden Architecture, Conco. Design assist and fabrication by Ten Works.'),
    ('gardencity','Garden City Airport','Garden City Airport Screens','won',310000,1,'Aluminum, Structural',false,true,'Pre-Production','screen','Aviation','Garden City, KS','HNTB','Architecture','Architect','[tw-demo-pack] Anodized aluminum departure and arrival screens, 32 ft by 18 ft. Connections and a fly-in plan so the assembly bolts on site. HNTB, Crossland. One of the larger lifts the shop has set up.'),
    ('exploration','Exploration Place','Exploration Place Splash Pad','won',96000,0,'Steel, Aluminum, Powdercoat',false,true,'Pre-Production','shade','Museum','Wichita, KS','Exploration','Place','Exhibits','[tw-demo-pack] Aug 2026 post. Shade and metal at the Exploration Place splash pad. Powder-coated steel and aluminum, sized for kids and summer sun.'),
    ('arkvalley','Ark Valley Credit Union','Ark Valley Credit Union','won',240000,0,'Steel, Wood, Glass',true,true,'Onboarding','interior','Financial','Kansas','Hutton','Construction','Contractor','[tw-demo-pack] Just sold. Oversized hot-rolled fireplace in three shop-built sections, walnut and 3/8 in plate coffee bar, floor-to-ceiling steel-and-glass office partitions with 10 ft sliders, multi-species lobby benches, walnut and steel desks, steel vanities, black powder A36 equipment screen. Hutton.'),
    ('burntree','Burning Tree Residence','Burning Tree Residence','won',190000,1,'Steel, Aluminum, Wood, Glass',false,true,'Pre-Production','stair','Residential','Wichita, KS','Rehkamp','Larson','Design','[tw-demo-pack] Spiral stair, reeded-glass shower in custom aluminum, mailbox and address numbers, exterior rail, metal bar shelving, bathroom partition, architectural screens, walnut doors. The door swing angle became the black metal trim. Rehkamp Larson, Hutton.'),
    ('voxel','Clapp Memorial Park','Clapp Park — Voxel Clouds','won',125000,0,'Steel, Glass, Structural',false,true,'In Progress','sculpture','Public art','Wichita, KS','Osman','Akan','Artist','[tw-demo-pack] Osman Akan. About 19 ft tall and 22 ft long at the renovated children''s park. Concrete footings, sheathed beams, stainless post sleeves and overhead structure, glass frames and mounts. Shadows read as hopscotch, blocks, magnatiles, Minecraft. Conco on site. Keep this next to Wichita Biomed and Centennial — do not replace them.'),
    ('concretedesk','Regional Concrete','Concrete Co. Reception Desk','won',68000,0,'Steel, Wood',true,true,'Fabrication','desk','Commercial','Wichita, KS','Shop','Design','In-house design','[tw-demo-pack] In-house design. Reception desk: raw steel carcass, formed concrete, timber top. On the floor now.'),
    ('fouroaks','Four Oaks Residence','Four Oaks Residence','negotiation',72000,1,'Steel, Wood, Glass',true,false,NULL,NULL,'Residential','Wichita, KS','Four','Oaks','Owner','[tw-demo-pack] Multi-material stair railings, steel pocket doors, steel fireplace surround, mailbox numbers, exterior bench. White oak, steel, brass, glass. Brass spindle hardware drawn in-house.'),
    ('larchers','Larchers','Larchers Market','negotiation',95000,1,'Steel, Wood, Aluminum',true,false,NULL,NULL,'Hospitality','Wichita, KS','Michael','Cathcart','Design','[tw-demo-pack] Next door to The Belmont. Built-in shelves, solid walnut, custom milled brass hardware, bar gantry, overhead beams, bar surround, foot rail. Wood, steel, brass, aluminum. Michael Cathcart.'),
    ('hudson','The Hudson St. Francis','The Hudson St. Francis','negotiation',220000,1,'Steel, Wood',false,false,NULL,NULL,'Hospitality','Wichita, KS','3ten','Architecture','Design','[tw-demo-pack] A block off Intrust Bank Arena. Structural steel, white oak and steel round-bar shelves with brass, white oak and stainless toilet partitions, ipe deck and tiles, powder-coated railings. 3ten Architecture.'),
    ('stairpack','Open Stair Bid','Stair & Railing Package','negotiation',54000,1,'Steel, Aluminum, Glass',true,false,NULL,NULL,'Mixed','Wichita, KS','Estimating','Bid','Open package','[tw-demo-pack] Smaller pipeline card for the staircases and railings line — guardrails, cable, and a mono-stringer study. Not a named monument yet.'),
    ('homegrown','HomeGrown','HomeGrown','committed',180000,0,'Steel, Wood, Powdercoat',true,false,NULL,NULL,'Hospitality','Midwest','Thrive','Restaurant','Design','[tw-demo-pack] 15 Midwest locations. Planters, shelving, ceiling clouds, bar top, signage, dining tables. Multi-species tops (the first one Nick built for the apartment), powder-coated steel and cedar planters, hexagonal cedar and steel clouds, walnut or hickory retail shelves with brass, bar tops past 30 ft. Thrive x Ten Works.'),
    ('belmont','The Belmont','The Belmont','committed',140000,0,'Steel, Glass',true,false,NULL,NULL,'Hospitality','Wichita, KS','Michael','Cathcart','Design','[tw-demo-pack] Happiness Plaza, the old 1960s retail block. Carbon steel stair with a custom radius, forced-oxidation oil finish, brass-coated aluminum, solid brass and glass bar shelves, curved steel table bases, room dividers, restroom partitions, exterior cable rail. Michael Cathcart.'),
    ('conference','Private Client','Live-Edge Walnut Conference Table','committed',28000,0,'Steel, Wood',true,false,NULL,NULL,'Commercial','Wichita, KS','Shop','Design','In-house','[tw-demo-pack] Live-edge walnut top, mild steel base, integrated power ports. Conference table on the board from the shop post.'),
    ('csb','Central Standard Brewing','Central Standard Brewing','proposal',40000,2,'Steel, Wood',false,false,NULL,NULL,'Hospitality','Wichita, KS','CSB','Brewing','Owner','[tw-demo-pack] Early Ten Works job, still a favorite room. White oak and passivated stainless hopper, bar shelving, outdoor bike racks. Refresh proposal for another hopper and shelving run.'),
    ('milkfloat','MilkFloat','MilkFloat','proposal',35000,2,'Steel, Wood',false,false,NULL,NULL,'Hospitality','Wichita, KS','MilkFloat','Shop','Owner','[tw-demo-pack] The job that took the shop full time — two all-nighters. Vanilla-bean steel and walnut bar, live-edge Kansas black walnut community tables. Proposal for another run of dining tables.'),
    ('dividers','Studio Bid','Room Dividers','proposal',18000,2,'Steel, Wood, Glass',false,false,NULL,NULL,'Commercial','Wichita, KS','Studio','Bid','Open','[tw-demo-pack] Smaller pipeline card. Steel, wood, and glass room dividers in the Ten Works line.'),
    ('shelving','Studio Bid','Custom Shelving','proposal',22000,2,'Steel, Wood',false,false,NULL,NULL,'Commercial','Wichita, KS','Studio','Bid','Open','[tw-demo-pack] Smaller pipeline card. Walnut, brass, and steel shelving — the Larchers / Hudson kind of work, not yet a named room.'),
    ('intrust','Intrust Bank','Intrust Bank','discovery',85000,3,'Steel, Glass',false,false,NULL,NULL,'Banking','Wichita, KS','Intrust','Bank','Facilities','[tw-demo-pack] Discovery follow-on. The revolving door came out; egress-compliant brushed-brass swinging doors with bullet-resistant glass went in, cast iron and stone left alone. Talking about the next opening.'),
    ('tables','Custom Tables','Custom Tables','discovery',24000,3,'Steel, Wood',false,false,NULL,NULL,'Residential','Wichita, KS','Shop','Design','In-house','[tw-demo-pack] Smaller pipeline card for the custom tables line. Dining and communal tops, not the conference table already committed.'),
    ('cable','East Wichita Residence','East Wichita Cable Rail','discovery',36000,3,'Steel, Aluminum',false,false,NULL,NULL,'Residential','East Wichita, KS','East','Wichita','Owner','[tw-demo-pack] Discovery. Exterior cable rail and a short interior run. Staircases and railings pipeline, not a monument.'),
    ('altshade','Maize Parks','Amphitheater Shade — Alternate','lost',90000,-1,'Steel, Aluminum',false,false,NULL,NULL,'Community','Maize, KS','Maize','Parks','Alternate spec','[tw-demo-pack] Alternate shade spec that did not win. The Clair Donnelly stainless scheme is the one in the shop.');

    INSERT INTO public.inventory_items (sku, name, category, qty_on_hand, uom, cost_per_unit, reorder_point, location) VALUES
    ('DEMO-A36-PL12','1/2 in A36 plate','Sheet',40,'sheet',285,8,'Plate rack A1'),
    ('DEMO-A36-PL14','1/4 in A36 plate','Sheet',48,'sheet',148,10,'Plate rack A2'),
    ('DEMO-316-PL14','1/4 in 316 stainless plate','Sheet',28,'sheet',410,6,'Stainless bay'),
    ('DEMO-HSS-10858','HSS 10x8x5/8 tube','Tube',24,'ft',38,40,'Tube rack — heavy'),
    ('DEMO-HSS-444','HSS 4x4x1/4','Tube',1400,'ft',9.5,200,'Tube rack'),
    ('DEMO-ROD-516','5/16 in stainless rod','Tube',480,'ft',3.2,100,'Haas crib'),
    ('DEMO-GLS-12','1/2 in laminated glass lite','Sheet',16,'ea',640,10,'Glass crib'),
    ('DEMO-OAK-TREAD','8/4 white oak tread blank','Sheet',48,'ea',185,12,'Wood loft'),
    ('DEMO-DFIR-HR','Douglas fir handrail blank','Sheet',36,'ea',72,8,'Wood loft'),
    ('DEMO-WAL-SLAB','Live-edge black walnut slab','Sheet',3,'ea',890,2,'Wood loft — slabs'),
    ('DEMO-MAPLE-T','8/4 maple tread blank','Sheet',32,'ea',160,8,'Wood loft'),
    ('DEMO-ACR-ROD','Frosted acrylic rod, polished ends','Hardware',80,'ea',18,40,'Light-wall bin'),
    ('DEMO-AL-ANOD','Anodized aluminum panel','Sheet',9,'sheet',220,6,'Aluminum rack'),
    ('DEMO-A588','A588 weathering steel sheet','Sheet',5,'sheet',310,6,'Yard rack'),
    ('DEMO-BRS-BAR','Brass bar and trim','Tube',90,'ft',14,20,'Brass drawer'),
    ('DEMO-PC-BRNZ','Bronze powder coat','Finish',28,'lb',12,10,'Finish cage'),
    ('DEMO-PC-GRN','Wetland green powder','Finish',8,'lb',12,15,'Finish cage'),
    ('DEMO-PC-BLK','Black powder coat','Finish',55,'lb',9,15,'Finish cage'),
    ('DEMO-SS-SHOE','Stainless glass base shoe','Hardware',280,'ft',22,60,'Railing bin'),
    ('DEMO-GLS-CLIP','Glass spider and clamp','Hardware',240,'ea',18,40,'Hardware wall'),
    ('DEMO-IPE','Ipe decking','Sheet',360,'ft',8,80,'Wood loft — deck'),
    ('DEMO-CEDAR','Cedar 1x6','Sheet',280,'ft',2.4,60,'Wood loft'),
    ('DEMO-CONC','GFRC formed concrete panel','Sheet',3,'ea',480,4,'Yard — concrete'),
    ('DEMO-SS-GATE','Stainless gate hardware kit','Hardware',6,'ea',260,2,'Hardware wall');

    INSERT INTO public.purchase_orders (inventory_item_id, qty_ordered, qty_received, status, expected_date, notes)
    SELECT i.id, v.qty, 0, 'ordered', current_date + v.days, v.note
    FROM (VALUES
        ('DEMO-HSS-10858', 80::numeric, 7, '[tw-demo-pack] Ryerson — 10x8x5/8 tube for the Hutton stringer'),
        ('DEMO-GLS-12', 30::numeric, 10, '[tw-demo-pack] Glass crib — Portwest lites, 42 unique, 16 on the rack'),
        ('DEMO-ACR-ROD', 200::numeric, 5, '[tw-demo-pack] Acrylic rods for the Kansas Health lobby wall'),
        ('DEMO-A588', 8::numeric, 12, '[tw-demo-pack] A588 sheets for The Hub / Suikang Zhao panels'),
        ('DEMO-AL-ANOD', 10::numeric, 9, '[tw-demo-pack] Anodized skins for Garden City Airport screens'),
        ('DEMO-PC-GRN', 25::numeric, 4, '[tw-demo-pack] Wetland green powder — Pracht'),
        ('DEMO-CONC', 4::numeric, 14, '[tw-demo-pack] GFRC panels for the concrete-company desk')
    ) AS v(sku, qty, days, note)
    JOIN public.inventory_items AS i ON i.sku = v.sku;

    IF NOT EXISTS (SELECT 1 FROM public.shop_machines) THEN
        INSERT INTO public.shop_machines (name, status, hourly_rate) VALUES
            ('Haas VF-2 (tw-demo-pack)', 'Running', 85),
            ('Press brake (tw-demo-pack)', 'Running', 70),
            ('Ironworker (tw-demo-pack)', 'Running', 45);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.project_templates) THEN
        WITH tpl AS (
            INSERT INTO public.project_templates (name, description)
            VALUES ('Monumental stair', '[tw-demo-pack] Shop template: scan, stringer, Haas, treads, glaze, install.')
            RETURNING id
        ),
        tr AS (
            SELECT id FROM public.shop_trades ORDER BY id LIMIT 1
        )
        INSERT INTO public.project_template_tasks (template_id, trade_id, name, estimated_hours, sort_order)
        SELECT tpl.id, tr.id, v.name, v.hours, v.ord
        FROM tpl
        LEFT JOIN tr ON true
        CROSS JOIN (VALUES
            (1, 'Field measure & 3D scan', 24::numeric),
            (2, 'Stringer fit-up', 80::numeric),
            (3, 'Haas mill connectors', 40::numeric),
            (4, 'Tread millwork', 48::numeric),
            (5, 'Glaze', 36::numeric),
            (6, 'Install', 40::numeric)
        ) AS v(ord, name, hours);
    END IF;

    SELECT COALESCE(array_agg(st.id ORDER BY st.id), ARRAY[]::int[])
      INTO humans
    FROM public.shop_talent AS st
    WHERE COALESCE(st.active, true)
      AND lower(COALESCE(st.resource_type, '')) <> 'internal'
      AND st.name NOT ILIKE '%internal%';

    IF COALESCE(array_length(humans, 1), 0) = 0 THEN
        WITH ins AS (
            INSERT INTO public.shop_talent (name, role, hours_per_week, active, default_hourly_rate, resource_type)
            VALUES
                ('Fit-up', 'tw-demo-pack', 40, true, 42, NULL),
                ('Structural weld', 'tw-demo-pack', 40, true, 48, NULL),
                ('Millwork', 'tw-demo-pack', 40, true, 44, NULL),
                ('Finish', 'tw-demo-pack', 40, true, 40, NULL),
                ('Install', 'tw-demo-pack', 40, true, 46, NULL),
                ('Haas', 'tw-demo-pack', 40, true, 52, NULL),
                ('Glaze', 'tw-demo-pack', 40, true, 44, NULL),
                ('Layout', 'tw-demo-pack', 40, true, 50, NULL)
            RETURNING id
        )
        SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::int[]) INTO humans FROM ins;

        INSERT INTO public.talent_skills (talent_id, trade_id)
        SELECT st.id, tr.id
        FROM public.shop_talent AS st
        JOIN LATERAL (
            SELECT id
            FROM public.shop_trades
            ORDER BY id
            OFFSET (mod(st.id, GREATEST((SELECT count(*) FROM public.shop_trades), 1)))
            LIMIT 1
        ) AS tr ON true
        WHERE st.role = 'tw-demo-pack'
          AND EXISTS (SELECT 1 FROM public.shop_trades);
    END IF;

    CREATE TEMP TABLE anchor_job (
        slug text PRIMARY KEY,
        deal_id bigint,
        contact_id bigint,
        project_id int,
        job_name text,
        job_value numeric,
        job_status text,
        kind text,
        blurb text
    ) ON COMMIT DROP;

    FOR u IN
        SELECT au.id, au.email
        FROM auth.users AS au
        WHERE au.email NOT ILIKE 'zz-agent%'
          AND au.email NOT ILIKE '%tenworks-test.invalid'
          AND au.email NOT ILIKE 'tw-demo-pack%'
        ORDER BY au.created_at
    LOOP
        FOR deal IN SELECT * FROM seed_deals LOOP
            stage_name := CASE deal.stage_key
                WHEN 'won' THEN won_stage
                WHEN 'lost' THEN lost_stage
                WHEN 'negotiation' THEN neg_stage
                WHEN 'committed' THEN com_stage
                WHEN 'proposal' THEN prop_stage
                ELSE disc_stage
            END;
            IF stage_name IS NULL THEN
                CONTINUE;
            END IF;

            INSERT INTO public.accounts (name, industry, address, notes, user_id, is_customer, status)
            VALUES (
                deal.account_name,
                deal.industry,
                deal.city,
                deal.blurb,
                u.id,
                deal.stage_key = 'won',
                CASE WHEN deal.stage_key = 'won' THEN 'Customer' ELSE 'Prospect' END
            )
            RETURNING id INTO acct_id;

            INSERT INTO public.contacts (first_name, last_name, title, account_id, user_id, notes)
            VALUES (
                deal.contact_first,
                deal.contact_last,
                deal.contact_title,
                acct_id,
                u.id,
                deal.blurb
            )
            RETURNING id INTO contact_id;

            INSERT INTO public.deals_tw (
                user_id, account_id, name, stage, value, close_month, elements, is_committed, notes
            ) VALUES (
                u.id,
                acct_id,
                deal.deal_name,
                stage_name,
                deal.deal_value,
                to_char(date_trunc('month', current_date) + make_interval(months => deal.month_offset), 'YYYY-MM'),
                deal.elements,
                deal.is_committed,
                deal.blurb
            )
            RETURNING id INTO deal_id;

            IF u.id = anchor AND deal.launch THEN
                INSERT INTO anchor_job (slug, deal_id, contact_id, job_name, job_value, job_status, kind, blurb)
                VALUES (deal.slug, deal_id, contact_id, deal.deal_name, deal.deal_value, deal.project_status, deal.kind, deal.blurb);
            END IF;
        END LOOP;
    END LOOP;

    FOR job IN SELECT * FROM anchor_job LOOP
        IF job.job_status IN ('Fabrication', 'In Progress') THEN
            pstart := current_date - 21;
            pend := current_date + 45;
        ELSIF job.job_status = 'Onboarding' THEN
            pstart := current_date + 10;
            pend := current_date + 75;
        ELSE
            pstart := current_date + 4;
            pend := current_date + 60;
        END IF;

        INSERT INTO public.projects (
            deal_id, name, status, start_date, end_date, project_value,
            material_budget, actual_material_spend, description,
            client_summary, client_summary_updated_at, status_token
        ) VALUES (
            job.deal_id,
            job.job_name,
            job.job_status,
            pstart,
            pend,
            job.job_value,
            round(job.job_value * 0.32, 2),
            CASE WHEN job.job_status IN ('Fabrication', 'In Progress') THEN round(job.job_value * 0.11, 2) ELSE 0 END,
            job.blurb,
            CASE job.slug
                WHEN 'portwest' THEN 'Curved stair over the lazy river is in fit-up. Glass lites are short — 16 on the rack, 42 unique on the drawing.'
                WHEN 'tablerock' THEN 'Walnut and glass 4-story stair is in the shop. The run wraps the glass elevator; catwalk to the mezzanine is next.'
                WHEN 'khf' THEN 'White oak treads are blanked. Acrylic-rod lobby wall is waiting on the rod PO. Pegboard is detailed.'
                WHEN 'hutton' THEN 'Bare tube is on the floor. Douglas fir is in the loft. Still the steel-versus-wood conversation from the HQ stair.'
                WHEN 'hub' THEN 'Suikang Zhao weathering panels are being cut. A588 is short until the yard delivery.'
                WHEN 'clair' THEN 'Maize shade frames are fitting. Install window is open from the September set.'
                WHEN 'pracht' THEN 'Wetlands shade is in fab. Bronze is on the shelf; green powder is on order.'
                WHEN 'crestpoint' THEN 'Gray maple treads for the east mono-stringer are in the loft. West guardrail is fitting.'
                WHEN 'gardencity' THEN 'Airport screen connections are in pre-pro. Anodized skins are on order so the fly-in stays on the crane date.'
                WHEN 'exploration' THEN 'Splash-pad shade is scheduled. Shop drawings before metal hits the brake.'
                WHEN 'arkvalley' THEN 'Kickoff with Hutton. Fireplace breaks into three sections so it goes in the truck.'
                WHEN 'burntree' THEN 'Spiral and the reeded-glass shower are in pre-pro. Walnut doors are not cut yet.'
                WHEN 'voxel' THEN 'Voxel Clouds structure is fitting. Glass frames follow the stainless sleeves.'
                ELSE 'Reception desk: raw steel, formed concrete, timber. Concrete panels are short.'
            END,
            now(),
            gen_random_uuid()
        )
        RETURNING id INTO pid;

        UPDATE anchor_job SET project_id = pid WHERE slug = job.slug;

        INSERT INTO public.project_contacts (project_id, contact_id, role)
        VALUES (pid, job.contact_id, 'Client');

        INSERT INTO public.project_notes (project_id, author_name, content, is_auto_log)
        VALUES (pid, 'Shop', job.blurb, false);

        prev_task := NULL;
        FOR phase IN
            SELECT *
            FROM (VALUES
                ('stair',1,'Field measure & 3D scan','layout',24::numeric,0,5),
                ('stair',2,'Stringer, plate & tube fit-up','weld',80::numeric,5,10),
                ('stair',3,'Haas mill — rod posts & connectors','machine',40::numeric,13,8),
                ('stair',4,'Tread millwork','wood',56::numeric,18,10),
                ('stair',5,'Glass shoe & glaze','glaze',36::numeric,28,8),
                ('stair',6,'Install','install',48::numeric,36,8),
                ('shade',1,'Layout & footing templates','layout',16::numeric,0,4),
                ('shade',2,'Frame fit-up','weld',64::numeric,4,10),
                ('shade',3,'Skin / panel','weld',40::numeric,12,8),
                ('shade',4,'Finish','finish',24::numeric,20,6),
                ('shade',5,'Hardware','layout',16::numeric,26,4),
                ('shade',6,'Set and bolt','install',32::numeric,30,6),
                ('screen',1,'Connection details off the model','layout',24::numeric,0,6),
                ('screen',2,'Frame weld','weld',48::numeric,6,8),
                ('screen',3,'Anodized panel finish','finish',32::numeric,14,8),
                ('screen',4,'Fly-in plan','layout',16::numeric,22,4),
                ('screen',5,'Hardware kit','layout',12::numeric,26,4),
                ('screen',6,'On-site bolt-up','install',40::numeric,32,6),
                ('interior',1,'Site measure','layout',16::numeric,0,4),
                ('interior',2,'Steel fab','weld',48::numeric,4,10),
                ('interior',3,'Millwork','wood',40::numeric,12,8),
                ('interior',4,'Brass & hardware','machine',24::numeric,20,6),
                ('interior',5,'Finish','finish',20::numeric,26,5),
                ('interior',6,'Install','install',32::numeric,31,6),
                ('sculpture',1,'Footings, frames, glass mounts','layout',32::numeric,0,6),
                ('sculpture',2,'Shop-fit the structure','weld',56::numeric,6,10),
                ('sculpture',3,'Glass frames','glaze',28::numeric,14,6),
                ('sculpture',4,'Finish','finish',16::numeric,20,4),
                ('sculpture',5,'Mock-up','layout',12::numeric,24,4),
                ('sculpture',6,'Park install','install',36::numeric,28,6),
                ('desk',1,'In-house design','layout',12::numeric,0,4),
                ('desk',2,'Raw steel carcass','weld',24::numeric,4,6),
                ('desk',3,'Formed concrete','finish',20::numeric,10,6),
                ('desk',4,'Timber top','wood',16::numeric,16,5),
                ('desk',5,'Fit hardware','machine',8::numeric,21,3),
                ('desk',6,'Deliver','install',8::numeric,24,2),
                ('art',1,'Panel patterns from Zhao','layout',20::numeric,0,5),
                ('art',2,'Weathering plate cut','weld',36::numeric,5,8),
                ('art',3,'Frame and stiffen','weld',40::numeric,12,8),
                ('art',4,'Weather the set','finish',16::numeric,20,6),
                ('art',5,'Mock-up the six panels','layout',12::numeric,26,4),
                ('art',6,'Garage install','install',28::numeric,30,6)
            ) AS v(kind, seq, name, hint, hours, start_off, dur)
            WHERE v.kind = job.kind
            ORDER BY v.seq
        LOOP
            tstart := pstart + phase.start_off;
            tend := tstart + phase.dur;
            IF tend < current_date THEN
                tstatus := 'Completed';
                actual := round(phase.hours * 0.92, 1);
            ELSIF tstart <= current_date THEN
                tstatus := 'In Progress';
                actual := round(phase.hours * 0.35, 1);
            ELSE
                tstatus := 'Pending';
                actual := NULL;
            END IF;

            SELECT COALESCE(
                (SELECT id FROM public.shop_trades
                  WHERE name ILIKE CASE phase.hint
                      WHEN 'weld' THEN '%weld%'
                      WHEN 'wood' THEN '%wood%'
                      WHEN 'mill' THEN '%mill%'
                      WHEN 'finish' THEN '%finish%'
                      WHEN 'install' THEN '%install%'
                      WHEN 'machine' THEN '%mach%'
                      WHEN 'layout' THEN '%layout%'
                      WHEN 'glaze' THEN '%glaz%'
                      ELSE '%'
                  END
                  ORDER BY id
                  LIMIT 1),
                (SELECT id FROM public.shop_trades ORDER BY id LIMIT 1)
            ) INTO trade;

            INSERT INTO public.project_tasks (
                project_id, trade_id, name, start_date, end_date,
                estimated_hours, actual_hours, status, dependency_task_id,
                weekend_overtime
            ) VALUES (
                pid, trade, phase.name, tstart, tend,
                phase.hours, actual, tstatus, prev_task, false
            )
            RETURNING id INTO new_task;
            prev_task := new_task;
        END LOOP;
    END LOOP;

    INSERT INTO public.project_change_orders (project_id, description, amount, status, approved_at)
    SELECT j.project_id, v.description, v.amount, v.status,
           CASE WHEN v.status = 'approved' THEN now() ELSE NULL END
    FROM (VALUES
        ('portwest', 'Third stainless fire bowl — owner added it after the bridge mock-up', 18500::numeric, 'approved'),
        ('pracht', 'Bronze vs wetland-green sample pair', 4200::numeric, 'pending'),
        ('khf', 'Extra acrylic-rod density on the lobby wall', 9600::numeric, 'approved')
    ) AS v(slug, description, amount, status)
    JOIN anchor_job AS j ON j.slug = v.slug;

    INSERT INTO public.project_bom (project_id, inventory_item_id, qty_required, qty_allocated, status)
    SELECT j.project_id, i.id, b.qty, b.qty, b.status
    FROM (VALUES
        ('portwest','DEMO-GLS-12',42::numeric,'Pending'),
        ('portwest','DEMO-A36-PL12',8::numeric,'Pending'),
        ('portwest','DEMO-316-PL14',6::numeric,'Pending'),
        ('portwest','DEMO-SS-SHOE',90::numeric,'Pending'),
        ('portwest','DEMO-GLS-CLIP',84::numeric,'Pending'),
        ('portwest','DEMO-SS-GATE',2::numeric,'Pending'),
        ('portwest','DEMO-OAK-TREAD',18::numeric,'Pending'),
        ('tablerock','DEMO-WAL-SLAB',8::numeric,'Pending'),
        ('tablerock','DEMO-GLS-12',16::numeric,'Pending'),
        ('tablerock','DEMO-A36-PL14',6::numeric,'Pending'),
        ('tablerock','DEMO-SS-SHOE',40::numeric,'Pending'),
        ('khf','DEMO-ACR-ROD',220::numeric,'Ordered'),
        ('khf','DEMO-OAK-TREAD',22::numeric,'Pending'),
        ('khf','DEMO-HSS-444',160::numeric,'Pending'),
        ('khf','DEMO-A36-PL14',4::numeric,'Pending'),
        ('khf','DEMO-SS-SHOE',36::numeric,'Pending'),
        ('khf','DEMO-GLS-12',14::numeric,'Pending'),
        ('hutton','DEMO-HSS-10858',96::numeric,'Ordered'),
        ('hutton','DEMO-A36-PL12',10::numeric,'Pending'),
        ('hutton','DEMO-DFIR-HR',24::numeric,'Pending'),
        ('hutton','DEMO-ROD-516',320::numeric,'Pulled'),
        ('hutton','DEMO-PC-BLK',12::numeric,'Pending'),
        ('hub','DEMO-A588',12::numeric,'Ordered'),
        ('hub','DEMO-HSS-444',80::numeric,'Pending'),
        ('clair','DEMO-316-PL14',8::numeric,'Pending'),
        ('clair','DEMO-HSS-444',140::numeric,'Pending'),
        ('clair','DEMO-PC-BLK',6::numeric,'Pending'),
        ('pracht','DEMO-HSS-444',200::numeric,'Pending'),
        ('pracht','DEMO-PC-BRNZ',18::numeric,'Pending'),
        ('pracht','DEMO-PC-GRN',20::numeric,'Ordered'),
        ('crestpoint','DEMO-MAPLE-T',26::numeric,'Pending'),
        ('crestpoint','DEMO-A36-PL14',8::numeric,'Pending'),
        ('crestpoint','DEMO-HSS-444',60::numeric,'Pending'),
        ('crestpoint','DEMO-PC-BLK',8::numeric,'Pending'),
        ('gardencity','DEMO-AL-ANOD',18::numeric,'Ordered'),
        ('gardencity','DEMO-HSS-444',40::numeric,'Pending'),
        ('exploration','DEMO-A36-PL14',4::numeric,'Pending'),
        ('exploration','DEMO-AL-ANOD',3::numeric,'Pending'),
        ('exploration','DEMO-PC-BLK',6::numeric,'Pending'),
        ('exploration','DEMO-HSS-444',30::numeric,'Pending'),
        ('arkvalley','DEMO-WAL-SLAB',2::numeric,'Pending'),
        ('arkvalley','DEMO-A36-PL12',6::numeric,'Pending'),
        ('arkvalley','DEMO-BRS-BAR',40::numeric,'Pending'),
        ('arkvalley','DEMO-GLS-12',8::numeric,'Pending'),
        ('burntree','DEMO-A36-PL14',5::numeric,'Pending'),
        ('burntree','DEMO-AL-ANOD',4::numeric,'Pending'),
        ('burntree','DEMO-WAL-SLAB',1::numeric,'Pending'),
        ('burntree','DEMO-GLS-12',6::numeric,'Pending'),
        ('voxel','DEMO-HSS-444',90::numeric,'Pending'),
        ('voxel','DEMO-316-PL14',4::numeric,'Pending'),
        ('voxel','DEMO-GLS-12',10::numeric,'Pending'),
        ('concretedesk','DEMO-A36-PL12',3::numeric,'Pending'),
        ('concretedesk','DEMO-CONC',6::numeric,'Ordered'),
        ('concretedesk','DEMO-DFIR-HR',4::numeric,'Pending')
    ) AS b(slug, sku, qty, status)
    JOIN anchor_job AS j ON j.slug = b.slug
    JOIN public.inventory_items AS i ON i.sku = b.sku;

    IF COALESCE(array_length(humans, 1), 0) > 0 THEN
        FOR day_row IN
            SELECT gs::date AS day
            FROM generate_series(
                (current_date - EXTRACT(DOW FROM current_date)::int) + 1,
                current_date + 21,
                interval '1 day'
            ) AS gs
        LOOP
            IF EXTRACT(DOW FROM day_row.day) IN (0, 6) THEN
                CONTINUE;
            END IF;
            FOREACH tid IN ARRAY humans LOOP
                SELECT COALESCE(sum(COALESCE(a.hours, 8)), 0)
                  INTO booked
                FROM public.task_assignments AS a
                WHERE a.talent_id = tid
                  AND a.assigned_date = day_row.day;

                IF day_row.day = current_date THEN
                    IF EXISTS (
                        SELECT 1
                        FROM public.task_assignments AS a
                        JOIN public.project_tasks AS t ON t.id = a.task_id
                        JOIN public.projects AS p ON p.id = t.project_id
                        WHERE a.talent_id = tid
                          AND a.assigned_date = day_row.day
                          AND p.description LIKE '%[tw-demo-pack]%'
                    ) THEN
                        CONTINUE;
                    END IF;
                    hrs := 6;
                ELSE
                    IF booked >= 6 THEN
                        CONTINUE;
                    END IF;
                    hrs := LEAST(8 - booked, 6);
                    IF hrs < 4 THEN
                        CONTINUE;
                    END IF;
                END IF;

                SELECT t.id INTO pick
                FROM public.project_tasks AS t
                JOIN public.projects AS p ON p.id = t.project_id
                WHERE p.description LIKE '%[tw-demo-pack]%'
                  AND t.start_date <= day_row.day
                  AND t.end_date >= day_row.day
                  AND NOT EXISTS (
                      SELECT 1 FROM public.task_assignments AS a
                      WHERE a.task_id = t.id
                        AND a.talent_id = tid
                        AND a.assigned_date = day_row.day
                  )
                ORDER BY mod(t.id * 17 + tid + (day_row.day - DATE '2020-01-01'), 97), t.id
                LIMIT 1;

                IF pick IS NULL THEN
                    CONTINUE;
                END IF;

                INSERT INTO public.task_assignments (task_id, talent_id, assigned_date, hours)
                VALUES (pick, tid, day_row.day, hrs);

                UPDATE public.project_tasks
                SET assigned_talent_id = tid
                WHERE id = pick
                  AND assigned_talent_id IS NULL;
            END LOOP;
        END LOOP;
    END IF;

    RAISE NOTICE 'tw-demo-pack anchored to % (%)', anchor_email, anchor;
    RAISE NOTICE 'stages won=% lost=% discovery=% proposal=% negotiation=% committed=%',
        won_stage, lost_stage, disc_stage, prop_stage, neg_stage, com_stage;
END
$seed$;

-- Counts for the PR / SQL editor result grid.
SELECT 'deals_by_owner' AS report, u.email, d.stage, count(*) AS n
FROM public.deals_tw d
JOIN auth.users u ON u.id = d.user_id
WHERE d.notes LIKE '%[tw-demo-pack]%'
GROUP BY u.email, d.stage
ORDER BY u.email, d.stage;

SELECT 'projects' AS report, status, count(*) AS n
FROM public.projects
WHERE description LIKE '%[tw-demo-pack]%'
GROUP BY status
ORDER BY status;

SELECT 'bom_lines' AS report, count(*) AS n
FROM public.project_bom b
JOIN public.projects p ON p.id = b.project_id
WHERE p.description LIKE '%[tw-demo-pack]%';

SELECT 'tasks' AS report, count(*) AS n
FROM public.project_tasks t
JOIN public.projects p ON p.id = t.project_id
WHERE p.description LIKE '%[tw-demo-pack]%';

SELECT 'assignments_this_sun_week' AS report, count(*) AS n,
       COALESCE(sum(a.hours), 0) AS hours
FROM public.task_assignments a
JOIN public.project_tasks t ON t.id = a.task_id
JOIN public.projects p ON p.id = t.project_id
WHERE p.description LIKE '%[tw-demo-pack]%'
  AND a.assigned_date >= (current_date - EXTRACT(DOW FROM current_date)::int)
  AND a.assigned_date <  (current_date - EXTRACT(DOW FROM current_date)::int) + 7;

SELECT 'inventory_demo' AS report, count(*) AS skus
FROM public.inventory_items WHERE sku LIKE 'DEMO-%';

SELECT 'short_demo_skus' AS report, i.sku, i.qty_on_hand,
       COALESCE(sum(b.qty_allocated), 0) AS allocated
FROM public.inventory_items i
LEFT JOIN public.project_bom b
  ON b.inventory_item_id = i.id AND COALESCE(b.status, '') <> 'Pulled'
WHERE i.sku LIKE 'DEMO-%'
GROUP BY i.sku, i.qty_on_hand
HAVING i.qty_on_hand < COALESCE(sum(b.qty_allocated), 0)
ORDER BY i.sku;

COMMIT;
