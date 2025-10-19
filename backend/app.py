import os, json, csv, secrets, random
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv

# ---------------- env / paths ----------------
load_dotenv()

APP_PASSWORD = os.getenv("APP_PASSWORD", "Chem123")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", APP_PASSWORD)


BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

USED_950_PATH = DATA_DIR / "used_950.json"   # NEW: 950s that have already submitted
ASSIGNMENTS_PATH = DATA_DIR / "assignments.json"   # active tokens/metal per 950
RESULTS_PATH = DATA_DIR / "results.csv"            # final submissions
METALS_PATH = DATA_DIR / "metals.json"             # all trials for 6 metals
METAL_COUNTS_PATH = DATA_DIR / "metal_counts.json"   # NEW: per-period assignment counts


# --------------- app ---------------
app = Flask(__name__)
CORS(app, supports_credentials=True)

# --------------- helpers ---------------

def read_used_950():
    if USED_950_PATH.exists():
        return set(json.loads(USED_950_PATH.read_text(encoding="utf-8")))
    return set()

def write_used_950(s: set[str]):
    USED_950_PATH.write_text(json.dumps(sorted(list(s)), indent=2), encoding="utf-8")

def read_counts():
    """Return dict like {'1': {'Zn':2,'Al':1,...}, '2': {...}}."""
    if METAL_COUNTS_PATH.exists():
        return json.loads(METAL_COUNTS_PATH.read_text(encoding="utf-8"))
    return {}

def write_counts(data):
    METAL_COUNTS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

def pick_balanced_metal(period: str, metal_keys: list[str]) -> str:
    """
    Choose a metal with the smallest count for this period.
    Ties are broken randomly to avoid bias.
    """
    counts = read_counts()
    per = counts.get(period, {})
    # ensure all metals present
    for m in metal_keys:
        per.setdefault(m, 0)

    # find minimum assigned count
    min_count = min(per[m] for m in metal_keys)
    candidates = [m for m in metal_keys if per[m] == min_count]
    choice = random.choice(candidates)

    # persist increment
    per[choice] += 1
    counts[period] = per
    write_counts(counts)
    return choice

def load_metals():
    """Load metals.json (student-facing trial data)."""
    if not METALS_PATH.exists():
        raise FileNotFoundError(f"Missing metals.json at {METALS_PATH}")
    with METALS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

def read_assignments():
    if ASSIGNMENTS_PATH.exists():
        return json.loads(ASSIGNMENTS_PATH.read_text(encoding="utf-8"))
    return {}

def write_assignments(data):
    ASSIGNMENTS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

def init_results_csv():
    if not RESULTS_PATH.exists():
        with RESULTS_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["950", "FullName", "Guess", "Correct", "Result", "Period"])

def to_ui_trials(metal_entry):
    """
    Transform metals.json entry -> UI schema your frontend expects.
    metals.json uses: hammer, conductivity, water, crucible, acid, flame, activity
    UI needs keys:   Hammer, Conductivity, Water, Crucible, HCl, Flame, ActivitySeries
    """
    return {
        "Hammer": metal_entry.get("hammer", ""),
        "Conductivity": metal_entry.get("conductivity", ""),
        "Water": metal_entry.get("water", ""),
        "Crucible": metal_entry.get("crucible", ""),
        "HCl": metal_entry.get("acid", ""),
        "Flame": metal_entry.get("flame", ""),
        "ActivitySeries": metal_entry.get("activity", {}),
    }

# --------------- routes ---------------

@app.post("/api/login")
def login():
    """
    Body (JSON):
      { "fullName": str, "id950": str, "period": str, "password": str }

    Rules:
      - password must equal APP_PASSWORD
      - 950 must be exactly 8 digits
      - a 950 cannot be reused (blocked if currently assigned OR already submitted)
      - assigns a metal (balanced per period if pick_balanced_metal is available)
      - returns trials with keys expected by the frontend:
        Hammer, Conductivity, Water, Crucible, HCl, Flame, ActivitySeries
    """
    data = request.get_json(force=True)

    # --- Auth ---
    if data.get("password") != APP_PASSWORD:
        return jsonify({"ok": False, "error": "Invalid password"}), 401

    # --- Extract & validate fields ---
    id950 = str(data.get("id950", "")).strip()
    full_name = str(data.get("fullName", "")).strip()
    period = str(data.get("period", "")).strip()

    if not id950 or not full_name or not period:
        return jsonify({"ok": False, "error": "Missing fields"}), 400

    # 950 must be exactly 8 digits
    if not id950.isdigit() or len(id950) != 8:
        return jsonify({"ok": False, "error": "Invalid 950 number (must be 8 digits)"}), 400

    assignments = read_assignments()     # active sessions { "950": {..., "token": ...}, ... }
    used_950 = read_used_950()           # set/list of permanently used 950s

    # Block if already fully used (submitted in the past) OR currently in use
    if id950 in used_950 or id950 in assignments:
        return jsonify({"ok": False, "error": "950 number already in use"}), 403

    # --- Pick metal and build trials ---
    METALS = load_metals()               # dict loaded from data/metals.json
    metal_keys = list(METALS.keys())

    # Prefer balanced assignment per period; fall back to random if not available
    try:
        metal = pick_balanced_metal(period, metal_keys)  # requires helper from earlier step
    except NameError:
        metal = random.choice(metal_keys)

    trials = to_ui_trials(METALS[metal]) # map json keys -> UI keys

    # --- Create session token & persist assignment ---
    token = secrets.token_hex(16)
    assignments[id950] = {
        "metal": metal,
        "fullName": full_name,
        "period": period,
        "token": token,
    }
    write_assignments(assignments)

    # --- Response for frontend ---
    return jsonify({
        "ok": True,
        "token": token,
        "metal": metal,
        "trials": trials
    })


@app.post("/api/submit")
def submit():
    """
    Body: { token, guess }
    - finds the student by token
    - writes a row to results.csv: 950, FullName, Guess, Correct, Result, Period
    - consumes (removes) the 950 so it cannot be reused
    """
    data = request.get_json(force=True)
    token = data.get("token", "")
    guess = str(data.get("guess", "")).strip()

    if not token or not guess:
        return jsonify({"ok": False, "error": "Missing token or guess"}), 400

    assignments = read_assignments()
    found_key = None
    record = None
    for id950, v in assignments.items():
        if v.get("token") == token:
            found_key = id950
            record = v
            break

    if not record:
        return jsonify({"ok": False, "error": "Invalid token"}), 401

    correct = record["metal"]
    result = "CORRECT" if guess.lower() == correct.lower() else "WRONG"

    init_results_csv()
    with RESULTS_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([found_key, record["fullName"], guess, correct, result, record["period"]])

    # mark 950 as permanently used (cannot be used again)
    used_950 = read_used_950()
    used_950.add(found_key)
    write_used_950(used_950)

    # consume this 950 (remove active session)
    assignments.pop(found_key, None)
    write_assignments(assignments)


    # consume this 950
    assignments.pop(found_key, None)
    write_assignments(assignments)

    return jsonify({"ok": True, "result": result})


# ---------- Teacher Tools ----------

@app.post("/api/auth")
def teacher_auth():
    """Body: { password } -> ok=True if password == ADMIN_PASSWORD."""
    pwd = request.get_json(force=True).get("password", "")
    if pwd == ADMIN_PASSWORD:
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "Unauthorized"}), 401


@app.get("/api/results")
def download_results():
    """GET /api/results?password=ADMIN_PASSWORD -> download CSV."""
    pwd = request.args.get("password", "")
    if pwd != ADMIN_PASSWORD:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    init_results_csv()
    return send_file(
        str(RESULTS_PATH),
        as_attachment=True,
        download_name="results.csv",
        mimetype="text/csv"
    )


@app.post("/api/reset")
def reset_all():
    """
    Body: { password, confirm: true }
    - clears results.csv (rewrites header)
    - deletes assignments.json (resets all active 950s)
    """
    data = request.get_json(force=True)
    pwd = data.get("password", "")
    confirm = data.get("confirm", False)

    if pwd != ADMIN_PASSWORD:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    if not confirm:
        return jsonify({"ok": False, "error": "Confirmation required"}), 400

    # Clear results.csv
    with RESULTS_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["950", "FullName", "Guess", "Correct", "Result", "Period"])

    

    # Remove active assignments
    if ASSIGNMENTS_PATH.exists():
        ASSIGNMENTS_PATH.unlink()

    # Clear per-period metal assignment counts
    if METAL_COUNTS_PATH.exists():
        METAL_COUNTS_PATH.unlink()

    # Clear permanently used 950 list
    if USED_950_PATH.exists():
        USED_950_PATH.unlink()

    return jsonify({"ok": True})


# --------------- main ---------------
if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5001"))
    app.run(host=host, port=port, debug=True)
