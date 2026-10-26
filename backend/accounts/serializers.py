from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User


import re

from customers.models import Client


class UserSerializer(serializers.ModelSerializer):
    allow_reminders = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'phone', 'email', 'role', 'allow_reminders', 'date_joined', 'last_login']
        read_only_fields = ['id', 'username', 'role', 'date_joined', 'last_login']

    def get_phone(self, obj):
        if obj.phone:
            return obj.phone
        client = getattr(obj, 'client', None)
        return client.phone if client else ''

    def get_full_name(self, obj):
        if obj.full_name:
            return obj.full_name
        client = getattr(obj, 'client', None)
        return client.full_name if client else ''

    def get_allow_reminders(self, obj):
        client = getattr(obj, 'client', None)
        return client.allow_reminders if client else None


class MeUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    allow_reminders = serializers.BooleanField(required=False)

    def validate_full_name(self, value):
        if value is not None:
            trimmed = value.strip()
            if not trimmed:
                raise serializers.ValidationError('Họ và tên không được để trống.')
            return trimmed
        return value

    def validate_phone(self, value):
        if not value:
            return ''
        cleaned = normalize_phone_number(value)
        if not re.match(r'^[0-9+]{4,15}$', cleaned):
            raise serializers.ValidationError('Số điện thoại không hợp lệ.')
        req = self.context.get('request')
        user = req.user if req else None
        if user:
            if User.objects.filter(phone=cleaned).exclude(pk=user.pk).exists():
                raise serializers.ValidationError('Số điện thoại này đã được sử dụng bởi tài khoản khác.')
            client = getattr(user, 'client', None)
            client_qs = Client.objects.filter(phone=cleaned, is_active=True)
            if client:
                client_qs = client_qs.exclude(pk=client.pk)
            if client_qs.exists():
                raise serializers.ValidationError('Số điện thoại này đã gắn với một hồ sơ khách hàng khác.')
        return cleaned

    def validate_email(self, value):
        if not value:
            return ''
        email = value.strip().lower()
        req = self.context.get('request')
        user = req.user if req else None
        if user and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Email này đã được sử dụng bởi tài khoản khác.')
        return email


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Tên đăng nhập đã được sử dụng.')
        return value

    def validate_phone(self, value):
        cleaned = re.sub(r'[\s.-]', '', str(value).strip())
        if cleaned.startswith('+84'):
            cleaned = '0' + cleaned[3:]
        if not re.match(r'^[0-9+]{4,15}$', cleaned):
            raise serializers.ValidationError('Số điện thoại không hợp lệ.')
        if User.objects.filter(phone=cleaned).exists():
            raise serializers.ValidationError('Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập.')
        existing_client = Client.objects.filter(phone=cleaned, is_active=True).first()
        if existing_client and existing_client.user_id:
            raise serializers.ValidationError('Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập.')
        return cleaned

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(error_messages={'required': 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại.', 'blank': 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại.'})
    password = serializers.CharField(error_messages={'required': 'Vui lòng nhập Mật khẩu.', 'blank': 'Vui lòng nhập Mật khẩu.'})

    def validate(self, attrs):
        identifier = attrs.get('username', '').strip()
        password = attrs.get('password', '')

        if not identifier:
            raise serializers.ValidationError({'username': 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại.'})
        if not password:
            raise serializers.ValidationError({'password': 'Vui lòng nhập Mật khẩu.'})

        # 1. Tìm theo username
        target_user = User.objects.filter(username__iexact=identifier).first()

        # 2. Nếu không tìm thấy, chuẩn hóa và tìm theo số điện thoại
        if not target_user:
            clean_phone = re.sub(r'[\s.-]', '', identifier)
            if clean_phone.startswith('+84'):
                clean_phone = '0' + clean_phone[3:]
            target_user = User.objects.filter(phone=clean_phone).first()
            if not target_user:
                client = Client.objects.filter(
                    phone=clean_phone, user__isnull=False
                ).select_related('user').first()
                if client:
                    target_user = client.user

        # 3. Nếu không tìm thấy và có @, tìm theo email
        if not target_user and '@' in identifier:
            target_user = User.objects.filter(email__iexact=identifier).first()

        # Trường hợp 1: Không tìm thấy tài khoản trong hệ thống
        if not target_user:
            raise serializers.ValidationError(
                'Tài khoản hoặc Số điện thoại này không tồn tại trong hệ thống. Vui lòng kiểm tra lại hoặc Đăng ký tài khoản mới.'
            )

        # Trường hợp 2: Tài khoản bị khóa (is_active = False trên User hoặc StaffProfile hoặc Client)
        is_locked = not target_user.is_active
        if hasattr(target_user, 'staff_profile') and not target_user.staff_profile.is_active:
            is_locked = True
        if hasattr(target_user, 'client') and not target_user.client.is_active:
            is_locked = True

        if is_locked:
            raise serializers.ValidationError(
                'Tài khoản này hiện đang bị khóa hoặc tạm ngưng hoạt động. Vui lòng liên hệ Quản lý spa để được hỗ trợ mở khóa.'
            )

        # Trường hợp 3: Sai mật khẩu hoặc mật khẩu đã bị thay đổi
        if not target_user.check_password(password):
            raise serializers.ValidationError(
                'Mật khẩu không chính xác. Nếu tài khoản đã được quản lý đổi mật khẩu hoặc bạn đã thay đổi gần đây, vui lòng nhập mật khẩu mới nhất hoặc chọn "Quên mật khẩu?".'
            )

        # Đăng nhập qua authenticate để sinh phiên / kiểm tra backend auth
        user = authenticate(username=target_user.username, password=password)
        if not user or not user.is_active:
            raise serializers.ValidationError(
                'Tài khoản này hiện đang bị khóa hoặc không thể đăng nhập. Vui lòng liên hệ Quản lý spa.'
            )

        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField()
    confirm_password = serializers.CharField(required=False)

    def validate_new_password(self, value):
        user = self.context['request'].user
        try:
            validate_password(value, user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Mật khẩu hiện tại không đúng.')
        return value

    def validate(self, attrs):
        old_password = attrs.get('old_password')
        new_password = attrs.get('new_password')
        confirm_password = attrs.get('confirm_password')

        if old_password and new_password and old_password == new_password:
            raise serializers.ValidationError({
                'new_password': 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
            })

        if confirm_password is not None and new_password != confirm_password:
            raise serializers.ValidationError({
                'confirm_password': 'Mật khẩu xác nhận không khớp với mật khẩu mới.'
            })
        return attrs


def normalize_phone_number(raw_phone):
    cleaned = re.sub(r'[\s.-]', '', str(raw_phone).strip())
    if cleaned.startswith('+84'):
        cleaned = '0' + cleaned[3:]
    return cleaned


def find_user_by_phone(raw_phone):
    cleaned = normalize_phone_number(raw_phone)
    user = User.objects.filter(phone=cleaned, is_active=True).first()
    if not user:
        client = Client.objects.filter(phone=cleaned, is_active=True, user__isnull=False).select_related('user').first()
        if client:
            user = client.user
    return user, cleaned


class RequestResetOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        user, cleaned = find_user_by_phone(value)
        if not user:
            raise serializers.ValidationError('Số điện thoại này chưa được đăng ký tài khoản trong hệ thống.')
        self.context['target_user'] = user
        self.context['cleaned_phone'] = cleaned
        return cleaned


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    otp_code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        from .models import PasswordResetOTP

        phone = normalize_phone_number(attrs['phone'])
        otp_code = attrs['otp_code'].strip()

        otp_record = (
            PasswordResetOTP.objects.filter(phone=phone, otp_code=otp_code, is_used=False)
            .order_by('-created_at')
            .first()
        )
        if not otp_record:
            raise serializers.ValidationError({'otp_code': 'Mã OTP không chính xác.'})
        if otp_record.is_expired:
            raise serializers.ValidationError({'otp_code': 'Mã OTP đã hết hạn (chỉ có hiệu lực trong 5 phút).'})

        attrs['otp_record'] = otp_record
        attrs['phone'] = phone
        return attrs


class ResetPasswordWithOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    otp_code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        from .models import PasswordResetOTP

        phone = normalize_phone_number(attrs['phone'])
        otp_code = attrs['otp_code'].strip()
        new_password = attrs['new_password']
        confirm_password = attrs['confirm_password']

        if new_password != confirm_password:
            raise serializers.ValidationError({'confirm_password': 'Mật khẩu xác nhận không khớp.'})

        try:
            validate_password(new_password)
        except DjangoValidationError as e:
            raise serializers.ValidationError({'new_password': list(e.messages)})

        otp_record = (
            PasswordResetOTP.objects.filter(phone=phone, otp_code=otp_code, is_used=False)
            .order_by('-created_at')
            .first()
        )
        if not otp_record:
            raise serializers.ValidationError({'otp_code': 'Mã OTP không hợp lệ hoặc đã được sử dụng.'})
        if otp_record.is_expired:
            raise serializers.ValidationError({'otp_code': 'Mã OTP đã hết hạn.'})

        user, _ = find_user_by_phone(phone)
        if not user:
            raise serializers.ValidationError({'phone': 'Không tìm thấy tài khoản người dùng tương ứng.'})

        attrs['user'] = user
        attrs['otp_record'] = otp_record
        return attrs

