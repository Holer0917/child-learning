"""需求/设计范围静态检查；不执行产品功能，不代表人工核实。"""
from pathlib import Path
import hashlib
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
docs = root.parent
srs = (root / '03-需求规格说明书.md').read_text(encoding='utf-8')
cases = (root / '08-需求验收用例清单.md').read_text(encoding='utf-8')
priority = (root / '04-需求优先级与范围界定.md').read_text(encoding='utf-8')
sdd = (docs / '03-设计/05-软件设计说明书.md').read_text(encoding='utf-8')
tasks = (docs / '06-过程管理/02-剩余任务三份分工.md').read_text(encoding='utf-8')
original = (root / '01-原始需求说明.md').read_text(encoding='utf-8')
retired = {'FR-21', 'FR-25', 'FR-26'}
expected_frs = {f'FR-{n:02d}' for n in range(1, 29)} - retired
acs = re.findall(r'^\d+\. \*\*(AC-\d+\.\d+)\*\*', srs, re.M)
frs = re.findall(r'^#### (FR-\d+) ', srs, re.M)
tcs = ['AC-' + x for x in re.findall(r'^\| TC-AC-(\d+\.\d+) \|', cases, re.M)]
kbs = re.findall(r'\*\*(AC-KB\.\d+)\*\*', srs)
summary = srs.split('## 6. 需求汇总表', 1)[1].split('## 7.', 1)[0]
rows = re.findall(r'^\| (FR-\d+) \|[^\n]+', summary, re.M)
priority_counts = {level: len(re.findall(r'^\| FR-\d+ \|.*\| (?:\*\*)?' + level + r'(?:\*\*)? \|$', summary, re.M)) for level in ['Must','Should','Could']}
rtm = sdd.split('## 12. 需求追溯矩阵', 1)[1].split('### 12.1', 1)[0]
sdd_frs = re.findall(r'^\| (FR-\d+) \|', rtm, re.M)
base = sdd.split('#### 表 0-1',1)[1].split('#### 表 0-2',1)[0]
sdd_base = re.findall(r'^\| (FR-\d+) \|', base, re.M)
archive = docs / '历史基线/2026-10-25-取消打印前'
manifest = json.loads((archive/'manifest.json').read_text(encoding='utf-8'))
checks = {
    'active_fr_ids_25': set(frs) == expected_frs and len(frs) == 25,
    'active_acceptance_count_141': len(acs) == 141,
    'acceptance_ids_unique': len(acs) == len(set(acs)),
    'all_active_ac_have_one_case': set(acs) == set(tcs) and len(tcs) == len(acs),
    'retired_ac_and_cases_absent': not any(re.match(r'AC-(21|25|26)\.', a) for a in acs+tcs),
    'summary_matches_active_fr_ids': set(rows) == expected_frs and len(rows) == 25,
    'priority_counts_14_9_2': priority_counts == {'Must':14,'Should':9,'Could':2},
    'nine_active_nfr': len(re.findall(r'^### NFR-\d+ ',srs,re.M)) == 9,
    'ten_active_fault_modes': len(re.findall(r'^\| \*\*FM-\d+\*\* \|',srs,re.M)) == 10,
    'ten_time_requirements': len(re.findall(r'^\| \*\*TR-\d+\*\* \|',srs,re.M)) == 10,
    'keyboard_ac_five': len(kbs) == 5,
    'sdd_rtm_matches_active_fr': set(sdd_frs) == expected_frs and len(sdd_frs) == 25,
    'sdd_baseline_matches_active_fr': set(sdd_base) == expected_frs and len(sdd_base) == 25,
    'sdd_has_no_active_print_api': not any(x in sdd for x in ['| 打印视图 |','| 打印 |','| `buildPrintView` |','| `app:exporters` |','{print(),']),
    'retired_print_flow_has_notice': '### 4.6 已撤销流程编号 F6' in sdd,
    'retired_fr_have_notices': all('已撤销编号：'+x in srs for x in retired),
    'backup_retained': '#### FR-28 数据导出与导入' in srs and '| FR-28 | Should |' in sdd,
    'white_ui_decision_explicit': 'CR-20261025-02' in srs and 'TR-10 | — | 全局 CSS 保持白色界面' in sdd,
    'statistics_and_key_present': '### 5.4 统计口径与去重规则' in srs and '#### 5.4.5 错题去重键' in srs,
    'five_variant_questions': '生成 **5 道**与原题' in srs,
    'no_template_case_text': '按标准中 WHEN/IF 条件构造输入' not in cases,
    'no_dangling_section_56': '§5.6.' not in srs and '见 5.6' not in srs,
    'rn_mapping_present': '### 9.6 原始需求（RN）到功能需求（FR）的映射' in srs,
    'rn03_withdrawn': bool(re.search(r'^\| RN-03 \|.*本期撤销',srs,re.M)),
    'rn12_explicit_wont': 'RN-12' in srs and '**不纳入本期**' in srs,
    's7_s8_remain_in_validation_plan': '## 八、验证计划' in original and '| S7 |' not in original,
    'wont_ten_groups': bool(re.search(r"^\| \*\*Won't\*\* \|.*\| 10 \|$",priority,re.M)),
    'three_packages_ten_tasks_each': all(len(re.findall(r'^\| '+package+r'\d{2} \|', tasks,re.M)) == 10 for package in ['A','B','C']),
    'integration_separate_and_unassigned': '自行认领' in tasks and '统一集成由黄磊负责，单独承担，不算入三份任务' in tasks,
    'historical_snapshot_hashes_match': all(hashlib.sha256((archive/x['file']).read_bytes()).hexdigest() == x['sha256'] for x in manifest),
    'historical_srs_still_161_ac': len(re.findall(r'^\d+\. \*\*(AC-\d+\.\d+)\*\*',(archive/'02-需求分析/03-需求规格说明书.md').read_text(encoding='utf-8'),re.M)) == 161,
}
result = {
    'session_date': '2026-10-25',
    'executor': 'AI assistant through local Python',
    'scope': '需求、设计与分工文档静态检查；不代表功能测试、性能实测或人工核实',
    'srs_version': 'V1.4', 'sdd_version': 'V1.2',
    'counts': {'functional_requirements':len(frs),'functional_acceptance_criteria':len(acs),'acceptance_test_cases':len(tcs),'keyboard_acceptance_criteria':len(kbs),'priorities':priority_counts,'task_items':30,'archived_files':len(manifest)},
    'checks': checks, 'all_passed': all(checks.values()),
}
(root/'evidence/requirements-check-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(result,ensure_ascii=True,indent=2))
sys.exit(0 if result['all_passed'] else 1)
