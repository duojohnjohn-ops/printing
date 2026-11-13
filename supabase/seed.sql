-- =====================================================================
-- PSMS starter data (run THIRD). All prices are SAMPLE values in PHP.
-- Change everything from the Admin portal > Pricing. Safe to re-run.
-- Convention for non-page items (ID photos, lamination, tarpaulin sq ft):
-- enter Pages = 1 and put the quantity in Copies.
-- =====================================================================
insert into public.services (name, category, description, turnaround_days, rush_fee_percent) values
 ('A4 Document Printing','Printing','Documents on A4 paper',1,50),
 ('Short Bond Paper Printing','Printing','Documents on short (8.5x11) bond',1,50),
 ('Long Bond Paper Printing','Printing','Documents on long (8.5x13) bond',1,50),
 ('Black and White Printing','Printing','Black and white prints',1,50),
 ('Colored Printing','Printing','Full-color prints',1,50),
 ('Photocopying','Copying','Photocopy service',1,50),
 ('ID Picture Printing','Photo','ID pictures (per set)',1,50),
 ('Photo Printing','Photo','Photo prints',1,50),
 ('Scanning','Digital','Document scanning (per page)',1,0),
 ('Lamination','Finishing','Lamination (per piece)',1,50),
 ('Binding','Finishing','Binding (per copy)',1,50),
 ('Tarpaulin Printing','Large format','Per square foot (Pages = 1, Copies = sq ft)',3,50),
 ('Calling Cards','Commercial','Per card',3,50),
 ('Invitations','Commercial','Per piece',3,50),
 ('Thesis and Research Printing','Printing','Thesis / research manuscripts',2,50),
 ('Document Encoding','Digital','Typing / encoding per page',2,25)
on conflict (name) do nothing;

insert into public.service_pricing (service_id, paper_size, paper_type, color_mode, sided, unit_price)
select s.id, v.size, v.ptype, v.color, v.sided, v.price from (values
 ('A4 Document Printing','A4',null::text,'bw','any',3.00),
 ('A4 Document Printing','A4',null,'color','any',10.00),
 ('Short Bond Paper Printing','Short (8.5x11)',null,'bw','any',3.00),
 ('Short Bond Paper Printing','Short (8.5x11)',null,'color','any',10.00),
 ('Long Bond Paper Printing','Long (8.5x13)',null,'bw','any',4.00),
 ('Long Bond Paper Printing','Long (8.5x13)',null,'color','any',12.00),
 ('Black and White Printing',null,null,'bw','single',2.00),
 ('Black and White Printing',null,null,'bw','double',3.50),
 ('Colored Printing',null,null,'color','any',10.00),
 ('Photocopying',null,null,'bw','any',2.00),
 ('Photocopying',null,null,'color','any',8.00),
 ('ID Picture Printing','1x1',null,'color','any',45.00),
 ('ID Picture Printing','2x2',null,'color','any',60.00),
 ('Photo Printing','4R','Glossy','color','any',15.00),
 ('Photo Printing','5R','Glossy','color','any',25.00),
 ('Photo Printing','8R','Glossy','color','any',50.00),
 ('Scanning',null,null,'any','any',5.00),
 ('Lamination','A4',null,'any','any',25.00),
 ('Lamination','Short (8.5x11)',null,'any','any',25.00),
 ('Lamination','Long (8.5x13)',null,'any','any',30.00),
 ('Lamination','ID',null,'any','any',15.00),
 ('Binding',null,null,'any','any',40.00),
 ('Tarpaulin Printing',null,null,'color','any',18.00),
 ('Calling Cards',null,'Card stock','color','any',3.00),
 ('Invitations',null,'Card stock','color','any',25.00),
 ('Thesis and Research Printing','A4',null,'bw','any',3.50),
 ('Thesis and Research Printing','A4',null,'color','any',11.00),
 ('Document Encoding',null,null,'any','any',30.00)
) as v(name, size, ptype, color, sided, price) join public.services s on s.name = v.name
where not exists (select 1 from public.service_pricing);

insert into public.quantity_discounts (service_id, min_qty, discount_percent)
select null, q, d from (values (100,5),(500,10),(1000,15)) v(q,d)
where not exists (select 1 from public.quantity_discounts);

insert into public.expense_categories (name) values
 ('Paper purchases'),('Ink purchases'),('Electricity'),('Internet'),('Equipment maintenance'),
 ('Employee salaries'),('Rent'),('Other')
on conflict (name) do nothing;

insert into public.inventory (name, category, unit, quantity, min_stock, unit_cost) values
 ('Short Bond Paper','Bond Paper','reams',20,5,230),
 ('Long Bond Paper','Bond Paper','reams',10,3,260),
 ('A4 Bond Paper','Bond Paper','reams',20,5,240),
 ('Glossy Photo Paper','Photo Paper','packs',10,3,180),
 ('Black Ink','Ink','bottles',10,3,350),
 ('Toner','Toner','cartridges',3,1,2800),
 ('Laminating Film','Laminating Film','rolls',5,2,900),
 ('Binding Materials','Binding Materials','sets',50,10,15),
 ('Tarpaulin Roll','Tarpaulin Materials','rolls',2,1,6500)
on conflict (name) do nothing;

insert into public.business_settings (key, value) values
 ('business_name','MJ''s Printing'),('business_address','Your address here'),('business_phone',''),
 ('business_email',''),('business_hours','Mon-Sat 8:00 AM - 6:00 PM'),('order_prefix','PSMS'),
 ('receipt_footer','Thank you for your business!'),('currency','PHP')
on conflict (key) do nothing;
