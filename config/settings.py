"""
Configuration settings for Workana scraper
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory
BASE_DIR = Path(__file__).parent.parent

# Load environment variables from .env file
# utf-8-sig strips a Windows UTF-8 BOM so the first key loads correctly
env_path = BASE_DIR / '.env'
if env_path.exists():
    load_dotenv(env_path, encoding='utf-8-sig', override=True)
else:
    load_dotenv(encoding='utf-8-sig', override=True)

# Supabase (primary datastore) — the scraper writes with the secret key
# (SUPABASE_SECRET_KEY, `sb_secret_…`). The legacy service_role JWT in
# SUPABASE_SERVICE_KEY still works as a fallback.
SUPABASE_URL = os.getenv('SUPABASE_URL', '').strip()
SUPABASE_SERVICE_KEY = (
    os.getenv('SUPABASE_SECRET_KEY', '').strip()
    or os.getenv('SUPABASE_SERVICE_KEY', '').strip()
)

# Scraping settings
BASE_URL = "https://www.workana.com"
JOBS_URL = f"{BASE_URL}/jobs"
DEFAULT_CATEGORY = "it-programming"
DEFAULT_LANGUAGE = "en,pt,es"  # English, Portuguese, Spanish

# Driver settings
# Workana is behind a Cloudflare managed challenge that a stock Selenium Chrome
# never passes — headless or not. undetected-chromedriver clears it, but only
# when Chrome runs headful, so this needs a display (Xvfb on a VPS):
#     xvfb-run -a python main.py
# Set USE_UNDETECTED_DRIVER=0 to fall back to the stock driver (expect 403s on
# job detail pages, and intermittent challenges on the listing).
USE_UNDETECTED_DRIVER = os.getenv('USE_UNDETECTED_DRIVER', '1').strip().lower() not in ('0', 'false', 'no')

# Only honoured by the stock driver. undetected-chromedriver forces headful,
# because headless is exactly what Cloudflare detects.
HEADLESS = os.getenv('HEADLESS', '1').strip().lower() not in ('0', 'false', 'no')
IMPLICIT_WAIT = 3  # seconds (reduced from 10)
PAGE_LOAD_TIMEOUT = 20  # seconds (reduced from 30)
# Clearing a Cloudflare challenge takes ~30s on a cold browser, so the stock
# 20s timeout would abort mid-challenge and leave the driver on a blank tab.
PAGE_LOAD_TIMEOUT_UNDETECTED = int(os.getenv('PAGE_LOAD_TIMEOUT_UNDETECTED', '75'))
EXPLICIT_WAIT_TIMEOUT = 5  # seconds (reduced from 10)
PAGE_LOAD_RETRIES = int(os.getenv('PAGE_LOAD_RETRIES', '1'))

# Rate limiting (optimized for speed while still being respectful)
DELAY_BETWEEN_REQUESTS = 1  # seconds (reduced from 3)
RANDOM_DELAY_RANGE = (0.5, 2)  # Random delay range in seconds (reduced from 2-5)

# Scraping limits
MAX_PAGES = 1  # Maximum pages to scrape (None = no limit)
STOP_ON_KNOWN_JOB = False  # Stop scraping when encountering known job ID (False = continue scraping)

# Scheduler settings
SCRAPE_INTERVAL = 30  # Seconds between scrapes (set to None to run once and exit)

# User agent
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Chrome options (optimized for speed)
CHROME_OPTIONS = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-extensions',
    '--disable-gpu',  # Faster in headless
    '--disable-software-rasterizer',  # Performance
    '--disable-background-timer-throttling',  # Performance
    '--disable-backgrounding-occluded-windows',  # Performance
    '--disable-renderer-backgrounding',  # Performance
]

if HEADLESS:
    CHROME_OPTIONS.append('--headless')

# Logging
LOG_LEVEL = "INFO"
LOG_FILE = BASE_DIR / 'scraper.log'

# OpenAI API — used only by the AI category filter (yes/no triage of each new job)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '').strip()
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini').strip()

# Capture from now on — the first scrape records what is already listed on
# Workana as the starting point and stores none of it; only projects posted
# afterwards are kept. Set to '0' to store the current listing as well.
CAPTURE_FROM_NOW = os.getenv('CAPTURE_FROM_NOW', '1').strip().lower() not in ('0', 'false', 'no', '')

# AI category filter — when on, only store jobs the AI classifies as one of the
# target project types (SaaS, corporate/service sites excl. WordPress, custom
# CRM/ERP, Python apps / API integrations, Shopify). Set to '0'/'false' to keep
# the previous behaviour (store everything that passes country/price/payment).
AI_CATEGORY_FILTER = os.getenv('AI_CATEGORY_FILTER', '1').strip().lower() not in ('0', 'false', 'no', '')

