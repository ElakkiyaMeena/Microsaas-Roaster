"""Management CLI. Usage: ``python -m app.cli make-admin <email>``."""

from __future__ import annotations

import argparse
import logging
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models.user import User

logger = logging.getLogger("app.cli")


def make_admin(email: str) -> bool:
    """
    Grant admin rights to the user with ``email``.

    Returns:
        True if the user was found (and is now admin), False otherwise.
    """
    normalized = email.strip().lower()
    with SessionLocal() as db:
        user = db.scalars(select(User).where(User.email == normalized)).first()
        if user is None:
            logger.error("No user found with email %s", normalized)
            return False
        user.is_admin = True
        db.commit()
        logger.info("User %s is now an admin", normalized)
        return True


def main(argv: list[str] | None = None) -> int:
    """CLI entry point; returns the process exit code."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p_admin = sub.add_parser("make-admin", help="Grant admin rights to a user by email")
    p_admin.add_argument("email")
    args = parser.parse_args(argv)

    if args.command == "make-admin":
        return 0 if make_admin(args.email) else 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
