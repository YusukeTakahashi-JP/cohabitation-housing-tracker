#!/usr/bin/env python3
"""
Cohabitation Housing Tracker - Local Multi-Device Server
Syncs bidirectionally between:
  1. SQLite database: ~/Projects/cohabitation-housing-tracker/housing.db
  2. PKB Master JSON: ~/Projects/Grimoire-pkb/04_resources/housing_data/housing_db.json
  3. PKB Maisoku PDFs: ~/Projects/Grimoire-pkb/06_storage/housing/maisoku/
"""
import http.server
import json
import os
import sqlite3
import urllib.parse
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
PKB_ROOT = Path(os.environ.get("PKB_ROOT", APP_DIR.parent / "Grimoire-pkb")).resolve()
JSON_DB_PATH = PKB_ROOT / "04_resources" / "housing_data" / "housing_db.json"
PDF_DIR = PKB_ROOT / "06_storage" / "housing" / "maisoku"
IMG_DIR = PKB_ROOT / "06_storage" / "housing" / "images"
SQLITE_DB_PATH = APP_DIR / "housing.db"
PUBLIC_DIR = APP_DIR / "public"
PORT = int(os.environ.get("PORT", "3456"))


def init_and_sync_sqlite():
    """Initialize SQLite schema and sync from PKB JSON master file."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS agencies (
            id TEXT PRIMARY KEY,
            wave TEXT,
            area_group TEXT,
            station TEXT,
            company_name TEXT,
            branch_name TEXT,
            agent_name TEXT,
            email TEXT,
            phone TEXT,
            form_url TEXT,
            website_url TEXT,
            map_url TEXT,
            google_rating REAL,
            google_reviews INTEGER,
            contact_method TEXT,
            contact_status TEXT,
            master_rank TEXT,
            eval_no_call TEXT,
            eval_no_visit_push TEXT,
            eval_speed INTEGER,
            eval_fee_level TEXT,
            eval_proposal_quality INTEGER,
            proposal_count INTEGER,
            memo TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS properties (
            id TEXT PRIMARY KEY,
            building_name TEXT,
            room_number TEXT,
            source_type TEXT,
            area_category TEXT,
            address TEXT,
            station_info TEXT,
            walk_minutes INTEGER,
            commute_toyosu_min INTEGER,
            rent_yen INTEGER,
            management_fee_yen INTEGER,
            total_monthly_yen INTEGER,
            floor_plan TEXT,
            area_sqm REAL,
            layout_detail TEXT,
            structure TEXT,
            built_date TEXT,
            age_years INTEGER,
            floor_info TEXT,
            direction TEXT,
            gas_type TEXT,
            available_date TEXT,
            management_info TEXT,
            contract_terms TEXT,
            disclosure_notes TEXT,
            washer_pan_status TEXT,
            equipments_json TEXT,
            rule_check_status TEXT,
            fail_reasons_json TEXT,
            ai_score INTEGER,
            ai_pros_json TEXT,
            ai_cons_json TEXT,
            master_rating INTEGER,
            partner_rating INTEGER,
            status TEXT,
            suumo_url TEXT,
            viewing_checklist_json TEXT,
            notes TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            property_id TEXT,
            agency_id TEXT,
            gmail_message_id TEXT,
            proposed_date TEXT,
            assumed_start_date TEXT,
            total_initial_cost_yen INTEGER,
            breakdown_json TEXT,
            cuttable_amount_yen INTEGER,
            cost_audit_comment TEXT,
            maisoku_pdf TEXT,
            maisoku_page_count INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_logs (
            gmail_message_id TEXT PRIMARY KEY,
            agency_id TEXT,
            received_at TEXT,
            direction TEXT,
            subject TEXT,
            summary TEXT,
            action_status TEXT
        )
    """)
    conn.commit()

    if JSON_DB_PATH.exists():
        with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        sync_json_to_sqlite(conn, data)
    conn.close()


def sync_json_to_sqlite(conn, data):
    cur = conn.cursor()
    cur.execute("DELETE FROM agencies")
    for a in data.get("agencies", []):
        cur.execute("""
            INSERT INTO agencies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            a.get("id"), a.get("wave"), a.get("area_group"), a.get("station"),
            a.get("company_name"), a.get("branch_name"), a.get("agent_name"),
            a.get("email"), a.get("phone"), a.get("form_url"), a.get("website_url"),
            a.get("map_url"), a.get("google_rating", 0.0), a.get("google_reviews", 0),
            a.get("contact_method"), a.get("contact_status"), a.get("master_rank", "PENDING"),
            a.get("eval_no_call", "未確認"), a.get("eval_no_visit_push", "未確認"),
            a.get("eval_speed", 0), a.get("eval_fee_level", "未確認"),
            a.get("eval_proposal_quality", 0), a.get("proposal_count", 0), a.get("memo", "")
        ))

    cur.execute("DELETE FROM properties")
    for p in data.get("properties", []):
        cur.execute("""
            INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            p.get("id"), p.get("building_name"), p.get("room_number"), p.get("source_type"),
            p.get("area_category"), p.get("address"), p.get("station_info"),
            p.get("walk_minutes", 0), p.get("commute_toyosu_min", 0),
            p.get("rent_yen", 0), p.get("management_fee_yen", 0), p.get("total_monthly_yen", 0),
            p.get("floor_plan"), p.get("area_sqm", 0.0), p.get("layout_detail"),
            p.get("structure"), p.get("built_date"), p.get("age_years", 0),
            p.get("floor_info"), p.get("direction"), p.get("gas_type"),
            p.get("available_date"), p.get("management_info"), p.get("contract_terms"),
            p.get("disclosure_notes"), p.get("washer_pan_status"),
            json.dumps(p.get("equipments", {}), ensure_ascii=False),
            p.get("rule_check_status"),
            json.dumps(p.get("fail_reasons", []), ensure_ascii=False),
            p.get("ai_score", 0),
            json.dumps(p.get("ai_pros", []), ensure_ascii=False),
            json.dumps(p.get("ai_cons", []), ensure_ascii=False),
            p.get("master_rating", 0), p.get("partner_rating", 0),
            p.get("status", "候補（検討中）"), p.get("suumo_url", ""),
            json.dumps(p.get("viewing_checklist", {}), ensure_ascii=False),
            p.get("notes", "")
        ))

    cur.execute("DELETE FROM proposals")
    for pr in data.get("proposals", []):
        cur.execute("""
            INSERT INTO proposals VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            pr.get("id"), pr.get("property_id"), pr.get("agency_id"),
            pr.get("gmail_message_id"), pr.get("proposed_date"),
            pr.get("assumed_start_date"), pr.get("total_initial_cost_yen", 0),
            json.dumps(pr.get("breakdown", {}), ensure_ascii=False),
            pr.get("cuttable_amount_yen", 0), pr.get("cost_audit_comment", ""),
            pr.get("maisoku_pdf", ""), pr.get("maisoku_page_count", 0)
        ))

    cur.execute("DELETE FROM email_logs")
    for em in data.get("email_logs", []):
        cur.execute("""
            INSERT INTO email_logs VALUES (?,?,?,?,?,?,?)
        """, (
            em.get("gmail_message_id"), em.get("agency_id"), em.get("received_at"),
            em.get("direction"), em.get("subject"), em.get("summary"), em.get("action_status")
        ))
    conn.commit()


def load_json_db():
    with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json_and_sqlite(data):
    data["meta"]["updated_at"] = datetime.now().astimezone().isoformat()
    JSON_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    conn = sqlite3.connect(SQLITE_DB_PATH)
    sync_json_to_sqlite(conn, data)
    conn.close()


class HousingRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/data":
            init_and_sync_sqlite()
            data = load_json_db()
            self._send_json(data)
            return
        if parsed.path.startswith("/pdfs/"):
            filename = urllib.parse.unquote(parsed.path[len("/pdfs/"):])
            pdf_path = (PDF_DIR / filename).resolve()
            if pdf_path.exists() and str(pdf_path).startswith(str(PDF_DIR.resolve())):
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(pdf_path.stat().st_size))
                self.end_headers()
                with open(pdf_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            self.send_error(404, "PDF not found")
            return
        if parsed.path.startswith("/images/"):
            filename = urllib.parse.unquote(parsed.path[len("/images/"):])
            img_path = (IMG_DIR / filename).resolve()
            if img_path.exists() and str(img_path).startswith(str(IMG_DIR.resolve())):
                ctype = "image/png" if filename.endswith(".png") else "image/jpeg"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(img_path.stat().st_size))
                self.end_headers()
                with open(img_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            self.send_error(404, "Image not found")
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
        data = load_json_db()

        if parsed.path == "/api/update_property":
            prop_id = body.get("id")
            for p in data.get("properties", []):
                if p["id"] == prop_id:
                    for k in ["master_rating", "partner_rating", "status", "notes", "viewing_checklist", "washer_pan_status", "disclosure_notes"]:
                        if k in body:
                            p[k] = body[k]
                    break
            save_json_and_sqlite(data)
            self._send_json({"ok": True, "data": data})
            return

        if parsed.path == "/api/update_agency":
            agency_id = body.get("id")
            for a in data.get("agencies", []):
                if a["id"] == agency_id:
                    for k in ["master_rank", "agent_name", "contact_status", "eval_no_call", "eval_no_visit_push", "eval_speed", "eval_fee_level", "eval_proposal_quality", "memo"]:
                        if k in body:
                            a[k] = body[k]
                    break
            save_json_and_sqlite(data)
            self._send_json({"ok": True, "data": data})
            return

        self.send_error(404, "Unknown API endpoint")

    def _send_json(self, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    init_and_sync_sqlite()
    print(f"==================================================")
    print(f"🏠 Cohabitation Housing Tracker running on:")
    print(f"   http://localhost:{PORT}")
    print(f"   PKB JSON DB : {JSON_DB_PATH}")
    print(f"   SQLite DB   : {SQLITE_DB_PATH}")
    print(f"   Maisoku PDFs: {PDF_DIR}")
    print(f"==================================================")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), HousingRequestHandler)
    server.serve_forever()
