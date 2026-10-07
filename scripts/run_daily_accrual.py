import importlib.util
import sys
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "backend" / "cron-accrue" / "index.py"
spec = importlib.util.spec_from_file_location("crm_daily_accrual", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = module.handler({"httpMethod": "POST", "body": "{}"}, None)
print(result.get("body", ""))
sys.exit(0 if int(result.get("statusCode", 500)) < 400 else 1)
