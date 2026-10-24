-- Demo data for trying the passenger screens before the driver screens exist.
-- 1. Sign up in the app once with a SECOND account (the demo driver).
-- 2. Put that account's email below and run this file in the Supabase SQL editor.
-- 3. Sign in with your main account — the demo rides appear in "Find a ride".

do $$
declare
  v_driver_email text := 'driver@example.com';   -- ← change me
  v_driver  uuid;
  v_group1  uuid;
  v_group2  uuid;
  v_route   uuid;
begin
  select id into v_driver from public.profiles where email = v_driver_email;
  if v_driver is null then
    raise exception 'No profile with email % — sign in with it first', v_driver_email;
  end if;

  update public.profiles
  set full_name = coalesce(nullif(full_name, ''), 'רחל כהן'),
      phone = coalesce(phone, '050-765-4321'),
      vehicle_model = coalesce(vehicle_model, 'יונדאי איוניק'),
      vehicle_color = coalesce(vehicle_color, 'לבן'),
      vehicle_seats = coalesce(vehicle_seats, 4)
  where id = v_driver;

  select id into v_group1 from public.ride_groups where origin = 'בית שמש' and destination = 'ירושלים';
  select id into v_group2 from public.ride_groups where origin = 'בית שמש' and destination = 'הר חוצבים';

  -- Recurring: Sun–Thu, Beit Shemesh → Jerusalem
  insert into public.routes (driver_id, group_id, kind, weekdays, out_time, return_time, seats, price)
  values (v_driver, v_group1, 'recurring', '{0,1,2,3,4}', '07:15', '16:30', 4, 24)
  returning id into v_route;
  insert into public.stops (route_id, kind, label, lat, lng, position) values
    (v_route, 'pickup',  'נהר הירדן / רבי עקיבא',        31.7163, 34.9893, 1),
    (v_route, 'pickup',  'רמת בית שמש ג׳, מרכז מסחרי',  31.7072, 34.9800, 2),
    (v_route, 'pickup',  'צומת ביג בית שמש',            31.7449, 34.9786, 3),
    (v_route, 'dropoff', 'בנייני האומה',                31.7873, 35.2033, 1),
    (v_route, 'dropoff', 'גשר המיתרים',                 31.7889, 35.2017, 2),
    (v_route, 'dropoff', 'התחנה המרכזית ירושלים',       31.7892, 35.2034, 3);

  -- Recurring: Sun, Tue, Thu, Beit Shemesh → Har Hotzvim
  insert into public.routes (driver_id, group_id, kind, weekdays, out_time, return_time, seats, price)
  values (v_driver, v_group2, 'recurring', '{0,2,4}', '07:30', '17:00', 3, 28)
  returning id into v_route;
  insert into public.stops (route_id, kind, label, lat, lng, position) values
    (v_route, 'pickup',  'רמת בית שמש ג׳, מרכז מסחרי',  31.7072, 34.9800, 1),
    (v_route, 'pickup',  'צומת ביג בית שמש',            31.7449, 34.9786, 2),
    (v_route, 'dropoff', 'הר חוצבים, רחוב הרטום',       31.7980, 35.2090, 1);
end $$;
