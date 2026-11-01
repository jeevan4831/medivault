from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, AuditResult, NotificationType
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserRegisterRequest, UserResponse
from app.security.jwt import create_access_token
from app.security.passwords import hash_password, verify_password
from app.services.notification_service import create_notification


class AuthService:
    @staticmethod
    def register_user(db: Session, data: UserRegisterRequest) -> User:
        """Register a new user after verifying email uniqueness and hashing password."""
        # 1. Prevent duplicate email registration
        existing_user = db.scalar(select(User).where(User.email == data.email))
        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email is already registered.",
            )

        # 2. Hash password securely (bcrypt)
        hashed_password = hash_password(data.password)

        # 3. Create user entity
        new_user = User(
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            password_hash=hashed_password,
            is_active=True,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user

    @staticmethod
    def authenticate_user(
        db: Session,
        data: LoginRequest,
        client_ip: str | None = None,
        user_agent: str | None = None,
    ) -> TokenResponse:
        """Authenticate user credentials and generate a JWT access token."""
        user = db.scalar(select(User).where(User.email == data.email))
        if user is None or not verify_password(data.password, user.password_hash):
            # Record failed login attempt in immutable audit log
            audit = AuditLog(
                user_id=user.id if user else None,
                action=AuditAction.LOGIN_FAILED,
                result=AuditResult.FAILURE,
                ip_address=client_ip,
                user_agent=user_agent,
            )
            db.add(audit)

            # Security notification for failed login if account exists
            if user:
                create_notification(
                    db=db,
                    user_id=user.id,
                    title="Security Alert: Failed Login Attempt",
                    message=f"A failed login attempt was detected from IP: {client_ip or 'Unknown IP'}.",
                    notification_type=NotificationType.SECURITY,
                )

            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            audit = AuditLog(
                user_id=user.id,
                action=AuditAction.LOGIN_FAILED,
                result=AuditResult.FAILURE,
                ip_address=client_ip,
                user_agent=user_agent,
            )
            db.add(audit)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated. Please contact support.",
            )

        # Record successful login audit log
        audit = AuditLog(
            user_id=user.id,
            action=AuditAction.LOGIN,
            result=AuditResult.SUCCESS,
            ip_address=client_ip,
            user_agent=user_agent,
        )
        db.add(audit)

        # Security notification for login session
        create_notification(
            db=db,
            user_id=user.id,
            title="Security Alert: Successful Login",
            message=f"Signed in successfully from IP: {client_ip or 'Local Session'}.",
            notification_type=NotificationType.SECURITY,
        )

        db.commit()

        token = create_access_token(
            subject=user.id,
            extra_claims={"email": user.email, "name": user.full_name},
        )

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user),
        )
