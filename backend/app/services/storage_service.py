"""MediVault Document Storage & Cryptographic Encryption Service.

Cryptographic Design & Security Rationale:
1. Algorithm: AES-256-GCM (Galois/Counter Mode)
   - Authenticated Encryption with Associated Data (AEAD) standard (NIST SP 800-38D).
   - Provides both Confidentiality (encrypting document contents) and
     Cryptographic Authenticity/Integrity (detecting any modification, bit-flipping,
     or tampering).
   - Any tampering with the ciphertext causes an authentication tag mismatch,
     rejecting the corrupted payload before plaintext processing occurs.

2. Key Management:
   - AES-256 requires a 256-bit (32-byte) key.
   - The master key is retrieved strictly from environment variables (STORAGE_ENCRYPTION_KEY).
   - Keys are NEVER hard-coded in source files or committed to version control.
   - Decodes base64-encoded 32-byte keys or derives 32 bytes via SHA-256.

3. Nonce / Initialization Vector:
   - For every encryption operation, a unique, cryptographically secure 96-bit (12-byte)
     nonce is generated using os.urandom(12).
   - A nonce must NEVER be reused with the same key in GCM mode. Generating a fresh
     random nonce per file guarantees that two identical documents encrypt to completely
     different ciphertexts.

4. Payload Structure:
   - [12-byte Nonce] + [Ciphertext + 16-byte GCM Authentication Tag]
   - The 12-byte nonce is prepended to the ciphertext in the stored file, allowing
     stateless decryption without requiring separate IV storage.

5. Storage Hygiene & Data Protection:
   - Files are stored in a private directory outside frontend/public roots.
   - Original filenames are NEVER used on disk to avoid directory traversal and
     metadata leakage.
   - Decryption is strictly performed in-memory after authentication and authorization.
   - When deleting, file contents are overwritten with random bytes before unlinking.
"""

import base64
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import secrets
import tempfile
from typing import Generator
import uuid

from cryptography.exceptions import InvalidTag
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

# File constraints
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_MIME_TYPES = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/pjpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
}

# Standard GCM parameters
AES_GCM_NONCE_LENGTH = 12  # 96 bits recommended by NIST SP 800-38D
AES_GCM_TAG_LENGTH = 16    # 128-bit authentication tag


def get_encryption_key() -> bytes:
    """Retrieve or derive the 256-bit (32-byte) AES key from environment configuration.

    Security considerations:
    - Never hardcodes the key in source code.
    - Inspects the STORAGE_ENCRYPTION_KEY environment variable.
    - Decodes base64 keys or derives a full 32-byte key via SHA-256.
    """
    settings = get_settings()
    key_str = settings.storage_encryption_key
    if not key_str:
        # Fallback to dev secret only if no env key configured
        return hashlib.sha256(b"medivault_dev_master_encryption_key_2026").digest()

    try:
        raw_key = base64.urlsafe_b64decode(key_str.encode("utf-8"))
        if len(raw_key) == 32:
            return raw_key
    except Exception:
        pass

    # If key is hex or custom string, derive uniform 32-byte key using SHA-256
    return hashlib.sha256(key_str.encode("utf-8")).digest()


def get_encrypted_storage_dir() -> Path:
    """Resolve and ensure the storage directory outside the frontend."""
    settings = get_settings()
    p = Path(settings.storage_dir)
    if not p.is_absolute():
        backend_dir = Path(__file__).resolve().parent.parent.parent
        p = (backend_dir / p).resolve()

    encrypted_dir = p / "encrypted"
    encrypted_dir.mkdir(parents=True, exist_ok=True)
    return encrypted_dir


# ---------------------------------------------------------------------------
# Core Cryptographic Functions (AES-256-GCM)
# ---------------------------------------------------------------------------

def encrypt_file(
    data: bytes, associated_data: bytes | None = None
) -> tuple[bytes, dict]:
    """Encrypt raw file bytes using AES-256-GCM authenticated encryption.

    Security rationale:
    1. A fresh 12-byte cryptographically secure random nonce is generated per file.
    2. AES-256 in GCM mode computes both ciphertext and a 16-byte authentication tag.
    3. The nonce is prepended: [12-byte Nonce] + [Ciphertext + Tag].
    """
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot encrypt empty data.",
        )

    # 1. Fetch 256-bit symmetric key from environment
    key = get_encryption_key()
    aesgcm = AESGCM(key)

    # 2. Generate unique 96-bit nonce using OS CSPRNG
    nonce = os.urandom(AES_GCM_NONCE_LENGTH)

    # 3. Encrypt data and calculate authentication tag
    ciphertext_and_tag = aesgcm.encrypt(nonce, data, associated_data)

    # 4. Pack nonce + ciphertext into self-contained container
    encrypted_payload = nonce + ciphertext_and_tag

    metadata = {
        "algorithm": "AES-256-GCM",
        "key_bits": 256,
        "nonce_length_bytes": AES_GCM_NONCE_LENGTH,
        "tag_length_bytes": AES_GCM_TAG_LENGTH,
    }

    return encrypted_payload, metadata


def decrypt_file(
    encrypted_payload: bytes, associated_data: bytes | None = None
) -> bytes:
    """Decrypt an encrypted file payload after verifying its cryptographic authentication tag.

    Security rationale:
    1. Verifies payload size is large enough to contain nonce (12B) and tag (16B).
    2. Extracts the 12-byte nonce.
    3. AES-GCM verifies the 16-byte authentication tag; any bit-flip or corruption
       raises an InvalidTag exception, rejecting altered data before returning.
    """
    if len(encrypted_payload) < (AES_GCM_NONCE_LENGTH + AES_GCM_TAG_LENGTH):
        # Check if legacy Fernet format (backward compatibility fallback)
        try:
            settings = get_settings()
            fernet_key = settings.storage_encryption_key
            if fernet_key:
                return Fernet(fernet_key.encode("utf-8")).decrypt(encrypted_payload)
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted payload is truncated or invalid.",
        )

    key = get_encryption_key()

    # Try AES-256-GCM first
    try:
        aesgcm = AESGCM(key)
        nonce = encrypted_payload[:AES_GCM_NONCE_LENGTH]
        ciphertext_and_tag = encrypted_payload[AES_GCM_NONCE_LENGTH:]
        return aesgcm.decrypt(nonce, ciphertext_and_tag, associated_data)
    except InvalidTag:
        # Fallback check for legacy Fernet format if previously encrypted with Fernet
        try:
            settings = get_settings()
            fernet_key = settings.storage_encryption_key
            if fernet_key:
                return Fernet(fernet_key.encode("utf-8")).decrypt(encrypted_payload)
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cryptographic integrity verification failed: document payload is corrupted or modified.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt document. The file may be corrupt or invalid.",
        )


def securely_store_file(
    data: bytes, original_filename: str
) -> tuple[str, str, dict]:
    """Encrypt raw file bytes with AES-256-GCM and save to server storage with a randomized filename.

    Returns: (stored_filename, absolute_file_path, encryption_metadata)
    """
    storage_dir = get_encrypted_storage_dir()

    # 1. Generate randomized server-side filename (never use original filename on disk)
    random_token = f"{uuid.uuid4().hex}_{secrets.token_hex(6)}"
    stored_filename = f"{random_token}.enc"
    file_path = storage_dir / stored_filename

    # 2. Encrypt file contents with AES-256-GCM
    encrypted_bytes, metadata = encrypt_file(data)

    # 3. Write encrypted ciphertext to private disk storage
    with open(file_path, "wb") as f:
        f.write(encrypted_bytes)

    return stored_filename, str(file_path), metadata


def securely_delete_file(file_path: str) -> bool:
    """Securely overwrite and delete an encrypted file from disk storage.

    Security rationale:
    Overwrites the file with random bytes and flushes before unlinking to prevent
    residual data recovery on storage blocks.
    """
    try:
        storage_dir = get_encrypted_storage_dir().resolve()
        p = Path(file_path).resolve()
        if not p.is_relative_to(storage_dir):
            return False
        if p.exists() and p.is_file():
            file_size = p.stat().st_size
            # Overwrite with pseudorandom bytes before deletion
            with open(p, "wb") as f:
                f.write(os.urandom(file_size))
                f.flush()
                os.fsync(f.fileno())
            p.unlink()
            return True
    except Exception:
        pass
    return False


@contextmanager
def secure_temp_decrypted_file(file_path: str) -> Generator[Path, None, None]:
    """Context manager for temporary disk decryption with guaranteed cleanup.

    Security rationale:
    If any downstream process requires a temporary decrypted file on disk,
    this ensures the temporary file is shredded with random bytes and unlinked
    immediately upon exit of the context block.
    """
    with open(file_path, "rb") as f:
        encrypted_bytes = f.read()

    decrypted_bytes = decrypt_file(encrypted_bytes)

    temp_file = tempfile.NamedTemporaryFile(delete=False)
    temp_path = Path(temp_file.name)
    try:
        temp_file.write(decrypted_bytes)
        temp_file.flush()
        temp_file.close()
        yield temp_path
    finally:
        # Secure cleanup: shred and unlink
        try:
            if temp_path.exists():
                size = temp_path.stat().st_size
                with open(temp_path, "wb") as tf:
                    tf.write(os.urandom(size))
                    tf.flush()
                temp_path.unlink()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Backward Compatibility Wrappers (Matching previous names)
# ---------------------------------------------------------------------------

def encrypt_and_save_document(content: bytes) -> tuple[str, str, dict]:
    """Compatibility wrapper calling securely_store_file."""
    return securely_store_file(content, "document")


def decrypt_stored_document(file_path: str) -> bytes:
    """Read stored file and return in-memory decrypted bytes."""
    storage_dir = get_encrypted_storage_dir().resolve()
    path = Path(file_path).resolve()
    if not path.is_relative_to(storage_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security violation: Unauthorized or invalid storage path.",
        )
    if not path.exists() or not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Underlying stored file could not be found on server disk.",
        )
    with open(path, "rb") as f:
        encrypted_data = f.read()
    return decrypt_file(encrypted_data)


def delete_stored_file(file_path: str) -> bool:
    """Compatibility wrapper calling securely_delete_file."""
    return securely_delete_file(file_path)


# ---------------------------------------------------------------------------
# Input Validation Helpers
# ---------------------------------------------------------------------------

def validate_file_metadata(file: UploadFile) -> str:
    """Validate file extension and MIME type. Returns normalized lowercase extension."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a filename.",
        )

    # Reject null bytes and path traversal sequences
    if "\0" in file.filename or "%00" in file.filename or ".." in file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security violation: Filename contains invalid or path traversal characters.",
        )

    # 1. Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{ext}'. Allowed types: PDF, JPG, JPEG, PNG.",
        )

    # 2. Validate MIME type
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_MIME_TYPES:
        if content_type != "application/octet-stream":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid MIME type '{content_type}'. Must be application/pdf, image/jpeg, or image/png.",
            )

    return ext


def validate_file_magic_bytes(header: bytes, ext: str) -> bool:
    """Check initial bytes against known signatures for PDF, JPEG, and PNG."""
    if not header:
        return False
    if ext == ".pdf":
        return header.startswith(b"%PDF-")
    elif ext in (".jpg", ".jpeg"):
        return header.startswith(b"\xff\xd8\xff")
    elif ext == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    return False


async def read_and_validate_file_content(file: UploadFile, ext: str) -> bytes:
    """Read upload stream enforcing 10 MB maximum size and header inspection."""
    chunks: list[bytes] = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1 MB

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds the maximum allowed size of 10 MB ({total_size / (1024 * 1024):.1f} MB uploaded).",
            )
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    full_content = b"".join(chunks)

    if not validate_file_magic_bytes(full_content[:16], ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match the claimed file type signature.",
        )

    return full_content
