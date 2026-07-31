import hashlib
import hmac
import re
import secrets
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

_password_hasher = PasswordHasher()
_dummy_password_hash = _password_hasher.hash("Dibobo-invalid-password")


class PasswordPolicyError(ValueError):
    pass


def validate_password_policy(password: str) -> None:
    if len(password) < 8:
        raise PasswordPolicyError("密码至少需要 8 位")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise PasswordPolicyError("密码必须同时包含字母和数字")


def hash_password(password: str) -> str:
    validate_password_policy(password)
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    candidate_hash = password_hash or _dummy_password_hash
    try:
        verified = _password_hasher.verify(candidate_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return bool(verified and password_hash is not None)


def sign_session_id(session_id: uuid.UUID, secret: str) -> str:
    signature = hmac.new(secret.encode(), session_id.bytes, hashlib.sha256).hexdigest()
    return f"{session_id}.{signature}"


def verify_session_cookie(value: str | None, secret: str) -> uuid.UUID | None:
    if not value:
        return None
    try:
        raw_id, signature = value.split(".", maxsplit=1)
        session_id = uuid.UUID(raw_id)
    except (ValueError, AttributeError):
        return None

    expected = hmac.new(secret.encode(), session_id.bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    return session_id


def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class ApiKeyCipher:
    def __init__(self, encryption_key: str) -> None:
        try:
            self._fernet = Fernet(encryption_key.encode())
        except ValueError as exc:
            raise ValueError("DIBOBO_API_KEY_ENCRYPTION_KEY must be a valid Fernet key") from exc

    def encrypt(self, api_key: str) -> str:
        return self._fernet.encrypt(api_key.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise ValueError("Stored API key cannot be decrypted with the configured key") from exc
