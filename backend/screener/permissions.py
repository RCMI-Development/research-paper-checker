from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated


class ConfiguredAuthenticationPermission:
    def get_permissions(self):
        permission = IsAuthenticated if settings.REQUIRE_AUTH else AllowAny
        return [permission()]

