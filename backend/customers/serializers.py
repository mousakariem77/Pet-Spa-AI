from datetime import date

from rest_framework import serializers

from accounts.models import Role
from catalog.models import HealthTag

from .models import Client, Pet, PetVaccination


class PetBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pet
        fields = ['id', 'name', 'species', 'breed', 'weight_kg', 'size_class', 'coat_type', 'allergy_note']


class ClientSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    pet_count = serializers.IntegerField(source='pets.count', read_only=True)
    pets = serializers.SerializerMethodField()
    completed_bookings_count = serializers.SerializerMethodField()
    total_spent = serializers.SerializerMethodField()
    last_booking_date = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'user_id', 'full_name', 'phone', 'secondary_phone', 'birthday',
            'email', 'address', 'note', 'source', 'allow_reminders', 'is_active',
            'pet_count', 'pets', 'completed_bookings_count', 'total_spent', 'last_booking_date',
            'created_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at']

    def get_pets(self, client):
        active_pets = client.pets.filter(is_active=True)
        return PetBriefSerializer(active_pets, many=True).data

    def get_completed_bookings_count(self, client):
        if hasattr(client, 'completed_bookings'):
            return client.completed_bookings
        return client.bookings.filter(status='completed').count()

    def get_total_spent(self, client):
        if hasattr(client, 'total_spent'):
            return int(client.total_spent or 0)
        from django.db.models import Sum
        val = client.bookings.filter(invoice__status='paid').aggregate(t=Sum('invoice__total'))['t']
        return int(val or 0)

    def get_last_booking_date(self, client):
        if hasattr(client, 'last_booking_date'):
            return client.last_booking_date
        last_b = client.bookings.filter(status='completed').order_by('-start_at').first()
        return last_b.start_at if last_b else None

    def validate_phone(self, value):
        from accounts.serializers import normalize_phone_number
        cleaned = normalize_phone_number(value)
        qs = Client.objects.filter(phone=cleaned, is_active=True)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Số điện thoại đã có trong hồ sơ khách.')
        return cleaned

    def validate_secondary_phone(self, value):
        if not value:
            return ''
        from accounts.serializers import normalize_phone_number
        return normalize_phone_number(value)


class ClientSelfSerializer(serializers.ModelSerializer):
    """Khách xem/sửa hồ sơ của chính mình: không thấy ghi chú nội bộ."""

    class Meta:
        model = Client
        fields = ['id', 'full_name', 'phone', 'secondary_phone', 'birthday', 'email', 'address', 'allow_reminders']
        read_only_fields = ['id']


class VaccinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PetVaccination
        fields = ['id', 'vaccine_name', 'date_given', 'valid_until', 'note']

    def validate(self, attrs):
        given = attrs.get('date_given')
        until = attrs.get('valid_until')
        if given and given > date.today():
            raise serializers.ValidationError({'date_given': 'Ngày tiêm không được ở tương lai.'})
        if given and until and until < given:
            raise serializers.ValidationError({'valid_until': 'Hạn hiệu lực phải sau ngày tiêm.'})
        return attrs


TECH_EDITABLE = {'safety_note', 'health_tags', 'allergy_note'}


class PetSerializer(serializers.ModelSerializer):
    health_tags = serializers.PrimaryKeyRelatedField(
        queryset=HealthTag.objects.all(), many=True, required=False)
    vaccinations = VaccinationSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    age_months = serializers.IntegerField(read_only=True)

    class Meta:
        model = Pet
        fields = [
            'id', 'client', 'client_name', 'name', 'species', 'breed', 'coat_type', 'sex',
            'birth_date', 'age_months', 'weight_kg', 'size_class', 'health_tags',
            'allergy_note', 'safety_note', 'is_active', 'vaccinations',
        ]
        read_only_fields = ['id', 'size_class']
        extra_kwargs = {
            'client': {'required': False},
        }

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            if user.role == Role.CUSTOMER:
                fields['safety_note'].read_only = True  # ghi chú nội bộ: khách không sửa
            if user.role == Role.TECHNICIAN and self.instance is not None:
                for name, f in fields.items():
                    if name not in TECH_EDITABLE:
                        f.read_only = True
        return fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and request.user.is_authenticated and request.user.role == Role.CUSTOMER:
            data.pop('safety_note', None)
        return data

    def validate_allergy_note(self, value):
        if not value.strip():
            raise serializers.ValidationError('Bắt buộc ghi dị ứng (ghi "Không" nếu không có).')
        return value

    def validate_weight_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError('Cân nặng phải lớn hơn 0.')
        return value

    def validate_breed(self, value):
        return str(value).strip() if value else ''

    def validate_birth_date(self, value):
        if value and value > date.today():
            raise serializers.ValidationError('Ngày sinh không được ở tương lai.')
        return value
