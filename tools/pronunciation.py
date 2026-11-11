"""Display-independent reading hints; never remove historical caveats."""
import re

def cn(n):
    digits = '零一二三四五六七八九'
    if n < 10: return digits[n]
    if n < 20: return '十' + (digits[n % 10] if n % 10 else '')
    if n < 100: return digits[n // 10] + '十' + (digits[n % 10] if n % 10 else '')
    return digits[n // 100] + '百' + (('零' if n % 100 < 10 else '') + cn(n % 100) if n % 100 else '')

def spoken(text):
    # Spoken clarification of the verb 将; the displayed historical
    # sentence remains “乐毅将燕师南下”. This avoids the rejected short-phrase take.
    text = text.replace('乐毅将燕师南下', '乐毅率领燕军向南进军。')
    text = re.sub(r'前(\d{2,3})', lambda m: '公元前' + cn(int(m[1])) + '年', text)
    # Display text stays unchanged. These homophones guide proper-name readings.
    replacements = {'阏与': '玉与', '栎阳': '跃阳', '说韩魏': '税韩魏', '说楚王': '税楚王',
                    '说昭王': '税昭王', '说齐': '税齐', '说以存亡': '税以存亡',
                    '范雎': '范居', '郦': '历', '樗里疾': '初里疾', '嫪毐': '烙矮',
                    '尉缭': '未缭', '李悝': '李亏', '墨翟': '墨笛', '乐毅': '岳毅', '会稽': '快稽',
                    '公孙痤': '公孙嵯', '屈匄': '屈盖', '唐眜': '唐末', '泚水': '此水', '伊阙': '伊确',
                    '张孟谈': '张孟坛', '齐称东帝': '其称东帝', '齐湣王': '其敏王',
                    '税齐': '税其', '齐去帝号': '其去帝号', '齐从之': '其从之',
                    '信陵君': '信灵君', '春申君': '春身君'}
    for original, reading in replacements.items():
        # This sentence's native-name take screened better than the homophone
        # prompt. Retain its verified first take instead of another generation.
        if original == '信陵君' and text.startswith('信陵君窃符'): continue
        text = text.replace(original, reading)
    text = re.sub(r'[《》「」『』“”]', '', text).replace('——', '，').replace('·', '，')
    # Read the citation's words with ordinary pauses, not literal parentheses.
    text = re.sub(r'[（）()]', '，', text)
    return re.sub(r'[，；：]{2,}', '，', text).strip('，')
