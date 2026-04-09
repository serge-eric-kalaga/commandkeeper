from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "CommandKeeper"
    environment: str = "dev"

    database_url: str = "sqlite:///./commandkeeper.db"

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    jwt_algorithm: str = "HS256"

    cors_origins: str = "http://localhost:2000,http://127.0.0.1:2000,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173"

    default_admin_username: str = "admin"
    default_admin_password: str = "admin"


settings = Settings()
