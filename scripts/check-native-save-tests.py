"""Require every native save-regression test in the captured optimized test log.
This validates the test run, not universal filesystem/power-loss durability.
"""
from pathlib import Path
import json
import platform
import re

root = Path(__file__).resolve().parents[1]
log = root / 'test-results/native-save-release.log'
text = log.read_text(encoding='utf-8')
required = {
    'every_prepublication_failure_preserves_original_or_absence',
    'acknowledged_write_visits_all_stages_in_order',
    'late_external_modification_or_deletion_is_never_replaced',
    'readonly_change_after_preparation_is_respected',
    'postpublication_failures_never_return_a_false_success',
    'failed_readback_explicitly_reports_a_replaced_destination',
    'corrupted_readback_is_not_acknowledged',
    'failed_backup_keeps_document_and_write_grant_unchanged',
    'oversized_save_is_rejected_before_file_or_backup_changes',
    'unicode_and_space_paths_roundtrip_with_exact_predecessor_backup',
    'ordinary_lock_names_remain_compatible_with_previous_versions',
    'portable_backups_have_a_separate_bounded_read_only_grant',
    'oversized_portable_backup_never_creates_a_file_grant',
}
if platform.system() != 'Windows':
    required |= {'valid_long_filename_does_not_overflow_lock_filename_limit',
                 'invalid_unicode_path_is_refused_not_lossily_aliased'}
passed = set(re.findall(r'test files::file_safety_tests::([a-z_]+) \.\.\. ok', text))
if passed != required or not re.search(r'test result: ok\.', text):
    raise SystemExit(f'Native save tests missing or failed: missing={sorted(required-passed)}; unexpected={sorted(passed-required)}')
report = {'success': True, 'profile': 'release', 'system': platform.system(),
          'release': platform.release(), 'architecture': platform.machine(),
          'tests': sorted(passed), 'count': len(passed),
          'scope': 'Real scratch-file IO with internal error injection; no actual full disk, power loss, OS-picker or old-hardware certification'}
(root / 'test-results/native-save-report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))
