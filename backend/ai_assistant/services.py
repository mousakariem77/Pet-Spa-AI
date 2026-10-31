"""Dịch vụ AI Assistant: Rule engine (R1-R7), Gợi ý KTV, Nhắc tái spa, Chatbot tri thức (05_quy_trinh.md, 07_kien_truc.md).

RÀNG BUỘC CỐT LÕI: Module này KHÔNG import các hàm ghi/sửa Booking và Invoice.
Mọi đề xuất chỉ lưu vào AiSuggestion / RebookReminder; người dùng là người xác nhận cuối cùng.

RÀNG BUỘC DỮ LIỆU: Module này KHÔNG truy vấn trực tiếp CSDL của các module nghiệp vụ (catalog, customers,
scheduling, spa). Mọi dữ kiện đều lấy qua API `/api/v1/ai/data/...` bằng `data_api.AiDataClient`.
Chỉ ghi vào bảng của chính AI (AiLog, AiSuggestion, RebookReminder).
"""
from datetime import datetime, time as dtime, timedelta
from decimal import Decimal
import re
import time

from django.db import transaction
from django.utils import timezone

from . import llm_provider
from .data_api import AiDataClient
from .models import AiLog, AiSuggestion, RebookReminder

RULES_ENGINE = 'rules-v1'


def _engine_name(model=None):
    return f'{RULES_ENGINE}+{model}' if model else RULES_ENGINE


def _clean_asterisks(text):
    """Xóa bỏ hoàn toàn ký tự * hoặc markdown bold/italic, lọc bỏ tiếng Trung và làm mềm các cụm từ máy móc."""
    if not text:
        return text
    # Loại bỏ khối Thinking Process nếu LLM xuất ra
    if 'Thinking Process:' in text:
        parts = re.split(r'\n\s*(?:Response|Answer|Final Answer|Phản hồi|Trả lời):\s*', text, flags=re.IGNORECASE)
        if len(parts) > 1:
            text = parts[-1].strip()
        else:
            match = re.search(r'\n\s*(?:Chào|Dạ|Xin chào|Em chào|Thưa|Đối với|Về vấn đề|Theo|Hiện tại|Bé)(.+)$', text, flags=re.DOTALL | re.IGNORECASE)
            if match:
                text = match.group(0).strip()

    # Loại bỏ tiền tố / cụm từ tiếng Trung rò rỉ nếu mô hình gặp lỗi (như 对于服务, 对于...)
    text = re.sub(r'对于服务\s*[:：]?\s*["“]?', 'Dịch vụ: ', text)
    text = re.sub(r'对于\s*', 'Đối với ', text)
    text = re.sub(r'服务\s*[:：]?\s*', 'Dịch vụ ', text)
    # Lọc bỏ mọi ký tự Hán tự Unicode còn sót lại
    text = re.sub(r'[\u4e00-\u9fff]+', '', text)

    # Đổi các bullet dạng * ở đầu dòng thành -
    text = re.sub(r'(?m)^\s*\*\s+', '- ', text)
    # Loại bỏ hoàn toàn tất cả dấu * còn lại
    text = text.replace('*', '')
    # Làm mềm các cụm từ máy móc
    text = re.sub(r'(hiện tại\s+)?(trong|theo)\s+tài liệu\s*(mà\s*em\s*có\s*)?(được\s*cung\s*cấp\s*)?(của\s*spa\s*)?,?\s*', 'hiện tại em ', text, flags=re.IGNORECASE)
    text = re.sub(r'hiện tại\s+hiện tại\s+em', 'hiện tại em', text, flags=re.IGNORECASE)
    text = re.sub(r'hiện tại em\s*,\s*', 'hiện tại em ', text, flags=re.IGNORECASE)
    text = text.replace('hiện tại em không có thông tin', 'hiện tại em chưa có thông tin')
    text = text.replace('hiện tại em chưa có tài liệu', 'hiện tại em chưa có thông tin')
    text = text.strip()
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


def _dt(value):
    """Chuỗi ISO 8601 từ API -> datetime có múi giờ."""
    return datetime.fromisoformat(value)


def _rephrase_reasons(reasons):
    """Nhờ LLM diễn đạt lại danh sách lý do (chỉ từ evidence đã có, không thêm dữ kiện mới).

    Trả (model, danh_sách_mới). LLM tắt/lỗi/sai định dạng -> (None, reasons gốc).
    """
    if not reasons or not llm_provider.is_enabled():
        return None, reasons
    numbered = '\n'.join(f'{i}. {r}' for i, r in enumerate(reasons, 1))
    res = llm_provider.complete([
        {'role': 'system', 'content': (
            'Bạn là trợ lý tư vấn của Pet Spa. Hãy diễn đạt lại từng lý do dưới đây thành 1-2 câu tiếng Việt '
            'thân thiện, dễ hiểu cho khách. Tuyệt đối KHÔNG thêm thông tin, con số hay lời khuyên y tế mới. '
            'Trả đúng định dạng mỗi dòng: "<số>. <câu đã viết lại>", không thêm chữ nào khác.')},
        {'role': 'user', 'content': numbered},
    ], max_tokens=600, temperature=0.3)
    if not res:
        return None, reasons
    parsed = {}
    for line in res.text.splitlines():
        m = re.match(r'^\s*(\d+)[\.\)]\s*(.+)$', line)
        if m:
            parsed[int(m.group(1))] = m.group(2).strip()
    if len(parsed) != len(reasons) or any(i not in parsed for i in range(1, len(reasons) + 1)):
        return None, reasons
    return res.model, [parsed[i] for i in range(1, len(reasons) + 1)]


# ---------------------------------------------------------------- GỢI Ý GÓI (R1 - R7)

def suggest_packages(pet_id, user=None):
    """Gợi ý tối đa 3 gói phù hợp nhất với hồ sơ thú cưng bằng bộ luật R1-R7."""
    start_time = time.time()
    api = AiDataClient(user)

    pet = api.pet_profile(pet_id)  # 404 nếu không có / khách không sở hữu
    if not pet['size_class']:
        raise ValueError('Thú cưng chưa có cân nặng/size hợp lệ để báo giá và gợi ý gói.')

    packages = api.packages()
    health_tags = pet['health_tags']
    tag_ids = [t['id'] for t in health_tags]

    # Lịch sử đặt dịch vụ gần nhất của bé
    last_booking = pet['last_completed_booking']

    # Ma trận chống chỉ định của mọi dịch vụ trong các gói, theo thẻ sức khỏe của bé
    all_service_ids = sorted({sid for p in packages for sid in p['service_ids']})
    contras_by_service = {}
    for c in api.contraindications(all_service_ids, tag_ids):
        contras_by_service.setdefault(c['service_id'], []).append(c)

    scored_packages = []

    for pkg in packages:
        # Kiểm tra xem gói có giá cho size của thú không
        if pet['size_class'] not in pkg['size_classes']:
            continue

        # R1: Loài
        if pkg['species_scope'] not in ('both', pet['species']):
            continue

        # R2: Tuổi tối thiểu
        age_m = pet['age_months'] or 0
        if pkg['min_age_months'] > 0 and age_m < pkg['min_age_months']:
            continue

        # R3 & R4: Chống chỉ định hóa chất / da liễu theo từng dịch vụ trong gói
        contras = [c for sid in pkg['service_ids'] for c in contras_by_service.get(sid, [])]

        blocked = False
        block_reasons = []
        warnings = []

        for c in contras:
            if c['severity'] == 'block':
                blocked = True
                block_reasons.append(f'Dịch vụ "{c["service_name"]}" bị chặn do thú có thẻ "{c["health_tag_name"]}": {c["reason_vi"]}')
            else:
                warnings.append({
                    'severity': 'warn',
                    'health_tag': c['health_tag_name'],
                    'service': c['service_name'],
                    'reason': c['reason_vi'],
                })

        # R3: Bị chặn đỏ -> Loại ngay
        if blocked:
            continue

        # Chấm điểm xuất phát
        score = Decimal(50)
        evidence = []

        # R4: Cảnh báo vàng -> Trừ điểm
        if warnings:
            score -= Decimal(15 * len(warnings))
            evidence.append({
                'rule': 'R4',
                'fact': f'Cần lưu ý chăm sóc đặc biệt do bé có {len(warnings)} cảnh báo da/dị ứng nhẹ.',
            })

        # R5: Phù hợp loại lông
        if pkg['coat_types']:
            if pet['coat_type'] in pkg['coat_types']:
                score += Decimal(25)
                evidence.append({
                    'rule': 'R5',
                    'fact': f'Liệu trình được thiết kế chuyên biệt cho chất lông {pet["coat_type_display"]}.',
                })
            else:
                score -= Decimal(10)
        else:
            score += Decimal(10)

        # R6: Chu kỳ nhắc tái spa khớp
        if last_booking:
            days_since = (timezone.localdate() - timezone.localtime(_dt(last_booking['end_at'])).date()).days
            interval = pkg['rebook_interval_days']
            if interval is not None and days_since >= interval:
                score += Decimal(25)
                evidence.append({
                    'rule': 'R6',
                    'fact': f'Đã {days_since} ngày kể từ lần spa gần nhất, đúng chu kỳ vệ sinh & tạo kiểu {interval} ngày.',
                })

        # R7: Thú từng dùng gói này ở lần hoàn tất gần đây
        if last_booking and last_booking['package_id'] == pkg['id']:
            score += Decimal(15)
            evidence.append({
                'rule': 'R7',
                'fact': 'Bé đã quen và thích nghi tốt với gói dịch vụ này ở lần trước.',
            })

        # Sinh lý do đề xuất (câu cảnh báo an toàn luôn do luật sinh, LLM không được sửa)
        reason_parts = [f'Phù hợp với bé {pet["name"]} ({pet["breed"] or pet["species_display"]}, size {pet["size_class"]}).']
        for ev in evidence:
            reason_parts.append(ev['fact'])
        reason_text = ' '.join(reason_parts)
        safety_text = f'Lưu ý an toàn: {warnings[0]["reason"]}' if warnings else ''
        confidence = min(Decimal('0.98'), max(Decimal('0.60'), (score / Decimal(100)).quantize(Decimal('0.01'))))

        scored_packages.append({
            'package_id': pkg['id'],
            'package_name': pkg['name'],
            'score': score,
            'confidence': confidence,
            'evidence': evidence,
            'warnings': warnings,
            'reason_text': reason_text,
            'safety_text': safety_text,
        })

    # Xếp hạng lấy top 3
    scored_packages.sort(key=lambda x: x['score'], reverse=True)
    top3 = scored_packages[:3]

    # LLM chỉ diễn đạt lại lý do; thứ hạng, điểm, cảnh báo vẫn do rule engine quyết định
    llm_model, new_reasons = _rephrase_reasons([x['reason_text'] for x in top3])
    for x, txt in zip(top3, new_reasons):
        x['reason_text'] = f"{txt} {x['safety_text']}".strip()
    for x in top3[len(new_reasons):]:
        x['reason_text'] = f"{x['reason_text']} {x['safety_text']}".strip()

    latency = int((time.time() - start_time) * 1000)

    # Ghi AiLog
    log = AiLog.objects.create(
        kind=AiLog.Kind.SUGGEST_PACKAGE,
        user=user if getattr(user, 'is_authenticated', False) else None,
        pet_id=pet['id'],
        input_text=f'Pet: {pet["name"]}, Breed: {pet["breed"]}, Coat: {pet["coat_type"]}, Weight: {pet["weight_kg"]}kg, Tags: {[t["name_vi"] for t in health_tags]}',
        output_text=f'Đề xuất {len(top3)} gói: {[x["package_name"] for x in top3]}',
        context_refs={'rules_triggered': ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'], 'data_source': 'api'},
        status=AiLog.Status.OK if top3 else AiLog.Status.REFUSED,
        latency_ms=latency,
        engine=_engine_name(llm_model),
    )

    # Ghi AiSuggestion
    suggestions = []
    for rank, item in enumerate(top3, 1):
        sug = AiSuggestion.objects.create(
            suggestion_type=AiSuggestion.Type.PACKAGE,
            pet_id=pet['id'],
            package_id=item['package_id'],
            rank=rank,
            score=item['score'],
            confidence=item['confidence'],
            reason_text=item['reason_text'],
            evidence=item['evidence'],
            warnings=item['warnings'],
            status=AiSuggestion.Status.PROPOSED,
            requested_by=user if getattr(user, 'is_authenticated', False) else None,
            ai_log=log,
        )
        suggestions.append(sug)

    return suggestions


# ---------------------------------------------------------------- GỢI Ý KỸ THUẬT VIÊN (SUGGEST STAFF)

def suggest_staff(booking_id, user=None):
    """Gợi ý KTV rảnh, đúng chuyên môn cho lịch hẹn (SPA-30)."""
    start_time = time.time()
    api = AiDataClient(user)

    data = api.staff_candidates(booking_id)  # 404 nếu không có lịch hẹn
    booking = data['booking']

    needed_spec_ids = {s['required_specialty_id'] for s in booking['services'] if s['required_specialty_id']}

    b_start = timezone.localtime(_dt(booking['start_at']))
    b_end = timezone.localtime(_dt(booking['end_at']))
    target_date = b_start.date()
    target_start_time = b_start.time()
    target_end_time = b_end.time()

    scored_staff = []

    for st in data['technicians']:
        # Kiểm tra ngày nghỉ phép
        if any(datetime.fromisoformat(t['date_from']).date() <= target_date <= datetime.fromisoformat(t['date_to']).date()
               for t in st['time_off']):
            continue

        # Kiểm tra ca làm việc
        shift_match = any(
            sh['weekday'] == target_date.weekday()
            and dtime.fromisoformat(sh['start_time']) <= target_start_time
            and dtime.fromisoformat(sh['end_time']) >= target_end_time
            for sh in st['shifts']
        )
        if not shift_match:
            continue

        # Kiểm tra trùng lịch hẹn khác
        if st['conflicting_bookings']:
            continue

        # Chấm điểm
        score = Decimal(50)
        evidence = []
        have_spec_ids = {s['id'] for s in st['specialties']}

        if needed_spec_ids:
            if needed_spec_ids.issubset(have_spec_ids):
                score += Decimal(30)
                spec_names = [s['name_vi'] for s in st['specialties'] if s['id'] in needed_spec_ids]
                evidence.append(f'Thành thạo chuyên môn yêu cầu: {", ".join(spec_names)}.')
            else:
                score -= Decimal(15)

        # Lịch sử từng làm cho bé này
        past_handled = st['past_handled_with_pet']
        if past_handled > 0:
            score += Decimal(20)
            evidence.append(f'Đã từng chăm sóc bé {booking["pet_name"]} chu đáo {past_handled} lần trước đây.')

        reason_text = f'{st["display_name"]} có ca làm việc phù hợp khung giờ. ' + ' '.join(evidence)
        confidence = min(Decimal('0.98'), max(Decimal('0.65'), (score / Decimal(100)).quantize(Decimal('0.01'))))

        scored_staff.append({
            'staff_id': st['id'],
            'username': st['username'],
            'score': score,
            'confidence': confidence,
            'evidence': evidence,
            'reason_text': reason_text,
        })

    scored_staff.sort(key=lambda x: x['score'], reverse=True)
    top = scored_staff[:3]

    llm_model, new_reasons = _rephrase_reasons([x['reason_text'] for x in top])
    for x, txt in zip(top, new_reasons):
        x['reason_text'] = txt

    latency = int((time.time() - start_time) * 1000)

    log = AiLog.objects.create(
        kind=AiLog.Kind.SUGGEST_STAFF,
        user=user if getattr(user, 'is_authenticated', False) else None,
        pet_id=booking['pet_id'],
        input_text=f'Booking #{booking["id"]}, Time: {booking["start_at"]}, Services: {[s["name"] for s in booking["services"]]}',
        output_text=f'Đề xuất {len(top)} thợ: {[x["username"] for x in top]}',
        context_refs={'data_source': 'api'},
        status=AiLog.Status.OK if top else AiLog.Status.REFUSED,
        latency_ms=latency,
        engine=_engine_name(llm_model),
    )

    suggestions = []
    for rank, item in enumerate(top, 1):
        sug = AiSuggestion.objects.create(
            suggestion_type=AiSuggestion.Type.STAFF,
            pet_id=booking['pet_id'],
            staff_id=item['staff_id'],
            target_start_at=_dt(booking['start_at']),
            rank=rank,
            score=item['score'],
            confidence=item['confidence'],
            reason_text=item['reason_text'],
            evidence=item['evidence'],
            status=AiSuggestion.Status.PROPOSED,
            requested_by=user if getattr(user, 'is_authenticated', False) else None,
            booking_id=booking['id'],
            ai_log=log,
        )
        suggestions.append(sug)

    return suggestions


# ---------------------------------------------------------------- NHẮC TÁI SPA (REBOOK REMINDERS)

@transaction.atomic
def generate_rebook_reminders(user=None, force_auto_approve=None):
    """Tác vụ quét và sinh danh sách nhắc tái spa khi đến hạn (SPA-28)."""
    from .models import RebookSetting
    setting = RebookSetting.get()
    advance_days = getattr(setting, 'advance_days', 0)
    auto_approve = setting.auto_approve if force_auto_approve is None else force_auto_approve

    data = AiDataClient(user).rebook_candidates()
    rules = data['rules']
    if not rules:
        return []

    today = timezone.localdate()
    created_reminders = []

    for cand in data['candidates']:
        last_b = cand['last_booking']
        last_date = timezone.localtime(_dt(last_b['end_at'])).date()

        # Tìm rule phù hợp theo thứ tự ưu tiên: Gói dịch vụ -> Loài thú cưng -> Tất cả loài
        matching_rule = None
        for r in rules:
            if last_b['package_id'] and r['package_id'] == last_b['package_id']:
                matching_rule = r
                break
        if not matching_rule:
            for r in rules:
                if r['species'] and r['species'] == cand['species']:
                    matching_rule = r
                    break
        if not matching_rule:
            for r in rules:
                if r['species'] == 'all':
                    matching_rule = r
                    break

        if not matching_rule:
            continue

        due_date = last_date + timedelta(days=matching_rule['interval_days'])
        trigger_date = due_date - timedelta(days=advance_days)

        if today >= trigger_date:
            overdue_days = max(0, (today - due_date).days)
            if today >= due_date:
                timing_str = f'Đã đến chu kỳ chăm sóc lông da định kỳ ({matching_rule["note_vi"] or "định kỳ"}).'
            else:
                diff_days = (due_date - today).days
                timing_str = f'Sắp đến hạn chu kỳ chăm sóc trong {diff_days} ngày tới ({matching_rule["note_vi"] or "định kỳ"}).'

            reason = (
                f'Bé {cand["pet_name"]} đã hoàn tất {last_b["package_name"] or "dịch vụ"} '
                f'vào ngày {last_date.strftime("%d/%m/%Y")} ({matching_rule["interval_days"]} ngày trước). '
                f'{timing_str}'
            )

            status = RebookReminder.Status.SENT if auto_approve else RebookReminder.Status.SUGGESTED
            now_dt = timezone.now()

            reminder = RebookReminder.objects.create(
                client_id=cand['client_id'],
                pet_id=cand['pet_id'],
                last_booking_id=last_b['id'],
                rule_id=matching_rule['id'],
                due_date=due_date,
                overdue_days=overdue_days,
                reason_text=reason,
                status=status,
                approved_by=user if auto_approve else None,
                approved_at=now_dt if auto_approve else None,
                sent_at=now_dt if auto_approve else None,
            )

            if auto_approve and reminder.client.user_id:
                notify(
                    [reminder.client.user],
                    kind='rebook_reminder',
                    title=f'🐾 Đã đến lịch chăm sóc định kỳ cho bé {reminder.pet.name}',
                    body=reminder.reason_text,
                    ref_type='rebook',
                    ref_id=reminder.id,
                )

            created_reminders.append(reminder)

    return created_reminders


def check_and_run_auto_scan(force=False, user=None):
    """Kiểm tra và tự động quét chu kỳ nếu đến khung giờ cấu hình."""
    from .models import RebookSetting
    setting = RebookSetting.get()
    if not setting.auto_scan_enabled and not force:
        return {'scanned': False, 'reason': 'disabled'}

    now = timezone.localtime()
    today = now.date()

    if not force:
        try:
            h, m = map(int, setting.scan_time.split(':'))
        except Exception:
            h, m = 8, 0

        target_time = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if now < target_time:
            return {'scanned': False, 'reason': 'not_yet_time'}

        if setting.last_scanned_at and timezone.localtime(setting.last_scanned_at).date() == today:
            return {'scanned': False, 'reason': 'already_scanned_today'}

    created = generate_rebook_reminders(user=user)
    setting.last_scanned_at = timezone.now()
    setting.save()
    return {
        'scanned': True,
        'created_count': len(created),
        'last_scanned_at': setting.last_scanned_at,
        'auto_approve': setting.auto_approve,
    }


def approve_reminder(reminder, user):
    """Quản lý duyệt gửi thông báo nhắc cho khách (SPA-29).

    Chỉ cập nhật trạng thái nhắc (bảng của AI). Việc gửi thông báo trong app cho khách do tầng API
    (`views.RebookReminderViewSet.approve`) thực hiện.
    """
    reminder.status = RebookReminder.Status.SENT
    reminder.approved_by = user
    reminder.approved_at = timezone.now()
    reminder.sent_at = timezone.now()
    reminder.save()
    return reminder


# ---------------------------------------------------------------- CHATBOT TRI THỨC (KNOWLEDGE RETRIEVAL)

def query_knowledge_chat(question, user=None, pet_id=None):
    """Chatbot trả lời dựa trên trích xuất tài liệu SOP & bảng giá (SPA-23)."""
    start_time = time.time()
    clean_q = question.strip()
    # Chuẩn hóa từ vựng thông dụng / lỗi gõ phím thường gặp trong dịch vụ spa
    norm_q = clean_q
    norm_q = re.sub(r'\bnhôm\b', 'nhuộm', norm_q, flags=re.IGNORECASE)
    words = [w.lower() for w in re.findall(r'\w+', norm_q) if len(w) > 1]
    log_user = user if getattr(user, 'is_authenticated', False) else None

    # Kiểm tra câu hỏi y tế khẩn cấp / chẩn đoán thuốc
    medical_keywords = {'uống thuốc', 'kháng sinh', 'chữa bệnh', 'gãy xương', 'co giật', 'nôn ra máu', 'tiêu chảy nặng'}
    if any(k in clean_q.lower() for k in medical_keywords):
        output = (
            '⚠️ Cảnh báo an toàn sức khỏe thú y: Pet Spa AI chỉ cung cấp dịch vụ tắm, cắt tỉa và chăm sóc vệ sinh thẩm mỹ. '
            'Với các dấu hiệu bệnh lý, cấp cứu hoặc cần dùng thuốc điều trị, vui lòng đưa bé ngay đến bác sĩ thú y hoặc bệnh viện thú y gần nhất!'
        )
        AiLog.objects.create(
            kind=AiLog.Kind.CHAT,
            user=log_user,
            input_text=clean_q,
            output_text=output,
            status=AiLog.Status.REFUSED,
            latency_ms=int((time.time() - start_time) * 1000),
        )
        return {
            'answer': output,
            'sources': [],
            'warning': 'medical_referral',
        }

    # Tìm kiếm đoạn tri thức phù hợp, lấy qua API (không đọc DB trực tiếp)
    api = AiDataClient(user)
    chunks = api.knowledge_chunks()

    # Hồ sơ thú cưng nếu khách đã đăng nhập (lấy qua API, tôn trọng phân quyền)
    user_pets = []
    if log_user:
        try:
            user_pets = api.my_pets(pet_id=pet_id)
        except Exception:
            user_pets = []

    pet_context = ''
    if user_pets:
        lines = []
        for p in user_pets:
            tags = ', '.join(t['name_vi'] for t in p.get('health_tags', [])) or 'Bình thường'
            allergy = f"; Lưu ý dị ứng: {p['allergy_note']}" if p.get('allergy_note') else ''
            last_b = p.get('last_completed_booking')
            last_str = f"; Lần spa gần nhất: {last_b['package_name']} ({timezone.localtime(_dt(last_b['end_at'])).strftime('%d/%m/%Y')})" if last_b and last_b.get('end_at') else ''
            lines.append(
                f"- Bé {p['name']}: {p['species_display']} giống {p['breed'] or 'chưa rõ'}, cân nặng {p['weight_kg']}kg (Size {p['size_class']}), "
                f"loại lông {p['coat_type_display']}. Thẻ sức khỏe: {tags}{allergy}{last_str}."
            )
        pet_context = '\n\nHỒ SƠ THÚ CƯNG CỦA KHÁCH HÀNG (đang đăng nhập):\n' + '\n'.join(lines)

    # Lọc từ dừng tiếng Việt để tính điểm chính xác, tránh match tràn lan các hư từ như "các", "trong", "có"...
    stop_words = {
        'các', 'những', 'của', 'và', 'có', 'trong', 'là', 'cho', 'với', 'ở', 'được', 'thì',
        'sao', 'gì', 'nào', 'về', 'như', 'ra', 'lại', 'làm', 'một', 'đó', 'này', 'ơi', 'ạ',
        'nhé', 'mình', 'em', 'anh', 'chị', 'bạn', 'hỏi', 'tôi', 'biết', 'thế', 'thế nào',
        'cho hỏi', 'giúp', 'hãy', 'xin', 'bao nhiêu', 'tiền', 'phí', 'chi phí', 'giá', 'size'
    }
    keywords = [w for w in words if w not in stop_words]
    if not keywords:
        basic_stops = {'các', 'những', 'của', 'và', 'có', 'trong', 'là', 'cho', 'với', 'ở', 'được', 'thì', 'ơi', 'ạ', 'nhé', 'em', 'anh', 'chị', 'bạn', 'hỏi', 'tôi', 'biết'}
        keywords = [w for w in words if w not in basic_stops] or words

    q_lower = clean_q.lower()
    matched = []

    for c in chunks:
        h_lower = c['heading'].lower()
        t_lower = c['text'].lower()
        score = 0

        # Trọng số tiêu đề (heading) cao hơn nội dung (text)
        h_hits = sum(1 for kw in keywords if kw in h_lower)
        score += h_hits * 4

        t_hits = sum(1 for kw in keywords if kw in t_lower)
        score += t_hits * 1

        # Khớp cụm từ liền kề (bigram)
        if len(keywords) >= 2:
            for i in range(len(keywords) - 1):
                bg = f'{keywords[i]} {keywords[i+1]}'
                if bg in h_lower:
                    score += 8
                elif bg in t_lower:
                    score += 4

        # Thưởng điểm đặc biệt nếu TIÊU ĐỀ hoặc ĐOẠN VĂN chứa ĐẦY ĐỦ tất cả từ khóa chính
        if len(keywords) >= 2 and all(kw in h_lower for kw in keywords):
            score += 16
        elif len(keywords) >= 2 and all(kw in t_lower for kw in keywords):
            score += 8

        # Tăng điểm chuyên biệt cho các câu hỏi thông dụng về hồ sơ spa / quy trình
        if any(k in q_lower for k in ('mở cửa', 'ngày mở', 'giờ mở', 'hoạt động', 'thời gian làm việc', 'đóng cửa', 'lịch làm')):
            if c['id'] == 'spa_operating_hours':
                score += 35
        if any(k in q_lower for k in ('hotline', 'địa chỉ', 'liên hệ', 'ở đâu', 'email', 'sđt', 'số điện thoại')):
            if c['id'] == 'spa_contact_info':
                score += 35
        if any(k in q_lower for k in ('hủy lịch', 'đổi lịch', 'slot', 'đặt lịch trước', 'hủy trước', 'chính sách hủy')):
            if c['id'] == 'spa_booking_policy':
                score += 35
        if any(k in q_lower for k in ('chu kỳ', 'mấy tuần', 'bao lâu tắm', 'tắm định kỳ', 'bao lâu cắt', 'định kỳ')):
            if c['id'] == 'grooming_cycles':
                score += 30
        if any(k in q_lower for k in ('viêm da', 'dị ứng', 'mẩn ngứa', 'da nhạy cảm', 'nấm da')):
            if c['id'] == 'skin_condition_policy':
                score += 30
        if any(k in q_lower for k in ('menu', 'danh mục', 'các dịch vụ', 'có dịch vụ gì', 'gói combo nào', 'tổng hợp gói', 'bảng dịch vụ')):
            if c['id'] == 'catalog_overview':
                score += 25

        if score > 0:
            matched.append((score, c))

    matched.sort(key=lambda x: x[0], reverse=True)

    top_chunks = []
    if matched:
        top_score = matched[0][0]
        # Nếu chunk top 1 có điểm số vượt trội (hơn 1.35 lần top 2) và điểm đủ cao,
        # chỉ lấy duy nhất top 1 để trả lời chính xác, tránh làm loãng context hoặc nối chunk rác
        if len(matched) > 1 and top_score >= 15 and top_score >= matched[1][0] * 1.35:
            top_chunks = [matched[0][1]]
        else:
            min_threshold = max(6, int(top_score * 0.60))
            top_chunks = [c for s, c in matched if s >= min_threshold][:3]

    llm_model = None
    llm_res = None
    if llm_provider.is_enabled():
        # RAG: chỉ đưa đoạn tài liệu thực sự liên quan, tránh nhồi nhét dữ liệu ngoài lề
        ctx_chunks = top_chunks or (chunks[:2] if any(k in q_lower for k in ('chào', 'hi', 'hello', 'ơi')) else [])
        context = '\n'.join(f'- [{c.get("doc_title", "Thông tin")}] {c["heading"]}: {c["text"]}' for c in ctx_chunks) if ctx_chunks else '(Không tìm thấy thông tin phù hợp trong hệ thống)'
        llm_res = llm_provider.complete([
            {'role': 'system', 'content': (
                'Bạn là Trợ lý tư vấn chuyên nghiệp của Pet Spa, nói tiếng Việt tự nhiên, thân thiện, xưng "em", gọi khách là "anh/chị" như một nhân viên lễ tân nhiệt tình, chu đáo.\n'
                'Dựa vào THÔNG TIN CỦA SPA bên dưới để trả lời ĐÚNG TRỌNG TÂM câu hỏi của khách hàng.\n\n'
                'QUY TẮC BẮT BUỘC:\n'
                '1. BẮT BUỘC TRẢ LỜI 100% BẰNG TIẾNG VIỆT TỰ NHIÊN: Tuyệt đối KHÔNG xuất hiện bất kỳ từ ngữ, cụm từ hay chữ viết tiếng Trung, tiếng Anh hay ngoại ngữ nào trong câu trả lời (tuyệt đối không dùng các từ như "对于", "服务", "对于服务"...).\n'
                '2. TRÍCH XUẤT CHÍNH XÁC SỐ LIỆU VÀ GIÁ TIỀN: Giữ nguyên vẹn 100% từng con số giá tiền và thời lượng như trong THÔNG TIN CỦA SPA. Tuyệt đối KHÔNG tự ý làm tròn số, không tự ý sửa số (ví dụ: nếu giá ghi là 180.001đ thì BẮT BUỘC phải ghi đúng 180.001đ, không được đổi thành 180.000đ).\n'
                '3. ĐÚNG TRỌNG TÂM DỊCH VỤ: Khách hỏi dịch vụ nào (ví dụ "nhuộm lông tai") thì CHỈ trả lời đúng giá của dịch vụ đó. Tuyệt đối KHÔNG tự ý liệt kê thêm menu, bảng giá, danh mục dịch vụ khác (như vệ sinh tai, nhuộm toàn thân...) trừ khi khách có yêu cầu so sánh.\n'
                '4. Nếu khách hỏi giờ/ngày mở cửa: chỉ trả lời khung giờ và các ngày mở cửa trong tuần của spa.\n'
                '5. Nếu khách hỏi địa chỉ/hotline: chỉ cung cấp địa chỉ, hotline và kênh liên hệ của spa.\n'
                '6. Nếu khách hàng đã đăng nhập và có hồ sơ thú cưng bên dưới, chỉ nhắc đến bé khi câu hỏi liên quan trực tiếp đến việc chăm sóc, chọn dịch vụ hoặc tính giá cho bé.\n'
                '7. Không tự bịa giá hay thông tin ngoài nội dung được cung cấp.\n'
                '8. Tuyệt đối KHÔNG dùng các từ máy móc như "theo tài liệu", "trong tài liệu", "SOP", "dữ liệu".\n'
                '9. Tuyệt đối KHÔNG sử dụng ký tự dấu sao (*) trong câu trả lời (không dùng **, *, bullet *). Viết in hoa hoặc dùng dấu gạch ngang (-) và số thứ tự (1, 2, 3).\n\n'
                'THÔNG TIN CỦA SPA:\n' + context + pet_context)},
            {'role': 'user', 'content': clean_q},
        ], max_tokens=600)

    answer = None
    if llm_res:
        cleaned_text = _clean_asterisks(llm_res.text)
        if cleaned_text and not cleaned_text.startswith(('Thinking Process:', "Here's a thinking process:", 'Okay, the user is asking', 'The user is asking')):
            llm_model = llm_res.model
            answer = cleaned_text
            sources = [{'doc_title': c.get('doc_title', ''), 'heading': c['heading']} for c in top_chunks]
            status = AiLog.Status.OK

    if not answer:
        if top_chunks:
            # Fallback: trả lời trực tiếp từ tri thức đã trích xuất, chuẩn xác, đúng mục đích, không dư thừa
            pet_note = ''
            if user_pets and any(k in clean_q.lower() for k in ('bé', 'thú cưng', 'chó', 'mèo')):
                names = ', '.join(p['name'] for p in user_pets)
                pet_note = f' (thông tin phù hợp cho bé {names})'

            # Định dạng nội dung gọn gàng, đúng trọng tâm: chỉ hiển thị chunk phù hợp nhất
            texts = [c['text'].strip() for c in top_chunks[:1]]
            body = '\n\n'.join(texts)

            answer = (
                f'Dạ Pet Spa xin gửi thông tin đến anh/chị{pet_note} ạ:\n\n'
                f'{body}\n\n'
                f'Nếu anh/chị cần đặt lịch hẹn hoặc tư vấn thêm, vui lòng liên hệ hotline để được phục vụ chu đáo nhất nhé ạ!'
            )
            answer = _clean_asterisks(answer)
            sources = [{'doc_title': c.get('doc_title', ''), 'heading': c['heading']} for c in top_chunks]
            status = AiLog.Status.OK
        else:
            answer = (
                'Dạ hiện tại em chưa có thông tin phù hợp về câu hỏi này. '
                'Anh/chị vui lòng liên hệ trực tiếp hotline hoặc nhắn nhân viên quầy lễ tân để được hỗ trợ chi tiết nhất nhé ạ!'
            )
            sources = []
            status = AiLog.Status.REFUSED

    latency = int((time.time() - start_time) * 1000)

    AiLog.objects.create(
        kind=AiLog.Kind.CHAT,
        user=log_user,
        input_text=clean_q,
        output_text=answer,
        context_refs={'sources': sources, 'data_source': 'api'},
        engine=_engine_name(llm_model),
        status=status,
        latency_ms=latency,
    )

    return {
        'answer': answer,
        'sources': sources,
    }
