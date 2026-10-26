from django.urls import path

from . import views

urlpatterns = [
    path('register', views.RegisterView.as_view()),
    path('login', views.LoginView.as_view()),
    path('logout', views.LogoutView.as_view()),
    path('me', views.MeView.as_view()),
    path('change-password', views.ChangePasswordView.as_view()),
    path('users/<int:pk>/reset-password', views.AdminResetPasswordView.as_view()),
    path('forgot-password/request-otp', views.RequestResetOTPView.as_view()),
    path('forgot-password/verify-otp', views.VerifyResetOTPView.as_view()),
    path('forgot-password/reset', views.ResetPasswordWithOTPView.as_view()),
]

