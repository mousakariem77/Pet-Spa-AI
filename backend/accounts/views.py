from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from customers.models import Client

import random
from datetime import timedelta
from django.utils import timezone
from .models import PasswordResetOTP, Role, User
from .permissions import IsStaffRole
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    RegisterSerializer,
    RequestResetOTPSerializer,
    ResetPasswordWithOTPSerializer,
    UserSerializer,
    VerifyOTPSerializer,
)


def _auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {'token': token.key, 'user': UserSerializer(user).data}


class RegisterView(APIView):
    """POST auth/register — khách tự đăng ký (tạo User role customer + Client hoặc auto-link Client có sẵn)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @transaction.atomic
    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        phone = d['phone']
        user = User.objects.create_user(
            username=d['username'], password=d['password'], email=d.get('email', ''),
            full_name=d['full_name'], phone=phone, role=Role.CUSTOMER,
        )

        existing_client = Client.objects.filter(phone=phone, is_active=True, user__isnull=True).first()
        if existing_client:
            existing_client.user = user
            if not existing_client.email and d.get('email'):
                existing_client.email = d['email']
            existing_client.source = Client.Source.ONLINE
            existing_client.save(update_fields=['user', 'email', 'source', 'updated_at'])
            linked = True
        else:
            Client.objects.create(
                user=user, full_name=d['full_name'], phone=phone,
                email=d.get('email', ''), source=Client.Source.ONLINE,
            )
            linked = False

        payload = _auth_payload(user)
        payload['linked_existing_client'] = linked
        return Response(payload, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(_auth_payload(s.validated_data['user']))


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @transaction.atomic
    def patch(self, request):
        s = MeUpdateSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        d = dict(s.validated_data)
        allow = d.pop('allow_reminders', None)
        user = request.user
        for k, v in d.items():
            setattr(user, k, v)
        user.save()
        client = getattr(user, 'client', None)
        if client:
            for k in ('full_name', 'phone', 'email'):
                if k in d:
                    setattr(client, k, d[k])
            if allow is not None:
                client.allow_reminders = allow
            client.save()
        elif user.role == Role.CUSTOMER:
            Client.objects.create(
                user=user,
                full_name=user.full_name or user.username,
                phone=user.phone,
                email=user.email,
                source=Client.Source.ONLINE,
                allow_reminders=allow if allow is not None else True,
            )
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data['new_password'])
        request.user.save()
        Token.objects.filter(user=request.user).delete()
        return Response(_auth_payload(request.user))


class AdminResetPasswordView(APIView):
    """POST auth/users/<pk>/reset-password — Quản lý hoặc Lễ tân đặt lại mật khẩu."""

    permission_classes = [IsStaffRole]

    def post(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            raise NotFound('Không tìm thấy tài khoản người dùng.')

        # Lễ tân chỉ được reset mật khẩu cho khách hàng; Quản lý reset được cho mọi vai trò
        if request.user.role == Role.RECEPTIONIST and target_user.role != Role.CUSTOMER:
            raise PermissionDenied('Lễ tân chỉ có quyền đặt lại mật khẩu cho khách hàng.')

        new_password = request.data.get('new_password', '').strip()
        if not new_password or len(new_password) < 8:
            return Response(
                {'code': 'validation_error', 'fields': {'new_password': ['Mật khẩu mới phải có tối thiểu 8 ký tự.']}},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        target_user.set_password(new_password)
        target_user.save()
        Token.objects.filter(user=target_user).delete()
        return Response({'detail': f'Đã đặt lại mật khẩu thành công cho tài khoản {target_user.username}.'})


class RequestResetOTPView(APIView):
    """POST auth/forgot-password/request-otp — Gửi mã OTP xác thực đặt lại mật khẩu."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = RequestResetOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        target_user = s.context['target_user']
        phone = s.context['cleaned_phone']

        # Kiểm tra cooldown 60 giây
        recent_otp = (
            PasswordResetOTP.objects.filter(phone=phone)
            .order_by('-created_at')
            .first()
        )
        if recent_otp and (timezone.now() - recent_otp.created_at).total_seconds() < 60:
            remaining = 60 - int((timezone.now() - recent_otp.created_at).total_seconds())
            return Response(
                {
                    'code': 'cooldown_active',
                    'detail': f'Vui lòng chờ {remaining} giây trước khi yêu cầu gửi lại mã OTP mới.',
                    'remaining_seconds': remaining,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Tạo OTP ngẫu nhiên 6 chữ số
        otp_code = f'{random.randint(100000, 999999)}'
        expires_at = timezone.now() + timedelta(minutes=5)
        otp_obj = PasswordResetOTP.objects.create(
            phone=phone,
            otp_code=otp_code,
            user=target_user,
            expires_at=expires_at,
        )

        return Response({
            'success': True,
            'message': f'Mã xác thực OTP đã được gửi đến số điện thoại {phone}.',
            'phone': phone,
            'expires_in_seconds': 300,
            'dev_otp': otp_obj.otp_code,
        })


class VerifyResetOTPView(APIView):
    """POST auth/forgot-password/verify-otp — Kiểm tra mã OTP hợp lệ trước khi đổi mật khẩu."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = VerifyOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response({
            'success': True,
            'message': 'Mã OTP chính xác. Bạn có thể tiến hành đặt lại mật khẩu mới.',
        })


class ResetPasswordWithOTPView(APIView):
    """POST auth/forgot-password/reset — Đặt lại mật khẩu mới bằng OTP."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @transaction.atomic
    def post(self, request):
        s = ResetPasswordWithOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data['user']
        otp_record = s.validated_data['otp_record']
        new_password = s.validated_data['new_password']

        user.set_password(new_password)
        user.save()

        # Đánh dấu OTP đã sử dụng
        otp_record.is_used = True
        otp_record.save()

        # Xóa toàn bộ token cũ để buộc đăng nhập lại
        Token.objects.filter(user=user).delete()

        return Response({
            'success': True,
            'message': f'Đặt lại mật khẩu thành công cho tài khoản {user.username}. Bạn có thể đăng nhập ngay.',
            'username': user.username,
        })

