from rest_framework import serializers

from .models import HealthTag, Package, PackageItem, Service, SizeBand, Specialty, SizeClass


class SpecialtySerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialty
        fields = ['id', 'code', 'name_vi', 'species_scope', 'description']


class HealthTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthTag
        fields = ['id', 'code', 'name_vi', 'kind']


class SizeBandSerializer(serializers.ModelSerializer):
    class Meta:
        model = SizeBand
        fields = ['id', 'species', 'size_class', 'min_kg', 'max_kg']


class PriceMapField(serializers.Field):
    """Đọc: {"S": 120000, ...}. Ghi qua endpoint /prices riêng."""

    def to_representation(self, qs):
        return {p.size_class: int(p.price) for p in qs.all()}

    def to_internal_value(self, data):
        raise serializers.ValidationError('Dùng endpoint /prices để ghi giá.')


class ServiceSerializer(serializers.ModelSerializer):
    prices = PriceMapField(read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'code', 'name', 'description', 'category', 'duration_minutes', 'species_scope',
            'resource_type', 'required_specialty', 'supplies_note', 'is_active', 'prices',
        ]


class PackageItemSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    duration_minutes = serializers.IntegerField(source='service.duration_minutes', read_only=True)

    class Meta:
        model = PackageItem
        fields = ['service', 'service_name', 'duration_minutes', 'position']


class PackageSerializer(serializers.ModelSerializer):
    prices = PriceMapField(read_only=True)
    items = PackageItemSerializer(many=True, read_only=True)

    class Meta:
        model = Package
        fields = [
            'id', 'code', 'name', 'description', 'species_scope', 'coat_types',
            'min_age_months', 'is_active', 'items', 'prices',
        ]


class PricesInputSerializer(serializers.Serializer):
    """Body PUT .../prices: {"prices": {"XS": 100000, "S": 120000}}"""

    prices = serializers.DictField(child=serializers.IntegerField(min_value=0))

    def validate_prices(self, value):
        bad = [k for k in value if k not in SizeClass.values]
        if bad:
            raise serializers.ValidationError(f'Size không hợp lệ: {", ".join(bad)}.')
        return value


class ItemsInputSerializer(serializers.Serializer):
    """Body PUT .../items: {"services": [3, 1, 5]} theo thứ tự."""

    services = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)

    def validate_services(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError('Dịch vụ trong gói không được lặp.')
        found = set(Service.objects.filter(id__in=value).values_list('id', flat=True))
        missing = [v for v in value if v not in found]
        if missing:
            raise serializers.ValidationError(f'Không tìm thấy dịch vụ: {missing}.')
        return value
