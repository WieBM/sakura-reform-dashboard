"""
Sakura Reform Dashboard — API Test Utility
Usage: python scripts/api_test.py [--base-url http://localhost:3000]

Replaces the PowerShell Invoke-RestMethod approach that caused Japanese text
encoding issues. requests sends UTF-8 by default.
"""

import argparse
import json
import sys
import requests
sys.stdout.reconfigure(encoding="utf-8")

GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def ok(msg):  print(f"{GREEN}  ✅ {msg}{RESET}")
def fail(msg): print(f"{RED}  ❌ {msg}{RESET}")
def info(msg): print(f"{YELLOW}  ℹ  {msg}{RESET}")


def check(label, resp, expected_status=200, required_keys=None):
    if resp.status_code != expected_status:
        fail(f"{label}: HTTP {resp.status_code} (expected {expected_status})")
        return None
    try:
        data = resp.json()
    except Exception:
        fail(f"{label}: response is not valid JSON")
        return None
    if required_keys:
        missing = [k for k in required_keys if k not in (data if isinstance(data, dict) else (data[0] if data else {}))]
        if missing:
            fail(f"{label}: missing keys {missing}")
            return None
    ok(f"{label}")
    return data


def run_tests(base):
    results = {"pass": 0, "fail": 0}

    def wrap(label, resp, **kw):
        data = check(label, resp, **kw)
        if data is not None:
            results["pass"] += 1
        else:
            results["fail"] += 1
        return data

    print("\n── GET endpoints ────────────────────────────────────────")
    wrap("GET /api/summary",
         requests.get(f"{base}/api/summary"),
         required_keys=["contracted_total", "pipeline_count", "paid_amount", "unpaid_amount"])

    wrap("GET /api/projects",
         requests.get(f"{base}/api/projects"),
         required_keys=None)

    wrap("GET /api/projects (filter: status=契約済)",
         requests.get(f"{base}/api/projects", params={"status": "契約済"}))

    wrap("GET /api/projects/by-status",
         requests.get(f"{base}/api/projects/by-status"),
         required_keys=None)

    wrap("GET /api/projects/by-type",
         requests.get(f"{base}/api/projects/by-type"))

    wrap("GET /api/projects/monthly",
         requests.get(f"{base}/api/projects/monthly"))

    wrap("GET /api/customers",
         requests.get(f"{base}/api/customers"))

    wrap("GET /api/employees",
         requests.get(f"{base}/api/employees"))

    wrap("GET /api/employees/workload",
         requests.get(f"{base}/api/employees/workload"))

    wrap("GET /api/invoices",
         requests.get(f"{base}/api/invoices"))

    wrap("GET /api/staff/performance",
         requests.get(f"{base}/api/staff/performance"))

    print("\n── CRUD: customer lifecycle (Japanese text) ─────────────")
    # Create
    payload = {
        "name": "テスト 花子",
        "address": "東京都渋谷区テスト1-2-3",
        "building_type": "マンション",
        "phone": "03-0000-9999",
        "source": "紹介",
        "note": "Pythonテスト用データ"
    }
    resp = requests.post(f"{base}/api/customers", json=payload)
    created = wrap("POST /api/customers (Japanese text)", resp, expected_status=200, required_keys=["id"])
    if not created:
        results["fail"] += 3
        print("  ⚠  Skipping update/delete — create failed")
    else:
        cid = created["id"]
        info(f"Created customer id={cid}")

        # Update
        payload["name"] = "テスト 花子（更新済）"
        wrap(f"PUT /api/customers/{cid}",
             requests.put(f"{base}/api/customers/{cid}", json=payload))

        # Delete
        wrap(f"DELETE /api/customers/{cid}",
             requests.delete(f"{base}/api/customers/{cid}"))

        # Confirm 404 after delete
        r404 = requests.get(f"{base}/api/customers")
        still_exists = any(c["id"] == cid for c in r404.json())
        if not still_exists:
            ok("Customer gone after delete")
            results["pass"] += 1
        else:
            fail("Customer still present after delete")
            results["fail"] += 1

    print("\n── CRUD: project ────────────────────────────────────────")
    prj_payload = {
        "name": "Pythonテスト案件",
        "customer_name": "テスト顧客",
        "work_type": "内装",
        "status": "商談中",
        "probability": "60",
        "estimate_amount": 1500000,
    }
    resp = requests.post(f"{base}/api/projects", json=prj_payload)
    created_prj = wrap("POST /api/projects", resp, required_keys=["id"])
    if created_prj:
        pid = created_prj["id"]
        info(f"Created project id={pid}")

        prj_payload["status"] = "完了"
        prj_payload["contract_amount"] = 1450000
        wrap(f"PUT /api/projects/{pid} (status → 完了)",
             requests.put(f"{base}/api/projects/{pid}", json=prj_payload))

        wrap(f"DELETE /api/projects/{pid}",
             requests.delete(f"{base}/api/projects/{pid}"))
    else:
        results["fail"] += 2

    print("\n── Error handling ───────────────────────────────────────")
    wrap("PUT /api/projects/99999 → 404",
         requests.put(f"{base}/api/projects/99999",
                      json={"name": "x", "customer_name": "y"}),
         expected_status=404)

    wrap("DELETE /api/invoices/99999 → 404",
         requests.delete(f"{base}/api/invoices/99999"),
         expected_status=404)

    print(f"\n── Result: {results['pass']} passed, {results['fail']} failed ──────────────────────")
    return results["fail"] == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3000")
    args = parser.parse_args()

    print(f"Testing: {args.base_url}")
    success = run_tests(args.base_url)
    sys.exit(0 if success else 1)
