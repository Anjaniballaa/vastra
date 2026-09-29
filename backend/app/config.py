import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _bool(name: str, default: bool = False) -> bool:
    return _get(name, str(default)).lower() in ("1", "true", "yes", "on")


APP_ENV = _get("APP_ENV", "development")
IS_DEV = APP_ENV == "development"
APP_SECRET = _get("APP_SECRET", "dev-secret")
FRONTEND_URL = _get("FRONTEND_URL", "http://localhost:3000")
PUBLIC_API_URL = _get("PUBLIC_API_URL", "http://localhost:8000")

DATABASE_URL = _get("DATABASE_URL")

HINDSIGHT_API_URL = _get("HINDSIGHT_API_URL", "https://api.hindsight.vectorize.io")
HINDSIGHT_API_KEY = _get("HINDSIGHT_API_KEY")
PLAYBOOK_BANK = _get("PLAYBOOK_BANK", "vastra-playbook")
CUSTOMER_BANK_PREFIX = _get("CUSTOMER_BANK_PREFIX", "vastra-cust-")

GROQ_API_KEY = _get("GROQ_API_KEY")
GROQ_MODEL_MAIN = _get("GROQ_MODEL_MAIN", "openai/gpt-oss-120b")
GROQ_MODEL_FAST = _get("GROQ_MODEL_FAST", "openai/gpt-oss-20b")

RAZORPAY_KEY_ID = _get("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = _get("RAZORPAY_KEY_SECRET")

CLOUDINARY_CLOUD_NAME = _get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = _get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = _get("CLOUDINARY_API_SECRET")

EMAIL_PROVIDER = _get("EMAIL_PROVIDER", "gmail")
EMAIL_FROM_NAME = _get("EMAIL_FROM_NAME", "Vastra Support")
RESEND_API_KEY = _get("RESEND_API_KEY")
RESEND_FROM = _get("RESEND_FROM")
GMAIL_ADDRESS = _get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = _get("GMAIL_APP_PASSWORD").replace(" ", "")

TWILIO_ACCOUNT_SID = _get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = _get("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = _get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TWILIO_PHONE_NUMBER = _get("TWILIO_PHONE_NUMBER")
TWILIO_VOICE_ENABLED = _bool("TWILIO_VOICE_ENABLED")
TWILIO_VALIDATE_SIGNATURE = _bool("TWILIO_VALIDATE_SIGNATURE")

BOOTSTRAP_ADMIN_EMAIL = _get("BOOTSTRAP_ADMIN_EMAIL").lower()
BOOTSTRAP_ADMIN_NAME = _get("BOOTSTRAP_ADMIN_NAME", "Admin")
BOOTSTRAP_ADMIN_PASSWORD = _get("BOOTSTRAP_ADMIN_PASSWORD")

# Store constants (the store's own business configuration)
WAREHOUSE_PINCODE = _get("WAREHOUSE_PINCODE", "500081")  # Hyderabad
FREE_SHIPPING_ABOVE = 799
SHIPPING_FEE = 79
POINTS_PER_100 = 1  # loyalty points earned per ₹100 on delivery
MAX_POINTS_REDEEM_PCT = 10


def email_configured() -> bool:
    if EMAIL_PROVIDER == "resend":
        return bool(RESEND_API_KEY and RESEND_FROM)
    return bool(GMAIL_ADDRESS and GMAIL_APP_PASSWORD)


def imap_configured() -> bool:
    return bool(GMAIL_ADDRESS and GMAIL_APP_PASSWORD)
