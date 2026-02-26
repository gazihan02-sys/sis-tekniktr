#!/usr/bin/env python3
import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Optional

import psycopg2
from psycopg2.extras import Json
from bson import decode_file_iter, ObjectId
from bson.datetime_ms import DatetimeMS
from bson.decimal128 import Decimal128


KNOWN_COLLECTIONS = {
    "users",
    "musteri_kabul",
    "montaj_kayitlari",
    "sms_queue",
    "delete_otp_requests",
}


def to_iso_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat()

    if isinstance(value, DatetimeMS):
        d = value.as_datetime()
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc).isoformat()

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = dt.datetime.fromisoformat(stripped.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return parsed.astimezone(dt.timezone.utc).isoformat()
        except ValueError:
            return None

    return None


def bson_default(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat()
    if isinstance(value, DatetimeMS):
        d = value.as_datetime()
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc).isoformat()
    if isinstance(value, Decimal128):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def to_jsonable(document: Dict[str, Any]) -> Dict[str, Any]:
    return json.loads(json.dumps(document, default=bson_default))


def table_for_collection(collection_name: str) -> Optional[str]:
    if collection_name in KNOWN_COLLECTIONS:
        return collection_name
    return None


def get_object_id_text(document: Dict[str, Any], key: str = "_id") -> Optional[str]:
    value = document.get(key)
    if isinstance(value, ObjectId):
        return str(value)
    if value is None:
        return None
    return str(value)


def bool_value(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y"}:
            return True
        if lowered in {"0", "false", "no", "n"}:
            return False
    return default


def int_value(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return default
    return default


def text_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def map_users(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mongo_id": get_object_id_text(document),
        "ad_soyad": text_value(document.get("ad_soyad"), ""),
        "username": text_value(document.get("username"), ""),
        "password": text_value(document.get("password"), ""),
        "theme_color": document.get("theme_color"),
        "level": document.get("level"),
        "created_at": to_iso_or_none(document.get("created_at")),
        "raw_doc": to_jsonable(document),
    }


def map_musteri_kabul(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mongo_id": get_object_id_text(document),
        "ad_soyad": text_value(document.get("ad_soyad"), ""),
        "telefon": text_value(document.get("telefon"), ""),
        "marka_model": text_value(document.get("marka_model"), ""),
        "servis_tipi": document.get("servis_tipi"),
        "aksesuarlar": text_value(document.get("aksesuarlar"), ""),
        "musteri_sikayeti": text_value(document.get("musteri_sikayeti"), ""),
        "not_field": document.get("not"),
        "teknisyen_aciklamasi": document.get("teknisyen_aciklamasi"),
        "tamir_fisi_no": document.get("tamir_fisi_no"),
        "sirala_dosya_url": document.get("sirala_dosya_url"),
        "belge_f": document.get("belge_f"),
        "belge_g": document.get("belge_g"),
        "belge_u": document.get("belge_u"),
        "belge_a": document.get("belge_a"),
        "status": text_value(document.get("status"), "MÜŞTERI_KABUL"),
        "fiyat_verilecek": bool_value(document.get("fiyat_verilecek"), False),
        "sms_gonderildi": bool_value(document.get("sms_gonderildi"), False),
        "sms_mesaj": document.get("sms_mesaj"),
        "created_at": to_iso_or_none(document.get("created_at")),
        "updated_at": to_iso_or_none(document.get("updated_at")),
        "raw_doc": to_jsonable(document),
    }


def map_montaj_kayitlari(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mongo_id": get_object_id_text(document),
        "rnu_is_emri_no": document.get("rnu_is_emri_no"),
        "ad_soyad": text_value(document.get("ad_soyad"), ""),
        "model": text_value(document.get("model"), ""),
        "telefon": text_value(document.get("telefon"), ""),
        "adres": document.get("adres"),
        "servis_tipi": text_value(document.get("servis_tipi"), ""),
        "atanan_kullanici_username": document.get("atanan_kullanici_username"),
        "kapatildi": bool_value(document.get("kapatildi"), False),
        "kapatildi_at": to_iso_or_none(document.get("kapatildi_at")),
        "kurulum_tipi": document.get("kurulum_tipi"),
        "kurulum_resimleri": to_jsonable(document.get("kurulum_resimleri", [])),
        "belge_f": document.get("belge_f"),
        "created_at": to_iso_or_none(document.get("created_at")),
        "updated_at": to_iso_or_none(document.get("updated_at")),
        "raw_doc": to_jsonable(document),
    }


def map_sms_queue(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mongo_id": get_object_id_text(document),
        "customer_mongo_id": get_object_id_text(document, "customer_id"),
        "status_id": int_value(document.get("status_id"), 0),
        "phone": document.get("phone"),
        "message": document.get("message"),
        "due_at": to_iso_or_none(document.get("due_at")),
        "created_at": to_iso_or_none(document.get("created_at")),
        "sent": bool_value(document.get("sent"), False),
        "sent_at": to_iso_or_none(document.get("sent_at")),
        "attempts": int_value(document.get("attempts"), 0),
        "last_error": document.get("last_error"),
        "provider_message": document.get("provider_message"),
        "raw_doc": to_jsonable(document),
    }


def map_delete_otp_requests(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_mongo_id": get_object_id_text(document),
        "otp_code": document.get("otp_code"),
        "action": document.get("action"),
        "resource_mongo_id": text_value(document.get("resource_id"), ""),
        "phone": document.get("phone"),
        "used": bool_value(document.get("used"), False),
        "created_at": to_iso_or_none(document.get("created_at")),
        "expires_at": to_iso_or_none(document.get("expires_at")),
        "raw_doc": to_jsonable(document),
    }


MAPPERS: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "users": map_users,
    "musteri_kabul": map_musteri_kabul,
    "montaj_kayitlari": map_montaj_kayitlari,
    "sms_queue": map_sms_queue,
    "delete_otp_requests": map_delete_otp_requests,
}


UPSERT_SQL = {
    "users": """
        INSERT INTO users
        (source_mongo_id, ad_soyad, username, password, theme_color, level, created_at, raw_doc)
        VALUES (%(source_mongo_id)s, %(ad_soyad)s, %(username)s, %(password)s, %(theme_color)s, %(level)s, %(created_at)s, %(raw_doc)s)
        ON CONFLICT (source_mongo_id) DO UPDATE SET
            ad_soyad = EXCLUDED.ad_soyad,
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            theme_color = EXCLUDED.theme_color,
            level = EXCLUDED.level,
            created_at = EXCLUDED.created_at,
            raw_doc = EXCLUDED.raw_doc
    """,
    "musteri_kabul": """
        INSERT INTO musteri_kabul
        (source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti, not_field,
         teknisyen_aciklamasi, tamir_fisi_no, sirala_dosya_url, belge_f, belge_g, belge_u, belge_a, status,
         fiyat_verilecek, sms_gonderildi, sms_mesaj, created_at, updated_at, raw_doc)
        VALUES (%(source_mongo_id)s, %(ad_soyad)s, %(telefon)s, %(marka_model)s, %(servis_tipi)s, %(aksesuarlar)s,
         %(musteri_sikayeti)s, %(not_field)s, %(teknisyen_aciklamasi)s, %(tamir_fisi_no)s, %(sirala_dosya_url)s,
         %(belge_f)s, %(belge_g)s, %(belge_u)s, %(belge_a)s, %(status)s, %(fiyat_verilecek)s, %(sms_gonderildi)s, %(sms_mesaj)s,
         %(created_at)s, %(updated_at)s, %(raw_doc)s)
        ON CONFLICT (source_mongo_id) DO UPDATE SET
            ad_soyad = EXCLUDED.ad_soyad,
            telefon = EXCLUDED.telefon,
            marka_model = EXCLUDED.marka_model,
            servis_tipi = EXCLUDED.servis_tipi,
            aksesuarlar = EXCLUDED.aksesuarlar,
            musteri_sikayeti = EXCLUDED.musteri_sikayeti,
            not_field = EXCLUDED.not_field,
            teknisyen_aciklamasi = EXCLUDED.teknisyen_aciklamasi,
            tamir_fisi_no = EXCLUDED.tamir_fisi_no,
            sirala_dosya_url = EXCLUDED.sirala_dosya_url,
            belge_f = EXCLUDED.belge_f,
            belge_g = EXCLUDED.belge_g,
            belge_u = EXCLUDED.belge_u,
            belge_a = EXCLUDED.belge_a,
            status = EXCLUDED.status,
            fiyat_verilecek = EXCLUDED.fiyat_verilecek,
            sms_gonderildi = EXCLUDED.sms_gonderildi,
            sms_mesaj = EXCLUDED.sms_mesaj,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            raw_doc = EXCLUDED.raw_doc
    """,
    "montaj_kayitlari": """
        INSERT INTO montaj_kayitlari
        (source_mongo_id, rnu_is_emri_no, ad_soyad, model, telefon, adres, servis_tipi, atanan_kullanici_username,
         kapatildi, kapatildi_at, kurulum_tipi, kurulum_resimleri, belge_f, created_at, updated_at, raw_doc)
        VALUES (%(source_mongo_id)s, %(rnu_is_emri_no)s, %(ad_soyad)s, %(model)s, %(telefon)s, %(adres)s,
         %(servis_tipi)s, %(atanan_kullanici_username)s, %(kapatildi)s, %(kapatildi_at)s, %(kurulum_tipi)s,
         %(kurulum_resimleri)s, %(belge_f)s, %(created_at)s, %(updated_at)s, %(raw_doc)s)
        ON CONFLICT (source_mongo_id) DO UPDATE SET
            rnu_is_emri_no = EXCLUDED.rnu_is_emri_no,
            ad_soyad = EXCLUDED.ad_soyad,
            model = EXCLUDED.model,
            telefon = EXCLUDED.telefon,
            adres = EXCLUDED.adres,
            servis_tipi = EXCLUDED.servis_tipi,
            atanan_kullanici_username = EXCLUDED.atanan_kullanici_username,
            kapatildi = EXCLUDED.kapatildi,
            kapatildi_at = EXCLUDED.kapatildi_at,
            kurulum_tipi = EXCLUDED.kurulum_tipi,
            kurulum_resimleri = EXCLUDED.kurulum_resimleri,
            belge_f = EXCLUDED.belge_f,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            raw_doc = EXCLUDED.raw_doc
    """,
    "sms_queue": """
        INSERT INTO sms_queue
        (source_mongo_id, customer_mongo_id, status_id, phone, message, due_at, created_at, sent, sent_at,
         attempts, last_error, provider_message, raw_doc)
        VALUES (%(source_mongo_id)s, %(customer_mongo_id)s, %(status_id)s, %(phone)s, %(message)s, %(due_at)s,
         %(created_at)s, %(sent)s, %(sent_at)s, %(attempts)s, %(last_error)s, %(provider_message)s, %(raw_doc)s)
        ON CONFLICT (source_mongo_id) DO UPDATE SET
            customer_mongo_id = EXCLUDED.customer_mongo_id,
            status_id = EXCLUDED.status_id,
            phone = EXCLUDED.phone,
            message = EXCLUDED.message,
            due_at = EXCLUDED.due_at,
            created_at = EXCLUDED.created_at,
            sent = EXCLUDED.sent,
            sent_at = EXCLUDED.sent_at,
            attempts = EXCLUDED.attempts,
            last_error = EXCLUDED.last_error,
            provider_message = EXCLUDED.provider_message,
            raw_doc = EXCLUDED.raw_doc
    """,
    "delete_otp_requests": """
        INSERT INTO delete_otp_requests
        (source_mongo_id, otp_code, action, resource_mongo_id, phone, used, created_at, expires_at, raw_doc)
        VALUES (%(source_mongo_id)s, %(otp_code)s, %(action)s, %(resource_mongo_id)s, %(phone)s, %(used)s,
         %(created_at)s, %(expires_at)s, %(raw_doc)s)
        ON CONFLICT (source_mongo_id) DO UPDATE SET
            otp_code = EXCLUDED.otp_code,
            action = EXCLUDED.action,
            resource_mongo_id = EXCLUDED.resource_mongo_id,
            phone = EXCLUDED.phone,
            used = EXCLUDED.used,
            created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at,
            raw_doc = EXCLUDED.raw_doc
    """,
}


def iter_bson_documents(bson_file: Path) -> Iterable[Dict[str, Any]]:
    with bson_file.open("rb") as handle:
        for document in decode_file_iter(handle):
            yield document


def insert_archive(cur: psycopg2.extensions.cursor, collection_name: str, document: Dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO mongo_collection_archive (collection_name, source_mongo_id, payload)
        VALUES (%s, %s, %s)
        ON CONFLICT (collection_name, source_mongo_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            imported_at = NOW()
        """,
        (
            collection_name,
            get_object_id_text(document),
            Json(to_jsonable(document)),
        ),
    )


def import_collection(cur: psycopg2.extensions.cursor, collection_name: str, bson_file: Path) -> int:
    mapper = MAPPERS.get(collection_name)
    target_table = table_for_collection(collection_name)
    inserted = 0

    for document in iter_bson_documents(bson_file):
        if mapper and target_table:
            payload = mapper(document)
            payload["raw_doc"] = Json(payload["raw_doc"])

            if "kurulum_resimleri" in payload:
                payload["kurulum_resimleri"] = Json(payload["kurulum_resimleri"])

            cur.execute(UPSERT_SQL[target_table], payload)
        else:
            insert_archive(cur, collection_name, document)

        inserted += 1

    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Import MongoDB BSON dump files into PostgreSQL")
    parser.add_argument("--dump-dir", required=True, help="Mongo dump directory (contains *.bson files)")
    parser.add_argument(
        "--postgres-dsn",
        required=True,
        help="PostgreSQL DSN, e.g. postgresql://user:pass@127.0.0.1:5432/sis_teknik",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        default=None,
        help="Optional collection names to import",
    )
    parser.add_argument(
        "--commit-every",
        type=int,
        default=1000,
        help="Commit every N inserted documents",
    )
    args = parser.parse_args()

    dump_dir = Path(args.dump_dir)
    if not dump_dir.exists() or not dump_dir.is_dir():
        raise SystemExit(f"Dump directory not found: {dump_dir}")

    only_set = set(args.only or [])

    bson_files = sorted(dump_dir.glob("*.bson"))
    if only_set:
        bson_files = [f for f in bson_files if f.stem in only_set]

    if not bson_files:
        raise SystemExit("No BSON files found for import")

    conn = psycopg2.connect(args.postgres_dsn)
    conn.autocommit = False

    total_inserted = 0
    with conn:
        with conn.cursor() as cur:
            for bson_file in bson_files:
                collection_name = bson_file.stem
                print(f"Importing {collection_name} from {bson_file.name}...")
                count = import_collection(cur, collection_name, bson_file)
                total_inserted += count
                print(f"  -> {count} documents")

                if args.commit_every > 0:
                    conn.commit()

    conn.close()
    print(f"Done. Total imported documents: {total_inserted}")


if __name__ == "__main__":
    main()
