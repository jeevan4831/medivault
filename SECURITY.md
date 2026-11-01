# MediVault – Comprehensive Security Model & Security Review Report

**Classification:** Academic Prototype / Reference Architecture  
**Document Version:** 2.0.0  
**Last Security Review:** October 2026  
**Test Suite Status:** 115 Passed, 0 Failed (100% Pass Rate)

---

## 1. Executive Summary & Purpose

MediVault is a privacy-first personal document management and consent-based sharing prototype designed for highly sensitive personal records (e.g., medical records, identity cards, educational certificates, vehicle documents). 

The platform guarantees **confidentiality**, **cryptographic integrity**, **fine-grained access control**, and **complete non-repudiation** through:
- **AES-256-GCM** authenticated envelope encryption at rest.
- **Zero-trust server storage** (randomized filenames on disk, no direct URL access).
- **Consent-based temporary sharing** using high-entropy 256-bit URL-safe tokens, stored exclusively as SHA-256 one-way hashes.
- **Dual-layer expiration and instant revocation** verified independently on every single request.
- **Append-only immutable audit trail** and security notification system.

---

## 2. Core Security Invariants

### Invariant 1: Strict User Isolation (User A vs. User B)
User A must **never** be able to read, modify, delete, share, or audit User B's documents. This boundary is enforced server-side on every request regardless of:
- **Document ID:** URL parameter `/api/documents/{id}` verifies `doc.owner_id == current_user.id`.
- **Permission ID:** URL parameter `/api/shares/{id}/revoke` verifies `perm.owner_id == current_user.id`.
- **Notification ID:** URL parameter `/api/notifications/{id}/read` verifies `notif.user_id == current_user.id`.
- **Audit History:** `/api/audit/my-history` and `/api/dashboard/audit-logs` strictly scope records where the user is actor, document owner, or share grantor.
- **Query Parameters & Filters:** Passing `?document_id=X` into `/api/shares` strictly verifies ownership of Document X before applying the query filter.

### Invariant 2: Cryptographic Zero-Trust at Rest
- **Envelope Encryption:** Stored files are encrypted using AES-256-GCM (NIST SP 800-38D).
- **Unique Per-File Nonce:** Every encryption generates a fresh, cryptographically secure 96-bit (12-byte) initialization vector using `os.urandom(12)`.
- **Integrity Authentication:** AES-GCM generates a 128-bit authentication tag. Any tampering or bit-flipping causes an immediate `InvalidTag` exception, rejecting corrupted data before returning plaintext.
- **In-Memory Streaming:** Document viewing and download decrypt payloads strictly in-memory. Plaintext files are never written to disk during access.
- **Cryptographic File Shredding:** Upon document deletion, the encrypted disk blocks are overwritten with pseudorandom bytes and flushed before filesystem unlinking.

### Invariant 3: Token Privacy & Consent Revocation
- **Ephemeral Token Secrecy:** Share links contain a 256-bit URL-safe random token (`secrets.token_urlsafe(32)`).
- **Hashed Persistence:** The database stores **only** the standard SHA-256 hex digest (`AccessToken.token_hash`). Raw tokens are never persisted. A database compromise does not yield valid share URLs.
- **Dual-Layer Expiration:**
  1. *Per-Request Authorization:* Every access request independently evaluates `utc_now() < expires_at` and `status == ACTIVE`. If expired, access is denied with `410 Gone`.
  2. *Background Maintenance Worker:* A scheduled maintenance task asynchronously marks expired grants, revokes associated tokens, and emits audit logs.
- **Instant Revocation:** Owners can revoke active shares at any time. Revocation immediately marks `perm.status = REVOKED` and `token.revoked = True`. Subsequent requests fail immediately with `410 Gone`.

### Invariant 4: Non-Repudiation & Audit Immutability
- **Immutable Log Store:** The `audit_logs` table records every critical action (`LOGIN`, `LOGIN_FAILED`, `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`, `DOCUMENT_DELETED`, `SHARE_CREATED`, `SHARE_ACCESSED`, `SHARE_ACCESS_DENIED`, `SHARE_REVOKED`, `SHARE_EXPIRED`).
- **Tamper Resistance:** `DELETE /api/audit/{id}` and `PUT /api/audit/{id}` return `403 Forbidden`. No API endpoint allows modifying or deleting audit records.
- **Orphan Survival:** Foreign keys to documents and users specify `ON DELETE SET NULL`, ensuring the audit trail survives even if an account or document is later deleted.

---

## 3. Comprehensive Verification of 20 Security Areas

| # | Security Area | Architecture & Implemented Defense | Test Verification |
|---|---|---|---|
| **1** | **Broken Authentication** | Passwords hashed using bcrypt (12 rounds) with individual salts. Max password length capped at 72 chars to prevent bcrypt truncation vulnerabilities. Deactivated users (`is_active = False`) blocked with `403`. Generic error messages on login prevent account enumeration. | `test_missing_and_malformed_auth_token_rejected`<br>`test_deactivated_user_cannot_authenticate`<br>`test_login_failure_audited_and_generic_error` |
| **2** | **Unauthorized Document Access** | Server-side ownership verification (`doc.owner_id == current_user.id`) enforced on metadata, inline preview, download, and deletion. Document listings filter strictly by authenticated user ID. | `test_user_b_cannot_access_user_a_document_by_changing_id`<br>`test_user_b_isolated_from_user_a_documents_dashboard_and_audit` |
| **3** | **IDOR / BOLA Vulnerabilities** | All database primary keys passed in paths, request bodies, or query parameters (`document_id`, `permission_id`, `notification_id`) are validated against authenticated user ownership before processing. | `test_user_b_cannot_access_user_a_document_by_changing_id`<br>`test_user_b_cannot_create_share_for_user_a_document`<br>`test_user_b_cannot_list_shares_of_user_a_document`<br>`test_user_b_cannot_revoke_user_a_share`<br>`test_user_b_cannot_mark_user_a_notification_as_read` |
| **4** | **Path Traversal** | Filenames stripped of path components via `Path(name).name` and regex-sanitized (`[\r\n"\0]`). Storage paths strictly validated against storage directory using `Path.resolve().is_relative_to(storage_dir)`. Direct calls outside directory raise `400 Bad Request`. | `test_upload_rejects_path_traversal_in_filename`<br>`test_upload_rejects_null_byte_in_filename`<br>`test_decrypt_stored_document_blocks_path_traversal` |
| **5** | **Unsafe File Upload** | Strict whitelist restricted to `.pdf`, `.jpg`, `.jpeg`, `.png`. Executable formats (`.exe`, `.php`, `.sh`, `.html`, `.js`, etc.) and zero-byte files are rejected with `400 Bad Request`. Server generates randomized filenames on disk (`{uuid}_{token}.enc`). | `test_unsafe_executable_extensions_rejected`<br>`test_empty_file_upload_rejected` |
| **6** | **MIME-Type Bypass** | Magic bytes / header inspection inspects binary signatures (`%PDF-` for PDF, `\xff\xd8\xff` for JPEG, `\x89PNG\r\n\x1a\n` for PNG). Uploads spoofing MIME headers with invalid binary content are rejected with `400 Bad Request`. | `test_mime_type_spoofing_rejected_by_magic_bytes` |
| **7** | **SQL Injection** | SQLAlchemy 2.0 ORM parameterization used exclusively across all queries and filters (`ilike(term)` parameterized with wildcards). No raw string interpolation or unescaped concatenation. | `test_sql_injection_payloads_safely_parameterized`<br>`test_sql_injection_on_shares_and_audit_search` |
| **8** | **Cross-Site Scripting (XSS)** | HTTP security headers injected into all responses (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`). Frontend uses React JSX escaping without `dangerouslySetInnerHTML`. | `test_security_headers_present_on_responses` |
| **9** | **CSRF Where Applicable** | Stateless Bearer token architecture (`Authorization: Bearer <JWT>`). No ambient session cookies are used for authentication. CORS origin restricted by configuration (`validate_production_security` forbids wildcard `*`). | `test_missing_and_malformed_auth_token_rejected` |
| **10** | **JWT / Session Problems** | Signed with HMAC-SHA256 (`HS256`). Decoding explicitly specifies `algorithms=[jwt_algorithm]` to prevent `none` algorithm attacks and asymmetric key confusion. 30-minute token expiration enforced via `exp` claim. | `test_jwt_signed_with_wrong_key_rejected`<br>`test_jwt_none_algorithm_rejected`<br>`test_expired_jwt_token_rejected_with_401` |
| **11** | **Token Leakage** | Raw share tokens are returned once at creation time for QR code rendering and are never stored in the database. Listing shares (`GET /api/shares`) displays only preview hashes (`sha256:abc...`). | `test_raw_token_not_stored_in_database_or_list_shares` |
| **12** | **Expired-Token Access** | Shared token validation checks `utc_now() >= expires_at` on every request. Expired grants return `410 Gone`, trigger status update to `EXPIRED`, revoke token, and append audit events. | `test_expired_and_revoked_tokens_denied` |
| **13** | **Revoked-Token Access** | Manual revocation updates `perm.status = REVOKED` and `token.revoked = True`. Access attempts on revoked shares are rejected immediately with `410 Gone` and notify the document owner. | `test_expired_and_revoked_tokens_denied` |
| **14** | **Unauthorized Download** | Granular permission model differentiates `VIEW_ONLY` and `VIEW_AND_DOWNLOAD`. If `can_download` is `False`, calls to `/api/shared-access/{token}/download` return `403 Forbidden` and trigger security alerts. | `test_view_only_share_blocks_download` |
| **15** | **Direct File URL Access** | No static file serving middleware (e.g. `StaticFiles`) is mounted for the storage folder. Files are accessible solely via authenticated, authorized streaming endpoints. Direct paths return `404 Not Found`. | `test_direct_file_url_access_blocked` |
| **16** | **Excessive File Size** | Streaming chunk reader enforces a hard limit of 10 MB (`10 * 1024 * 1024` bytes). Uploads exceeding this threshold abort streaming immediately and return `413 Content Too Large`. | `test_upload_rejects_oversized_file` |
| **17** | **Missing Authorization Checks** | All protected endpoints require `Depends(get_current_user)`. Public share endpoints require valid cryptographic token hashes. Every endpoint verifies resource ownership or explicit permissions. | `test_missing_and_malformed_auth_token_rejected`<br>`test_user_b_cannot_access_user_a_document_by_changing_id` |
| **18** | **Sensitive Information Leakage in API Responses** | API responses use strict Pydantic schemas (`DocumentResponse`, `UserResponse`). Internal disk paths (`file_path`), random server filenames (`stored_filename`), cryptographic IVs/tags/keys, and password hashes are excluded. In production, `/docs` and `/redoc` are disabled. | `test_document_response_does_not_leak_internal_paths_or_keys`<br>`test_user_response_does_not_leak_password_hash` |
| **19** | **Secrets Committed to Source Code** | `.env` is excluded in root `.gitignore`. `.env.example` provides placeholders without actual credentials. Production validator requires secret keys to be explicitly configured. | `test_settings_rejects_debug_mode_and_dev_secrets_in_production` |
| **20** | **Debug Mode in Production Configuration** | `Settings.validate_production_security()` raises `ValueError` if `app_env="production"` with `DEBUG=True`, default JWT secret key, default database password (`change_me`), wildcard CORS, or empty `STORAGE_ENCRYPTION_KEY`. | `test_settings_rejects_debug_mode_and_dev_secrets_in_production` |

---

## 4. Remediations & Hardening Applied

During this security review, the following hardening improvements were implemented:
1. **Dashboard Audit Log Query Hardening (`dashboard.py`):**
   - Refactored `get_audit_logs` from fetching a list of user document IDs into a direct outer join with `or_(AuditLog.user_id == current_user.id, Document.owner_id == current_user.id)`.
   - Eliminated potential SQLAlchemy `SAWarning` on empty sequences and eliminated redundant in-memory queries.
2. **Production Database Password Validation (`config.py`):**
   - Added production security validation ensuring `db_password` is not left as `"change_me"` when running in production.
3. **Comprehensive Security Test Suite (`test_security_review.py`):**
   - Expanded tests to 30 dedicated security verification tests covering all 20 security areas, cross-user boundary assertions, failed login audits, expired JWTs, audit log immutability, and direct URL blocking.
4. **Full Test Suite Execution:**
   - Ran all 115 tests in `backend/tests/`; verified 100% pass rate.

---

## 5. Known Limitations & Production Recommendations

While MediVault enforces rigorous security controls suitable for an academic prototype, the following recommendations must be implemented prior to production deployment with real personal documents:

1. **Key Management & HSM/KMS Integration:**
   - Currently, a single master key is loaded from the environment (`STORAGE_ENCRYPTION_KEY`).
   - *Recommendation:* Integrate with an enterprise Key Management Service (e.g., AWS KMS, Google Cloud KMS, HashiCorp Vault) supporting per-user envelope encryption keys and automated key rotation.
2. **Rate Limiting & Brute-Force Throttling:**
   - Login attempts and shared access token lookups currently rely on application-level audit logging.
   - *Recommendation:* Deploy Redis-backed rate limiting (e.g. `slowapi` or API Gateway throttling) on `/api/auth/login` (e.g., 5 attempts per 15 minutes per IP/account) and `/api/shared-access/*`.
3. **Multi-Factor Authentication (MFA):**
   - Authentication relies on single-factor password + short-lived JWT.
   - *Recommendation:* Introduce TOTP-based 2FA (RFC 6238) for account login and critical operations such as document deletion or key updates.
4. **Transport Layer Security (TLS):**
   - HTTPS termination must be configured on reverse proxies (e.g., Nginx, Caddy, Cloudflare) with HSTS (`Strict-Transport-Security`) enabled.
5. **Independent Security Audit:**
   - MediVault is an academic prototype. An external third-party penetration test is recommended prior to hosting real government or health identifiers.
