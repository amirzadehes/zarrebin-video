"""Makes short Persian samples with several voices so the owner can listen and choose."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import tts_gemini
TEXT = ("آیا می‌دانستید که معتبرترین قاضی غذاهای دنیا، یک شرکت تولید لاستیک است؟ بله، همین شرکت میشلین که امروز با «راهنمای میشلین» می‌شناسیمش، "
        "در ابتدا فقط یک کارخانه لاستیک‌سازی بود. در سال هزار و نهصد، دو برادر برای فروش بیشتر لاستیک، یک کتابچه‌ی قرمز ساختند.")
os.makedirs('voice-test/out', exist_ok=True)
voices = os.environ.get('VOICES', 'Kore,Charon,Puck,Sulafat,Orus,Gacrux,Algieba').split(',')
for v in voices:
    try:
        tts_gemini.synth(TEXT, v, tts_gemini.DEFAULT_STYLE, f'voice-test/out/{v}.wav')
        subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'voice-test/out/{v}.wav', '-b:a', '128k', f'voice-test/out/voice_{v}.mp3'])
        print('ok', v)
    except SystemExit as e: print('FAILED', v, e)
