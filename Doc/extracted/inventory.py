import os, re

mig_dir = 'supabase/migrations'
mig_files = sorted([f for f in os.listdir(mig_dir) if f.endswith('.sql')])

all_funcs = {}
all_triggers = {}
all_policies = {}
all_enums = {}

for mf in mig_files:
    path = os.path.join(mig_dir, mf)
    with open(path, encoding='utf-8') as f:
        sql = f.read()

    # Enums
    enums = re.findall(r'CREATE TYPE public\.([a-zA-Z0-9_]+) AS ENUM', sql, re.IGNORECASE)
    for e in enums:
        all_enums[e] = mf

    # Functions
    funcs = re.findall(r'CREATE (?:OR REPLACE )?FUNCTION public\.([a-zA-Z0-9_]+)\s*\((.*?)\)', sql, re.DOTALL | re.IGNORECASE)
    for fname, args in funcs:
        clean_args = ' '.join(args.split())
        all_funcs[fname] = (mf, clean_args)

    # Triggers
    triggers = re.findall(r'CREATE TRIGGER ([a-zA-Z0-9_]+)\s+(BEFORE|AFTER)\s+([A-Z\s]+)\s+ON public\.([a-zA-Z0-9_]+)', sql, re.IGNORECASE)
    for tname, timing, event, tbl in triggers:
        all_triggers[tname] = (mf, tbl, timing, event.strip())

    # Policies
    policies = re.findall(r'CREATE POLICY "([^"]+)"\s+ON public\.([a-zA-Z0-9_]+)', sql, re.IGNORECASE)
    for pname, tbl in policies:
        all_policies[pname] = (mf, tbl)

print(f"Enums: {len(all_enums)}")
for e, mf in sorted(all_enums.items()):
    print(f"  {e:30} ({mf})")

print(f"\nFunctions: {len(all_funcs)}")
for f, (mf, args) in sorted(all_funcs.items()):
    print(f"  {f:35} ({mf}) : {args[:60]}")

print(f"\nTriggers: {len(all_triggers)}")
for t, (mf, tbl, timing, event) in sorted(all_triggers.items()):
    print(f"  {t:35} on {tbl:25} ({timing} {event})")

print(f"\nPolicies: {len(all_policies)}")
for p, (mf, tbl) in sorted(all_policies.items()):
    print(f"  {p:45} on {tbl}")
