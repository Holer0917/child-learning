"""只检查需求文档，不执行产品功能；从工作区根目录运行。"""
from pathlib import Path
import re
import json

root = Path(__file__).resolve().parents[1]
srs = (root / '03-需求规格说明书.md').read_text(encoding='utf-8')
cases = (root / '08-需求验收用例清单.md').read_text(encoding='utf-8')
priority = (root / '04-需求优先级与范围界定.md').read_text(encoding='utf-8')
original = (root / '01-原始需求说明.md').read_text(encoding='utf-8')

acs = re.findall(r'^\d+\. \*\*(AC-\d+\.\d+)\*\*', srs, re.M)
frs = re.findall(r'^#### (FR-\d+) ', srs, re.M)
tcs = ['AC-' + x for x in re.findall(r'\| TC-AC-(\d+\.\d+) \|', cases)]
kbs = re.findall(r'\*\*(AC-KB\.\d+)\*\*', srs)
checks = {
    'functional_requirement_count_28': len(frs) == 28,
    'functional_acceptance_count_161': len(acs) == 161,
    'acceptance_ids_unique': len(acs) == len(set(acs)),
    'all_acceptance_ids_have_case_mapping': set(acs) == set(tcs) and len(tcs) == len(acs),
    'no_template_case_text': '按标准中 WHEN/IF 条件构造输入' not in cases,
    'every_case_has_threshold': all('|' in ln for ln in cases.splitlines() if ln.startswith('| TC-AC-')),
    'statistics_definition_present': '### 5.4 统计口径与去重规则' in srs,
    'mistake_key_definition_present': '#### 5.4.5 错题去重键' in srs,
    'five_variant_questions': '生成 **5 道**与原题' in srs,
    'ambiguous_trend_removed': '最近若干次' not in srs,
    'no_dangling_section_56': '§5.6.' not in srs and '见 5.6' not in srs,
    'no_placeholder_sections': '保留小节' not in srs,
    'keyboard_ac_split': len(kbs) == 5,
    'rn_to_fr_mapping_present': '### 9.6 原始需求（RN）到功能需求（FR）的映射' in srs,
    'rn12_explicit_wont': 'RN-12' in srs and '**不纳入本期**' in srs,
    's7_s8_moved_to_validation': '## 八、验证计划' in original and '| S7 |' not in original,
    'rtm_uses_tc_ac': 'TC-AC-01.1~01.6' in srs and 'TC-101~103' not in srs,
    'priority_doc_uses_tc_ac': 'TC-101~103' not in priority,
    'no_a9_misreference_for_fr09': '| FR-09 | 难度分级 | A-9 |' not in priority,
    'won_t_count_nine': '| **Won\'t** | 本期不做 | 明确排除，写入范围外清单，防止范围蔓延 | 9 |' in priority,
}
result = {
    'session_date': '2026-10-19',
    'executor': 'AI assistant through local Python',
    'scope': '需求文档静态检查；不代表功能测试或人工核实',
    'srs_version': 'V1.3',
    'counts': {
        'functional_requirements': len(frs),
        'functional_acceptance_criteria': len(acs),
        'acceptance_test_cases': len(tcs),
        'keyboard_acceptance_criteria': len(kbs),
    },
    'checks': checks,
    'all_passed': all(checks.values()),
}
output = root / 'evidence' / 'requirements-check-result.json'
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
