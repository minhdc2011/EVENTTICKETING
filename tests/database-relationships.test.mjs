import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseTimelineFromDescription} from '../src/domain/publicSchedule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('migration 20261028100000 establishes 1-1 CAU_HINH_SU_KIEN and consolidates timeline into description', () => {
  const migrationPath = path.join(
    rootDir,
    'supabase/migrations/20261028100000_schema_timeline_cleanup_and_explicit_relationships.sql'
  );
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const content = fs.readFileSync(migrationPath, 'utf8');

  // 1. Drops LICH_TRINH table and policies
  assert.match(content, /DROP TABLE IF EXISTS public\."LICH_TRINH" CASCADE;/i);

  // 2. Strict 1-1 CAU_HINH_SU_KIEN with PK = FK and Hybrid JSONB TuyChonMoRong
  assert.match(content, /CREATE TABLE IF NOT EXISTS public\."CAU_HINH_SU_KIEN"/i);
  assert.match(
    content,
    /"SuKienID" INT PRIMARY KEY REFERENCES public\."SU_KIEN"\("SuKienID"\) ON DELETE CASCADE/i
  );
  assert.match(content, /"TuyChonMoRong" JSONB NOT NULL DEFAULT '{}'::JSONB/i);

  // 3. RLS Policies
  assert.match(content, /ALTER TABLE public\."CAU_HINH_SU_KIEN" ENABLE ROW LEVEL SECURITY;/i);
  assert.match(content, /CREATE POLICY "Public Read Published CAU_HINH_SU_KIEN"/i);

  // 4. Seeds Super Concert 1-1 configuration
  assert.match(content, /INSERT INTO public\."CAU_HINH_SU_KIEN"/i);
  assert.match(content, /soundcheck_vip/i);

  // 5. Updates Description with detailed timeline
  assert.match(content, /UPDATE public\."SU_KIEN"/i);
  assert.match(content, /LỊCH TRÌNH CHƯƠNG TRÌNH \(TIMELINE\):/i);

  // 6. Updated luu_su_kien_toan_dien RPC manages CAU_HINH_SU_KIEN
  assert.match(content, /CREATE OR REPLACE FUNCTION public\.luu_su_kien_toan_dien/i);
  assert.match(content, /CAU_HINH_SU_KIEN/i);
  assert.doesNotMatch(content, /INSERT INTO public\."LICH_TRINH"/i);
});

test('TypeScript database types specify 1-1 relationship for CAU_HINH_SU_KIEN', () => {
  const typesPath = path.join(rootDir, 'src/types/database.types.ts');
  const content = fs.readFileSync(typesPath, 'utf8');

  assert.match(content, /CAU_HINH_SU_KIEN:\s*\{/i);
  assert.match(content, /isOneToOne:\s*true/i);
  assert.match(content, /referencedRelation:\s*"SU_KIEN"/i);
});

test('parseTimelineFromDescription extracts timeline items cleanly from markdown description', () => {
  const sampleDesc = `
Đại nhạc hội quy tụ nghệ sĩ hàng đầu.

### LỊCH TRÌNH CHƯƠNG TRÌNH (TIMELINE):
- **16:30 - 18:30**: Mở cổng check-in an ninh: Soát vé và phát quà
- **18:30 - 19:30**: Giao lưu Warm-up DJ Set: Khởi động sân vận động
- **19:30 - 22:30**: Biểu diễn chính: Các ca khúc hit đỉnh cao
- **22:30**: Bế mạc: Hướng dẫn ra về an toàn
`;

  const items = parseTimelineFromDescription(sampleDesc, 1);
  assert.equal(items.length, 4);

  assert.equal(items[0].startTime, '16:30');
  assert.equal(items[0].endTime, '18:30');
  assert.equal(items[0].title, 'Mở cổng check-in an ninh');
  assert.equal(items[0].description, 'Soát vé và phát quà');
  assert.equal(items[0].order, 1);

  assert.equal(items[1].startTime, '18:30');
  assert.equal(items[1].endTime, '19:30');
  assert.equal(items[1].title, 'Giao lưu Warm-up DJ Set');

  assert.equal(items[3].startTime, '22:30');
  assert.equal(items[3].endTime, undefined);
  assert.equal(items[3].title, 'Bế mạc');
  assert.equal(items[3].description, 'Hướng dẫn ra về an toàn');
});

test('parseTimelineFromDescription returns empty array when description contains no timeline', () => {
  const regularDesc = 'Sự kiện âm nhạc thường niên tổ chức tại Hà Nội. Khán giả vui lòng đến sớm.';
  const items = parseTimelineFromDescription(regularDesc, 1);
  assert.deepEqual(items, []);
});

test('database model defines and validates all 3 fundamental relationship categories', () => {
  const migrationPath = path.join(
    rootDir,
    'supabase/migrations/20261028100000_schema_timeline_cleanup_and_explicit_relationships.sql'
  );
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify documentation comments exist for 1-1, 1-N, N-N
  assert.match(content, /1-1: SU_KIEN \|\|--\|\| CAU_HINH_SU_KIEN/i);
  assert.match(content, /1-N: TO_CHUC \|\|--o\{ SU_KIEN/i);
  assert.match(content, /N-N: SU_KIEN \}o--o\{ NGHE_SI/i);
});
