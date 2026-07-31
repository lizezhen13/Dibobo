import uuid

import pytest

from app.core.security import (
    ApiKeyCipher,
    PasswordPolicyError,
    hash_password,
    sign_session_id,
    validate_password_policy,
    verify_password,
    verify_session_cookie,
)


@pytest.mark.parametrize("password", ["short1", "abcdefgh", "12345678"])
def test_password_policy_rejects_invalid_passwords(password: str) -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password_policy(password)


def test_password_hash_round_trip() -> None:
    password_hash = hash_password("Dibobo2026")
    assert verify_password("Dibobo2026", password_hash)
    assert not verify_password("Wrong2026", password_hash)


def test_signed_session_cookie_rejects_tampering() -> None:
    session_id = uuid.uuid4()
    secret = "a-secure-session-secret-with-more-than-32-characters"
    signed = sign_session_id(session_id, secret)

    assert verify_session_cookie(signed, secret) == session_id
    assert verify_session_cookie(f"{signed[:-1]}0", secret) is None


def test_api_key_cipher_round_trip() -> None:
    cipher = ApiKeyCipher("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    encrypted = cipher.encrypt("fuyao-secret-key")

    assert encrypted != "fuyao-secret-key"
    assert cipher.decrypt(encrypted) == "fuyao-secret-key"

