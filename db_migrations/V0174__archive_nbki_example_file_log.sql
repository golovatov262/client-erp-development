-- User-requested cleanup of the four example files visible on 2026-11-11.
-- Preserve source XML, receipts and every reference used by loan facts / UID matching.
ALTER TABLE nbki_source_files ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE nbki_source_files
SET archived_at = NOW()
WHERE org_id = 2 AND archived_at IS NULL
  AND (reg_number, xml_sha256) IN (
    ('QY01GG000001_20260824_122918', 'eebb449673dce811bf04c8319437151b17637f19b1f3fd5b812e3b1452b3c7d9'),
    ('QY01GG000001_20260902_145813', 'c3da1bdad9c1459876d408a990a100f8535e6c59d42bfcf570eae8bd525de5e1'),
    ('QY01GG000001_20261006_105912', 'c4154b94d543dd393bb32180c2dafa54f067103cc6af2a80791b1add9416914c'),
    ('QY01GG000001_20261102_152140', '1028bea42bcf89679c1ae57ad5c364ae154cbf0ecdc08fa9e4c9efbd9d53039a')
  );
