-- Repair the original namespace constraint: master_data is a valid permission prefix.
alter table public.permission_definitions drop constraint permission_definitions_code_check;
alter table public.permission_definitions add constraint permission_definitions_code_check
  check (code ~ '^[a-z_]+(\.[a-z_]+)+$');
