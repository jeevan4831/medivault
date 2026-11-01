import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def validate_password_strength_rule(password: str) -> str:
    """Validate password against complexity rules."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(password) > 72:
        raise ValueError("Password cannot exceed 72 characters.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_=+[\]\\/`~]", password):
        raise ValueError(
            "Password must contain at least one special character (e.g. !@#$%^&*)."
        )
    return password


class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120, description="User's full name")
    email: EmailStr = Field(..., description="Valid unique email address")
    phone: str | None = Field(default=None, max_length=20, description="Optional phone number")
    password: str = Field(..., description="Strong user password")
    confirm_password: str = Field(..., description="Password confirmation")

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return trimmed

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        # Allow numbers, optional leading +, hyphens, dots, spaces, parens
        if not re.match(r"^\+?[0-9\s\-().]{7,20}$", trimmed):
            raise ValueError("Please provide a valid phone number (7-20 digits).")
        return trimmed

    @field_validator("password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        return validate_password_strength_rule(v)

    @model_validator(mode="after")
    def passwords_match(self) -> "UserRegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., min_length=1, description="Password")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
