from django.urls import path

from .views import (
    CaseDetailView,
    CaseListCreateView,
    CaseNumberView,
    EvaluateStreamView,
    EvaluateView,
    ExtractView,
    HealthView,
)


urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("case-number", CaseNumberView.as_view(), name="case-number"),
    path("extract", ExtractView.as_view(), name="extract"),
    path("evaluate", EvaluateView.as_view(), name="evaluate"),
    path("evaluate/stream", EvaluateStreamView.as_view(), name="evaluate-stream"),
    path("cases", CaseListCreateView.as_view(), name="case-list-create"),
    path("cases/<str:case_no>", CaseDetailView.as_view(), name="case-detail"),
]

