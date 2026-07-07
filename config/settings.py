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

# Supabase (primary datastore) — scraper writes with the service-role key
SUPABASE_URL = os.getenv('SUPABASE_URL', '').strip()
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '').strip()

# Scraping settings
BASE_URL = "https://www.workana.com"
JOBS_URL = f"{BASE_URL}/jobs"
DEFAULT_CATEGORY = "it-programming"
DEFAULT_LANGUAGE = "en,pt,es"  # English, Portuguese, Spanish

# Selenium settings
HEADLESS = True  # Set to False for debugging
IMPLICIT_WAIT = 3  # seconds (reduced from 10)
PAGE_LOAD_TIMEOUT = 20  # seconds (reduced from 30)
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

# Google Translate API (translates job content to English before storing)
# Enable Cloud Translation API in Google Cloud Console and create an API key
GOOGLE_TRANSLATE_API_KEY = os.getenv('GOOGLE_TRANSLATE_API_KEY', '').strip()

# OpenAI API for the AI analysis summary from full title + description
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '').strip()
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini').strip()

