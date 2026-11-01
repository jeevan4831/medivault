import os

# Must be set BEFORE the app is imported. Tests never touch MySQL.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_ENV"] = "testing"
os.environ["ENABLE_PERMISSION_CLEANUP_TASK"] = "false"

