"""Fetch Falmouth group membership counts from the Four Norms API at build time.

Writes data/fournorms.json for Hugo. Never fails the build: if the key is missing
or the API errors, it leaves no file and the home page falls back to the
number in data/home.yaml.
"""
import json, os, sys, urllib.request

key = os.environ.get("FOUR_NORMS_API_KEY", "").strip()
org = os.environ.get("FOUR_NORMS_ORG_SLUG", "turning-life-on")
group = os.environ.get("FOUR_NORMS_GROUP_SLUG", "falmouth-for-intentional-tech")
if not key:
    print("FOUR_NORMS_API_KEY not set; skipping member count.")
    sys.exit(0)

url = f"https://www.fournorms.com/api/v1/organizations/{org}/groups/{group}.json"
req = urllib.request.Request(url, headers={"X-API-Key": key, "Accept": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        body = json.load(r)
except Exception as e:  # network, 401/403/404, bad JSON
    print(f"::warning::Could not fetch Four Norms group ({e}); keeping fallback count.")
    sys.exit(0)

group_obj = body.get("data", body)          # tolerate a {data: ...} wrapper
m = group_obj.get("membership") or {}
out = {k: m.get(k) for k in ("registered_member_count", "supporter_count", "email_subscriber_count", "last_30_days")}
out["events_count"] = (group_obj.get("events") or {}).get("count")
print("Four Norms membership:", json.dumps(out))   # counts only, no personal data
os.makedirs("data", exist_ok=True)
with open("data/fournorms.json", "w") as f:
    json.dump(out, f, indent=2)
