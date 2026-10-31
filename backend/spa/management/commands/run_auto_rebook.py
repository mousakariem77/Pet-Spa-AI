from django.core.management.base import BaseCommand
from ai_assistant import services


class Command(BaseCommand):
    help = 'Chạy quét tự động nhắc tái spa theo cấu hình giờ hoặc ép buộc chạy (cron/scheduler).'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Ép buộc quét ngay không kiểm tra khung giờ')

    def handle(self, *args, **options):
        force = options['force']
        res = services.check_and_run_auto_scan(force=force)
        self.stdout.write(self.style.SUCCESS(f'Ket qua quet tu dong: {res}'))
