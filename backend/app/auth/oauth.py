from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App

from app.config import Config

_oauth = OAuth()

_oauth.register(
    name="google",
    client_id=Config.GOOGLE_CLIENT_ID,
    client_secret=Config.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

google: StarletteOAuth2App = _oauth.google
