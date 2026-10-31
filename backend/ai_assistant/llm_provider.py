"""LlmProvider: giao diện nhỏ gọi mô hình ngôn ngữ qua OpenRouter (07_kien_truc.md mục 7.3).

Nguyên tắc:
- Tùy chọn: không có khóa API hoặc lỗi mạng thì trả None để nơi gọi dùng câu mẫu (fallback).
- Chỉ diễn đạt lại / trả lời từ evidence và đoạn tài liệu; KHÔNG gửi dữ liệu cá nhân chủ nuôi.
- Chỉ dùng thư viện chuẩn (urllib), không thêm dependency.
"""
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'


@dataclass
class LlmResult:
    text: str
    model: str


def is_enabled():
    return bool(getattr(settings, 'OPENROUTER_API_KEY', ''))


def complete(messages, max_tokens=500, temperature=0.4):
    """Gọi lần lượt các model trong OPENROUTER_MODELS. Trả LlmResult hoặc None nếu tắt/lỗi."""
    if not is_enabled():
        return None

    for model in settings.OPENROUTER_MODELS:
        payload = json.dumps({
            'model': model,
            'messages': messages,
            'max_tokens': max_tokens,
            'temperature': temperature,
        }).encode('utf-8')
        req = urllib.request.Request(
            OPENROUTER_URL,
            data=payload,
            headers={
                'Authorization': f'Bearer {settings.OPENROUTER_API_KEY}',
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': 'Pet Spa AI',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=settings.OPENROUTER_TIMEOUT) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            msg = data.get('choices', [{}])[0].get('message', {})
            text = (msg.get('content') or msg.get('reasoning') or '').strip()
            if '<think>' in text and '</think>' in text:
                import re
                text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text:
                return LlmResult(text=text, model=model)
            logger.warning('OpenRouter model %s trả nội dung rỗng', model)
        except urllib.error.HTTPError as e:
            logger.warning('OpenRouter model %s lỗi HTTP %s', model, e.code)
        except Exception as e:  # mạng, timeout, JSON sai... -> thử model kế tiếp
            logger.warning('OpenRouter model %s lỗi: %s', model, e)
    return None
