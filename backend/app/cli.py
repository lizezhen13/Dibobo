import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.models import User
from app.core.security import PasswordPolicyError, hash_password


async def create_user(username: str) -> int:
    normalized_username = username.strip()
    if not normalized_username or len(normalized_username) > 50:
        print("用户名必须为 1～50 个字符", file=sys.stderr)
        return 2

    password = (
        getpass.getpass("初始密码: ")
        if sys.stdin.isatty()
        else sys.stdin.read().rstrip("\r\n")
    )
    try:
        password_hash = hash_password(password)
    except PasswordPolicyError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.username == normalized_username))
        if existing is not None:
            print("用户名已存在", file=sys.stderr)
            return 1
        user = User(username=normalized_username, password_hash=password_hash)
        db.add(user)
        await db.commit()

    print(f"用户 {normalized_username} 创建成功")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Dibobo deployment commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_parser = subparsers.add_parser("create-user", help="Create a regular user")
    create_parser.add_argument("--username", required=True)
    args = parser.parse_args()

    if args.command == "create-user":
        return asyncio.run(create_user(args.username))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
