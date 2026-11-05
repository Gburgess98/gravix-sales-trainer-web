import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRecording, formatBytes, missingForUpload, describeFailure, stageStatus, stageAnnouncement, parsePending, serializePending,
  callIdFromPath, MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, ALLOWED_MIMES, PENDING_MAX_AGE_MS,
} from '../../src/lib/upload-model.ts'

const MB = 1024 * 1024
const UUID = '3f2b8c1e-5a4d-4c9b-8e7f-0a1b2c3d4e5f'

test('accepts every offered extension and rejects others', () => {
  for (const ext of ALLOWED_EXTENSIONS) assert.equal(validateRecording({ name: `call${ext}`, size: MB, type: '' }), null, ext)
  for (const bad of ['notes.pdf', 'deck.pptx', 'clip.avi', 'noextension', 'x.wav.exe']) assert.equal(validateRecording({ name: bad, size: MB, type: '' })?.code, 'type', bad)
})

test('extension is case-insensitive; a mime the API would refuse is refused up front', () => {
  assert.equal(validateRecording({ name: 'CALL.MP3', size: MB, type: 'audio/mpeg' }), null)
  assert.equal(validateRecording({ name: 'call.mp3', size: MB, type: 'image/png' })?.code, 'type')
  assert.equal(validateRecording({ name: 'call.wav', size: MB, type: 'audio/x-ms-wma' })?.code, 'type')
  for (const m of ALLOWED_MIMES) assert.equal(validateRecording({ name: 'call.wav', size: MB, type: m }), null, m)
})

test('size limit is the API maximum: 50 MB passes, one byte over fails, empty fails', () => {
  assert.equal(MAX_UPLOAD_BYTES, 50 * MB)
  assert.equal(validateRecording({ name: 'a.wav', size: 50 * MB, type: 'audio/wav' }), null)
  assert.equal(validateRecording({ name: 'a.wav', size: 50 * MB + 1, type: 'audio/wav' })?.code, 'size')
  assert.equal(validateRecording({ name: 'a.wav', size: 0, type: 'audio/wav' })?.code, 'empty')
})

test('problem messages are calm: no codes, no HTTP, state the limit', () => {
  const m = validateRecording({ name: 'big.wav', size: 80 * MB, type: 'audio/wav' })!.message
  assert.match(m, /50 MB/); assert.doesNotMatch(m, /HTTP|\b4\d\d\b|unsupported_file_type|_/)
})

test('missingForUpload: only the recording is required', () => {
  // The recording is the ONLY required input: the finalise contract ignores any rep/label and owns the call as the uploader.
  assert.deepEqual(missingForUpload({ hasFile: false }), ['a recording'])
  assert.deepEqual(missingForUpload({ hasFile: true }), [])
})

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B'); assert.equal(formatBytes(2048), '2 KB'); assert.equal(formatBytes(5.5 * MB), '5.5 MB'); assert.equal(formatBytes(-1), '—')
})

test('failure copy never leaks raw storage, API or job text', () => {
  const raws = ['storage 403', 'network', 'Upload failed with HTTP 500', 'DB insert failed: duplicate key value violates unique constraint "calls_pkey"', 'Job insert failed: relation "jobs" does not exist', 'processing_failed', 'signed_url_failed', 'TypeError: fetch failed', 'caller_hierarchy_incomplete']
  for (const stage of ['preparing', 'uploading', 'finalising', 'processing'] as const) {
    for (const raw of raws) {
      const f = describeFailure(stage, new Error(raw))
      const all = `${f.title} ${f.detail}`
      assert.doesNotMatch(all, /HTTP|storage|duplicate key|relation|_failed|signed_url|TypeError|calls_pkey|hierarchy|\b[45]\d\d\b/i, `${stage}/${raw}: ${all}`)
    }
  }
})

test('retry safety: only pre-finalise failures say nothing is saved; finalise/processing say saved (no re-upload)', () => {
  assert.equal(describeFailure('preparing', new Error('x')).saved, false)
  assert.equal(describeFailure('uploading', new Error('x')).saved, false)
  assert.equal(describeFailure('finalising', new Error('x')).saved, true)
  assert.equal(describeFailure('processing', new Error('x')).saved, true)
})

test('specific, actionable cases', () => {
  assert.match(describeFailure('preparing', new Error('missing_user')).title, /session has expired/i)
  assert.match(describeFailure('preparing', new Error('unsupported_file_type')).title, /isn’t supported/)
  assert.match(describeFailure('finalising', new Error('upload_hierarchy_incomplete')).detail, /administrator/i)
  assert.match(describeFailure('finalising', new Error('HTTP 429')).title, /Too many/)
})

test('stageStatus walks the four stages and marks the failed one', () => {
  assert.deepEqual((['preparing', 'uploading', 'finalising', 'processing'] as const).map((s) => stageStatus(s, 'uploading')), ['done', 'current', 'upcoming', 'upcoming'])
  assert.deepEqual((['preparing', 'uploading', 'finalising', 'processing'] as const).map((s) => stageStatus(s, 'failed', 'finalising')), ['done', 'done', 'failed', 'upcoming'])
  assert.deepEqual((['preparing', 'uploading', 'finalising', 'processing'] as const).map((s) => stageStatus(s, 'completed')), ['done', 'done', 'done', 'done'])
})

test('announcements are quarter-stepped and carry no estimated time', () => {
  assert.equal(stageAnnouncement('uploading', 0), 'Uploading. 0 percent.')
  assert.equal(stageAnnouncement('uploading', 49), 'Uploading. 25 percent.')
  assert.equal(stageAnnouncement('uploading', 100), 'Uploading. 100 percent.')
  for (const s of ['preparing', 'uploading', 'finalising', 'processing'] as const) assert.doesNotMatch(stageAnnouncement(s, 50), /minute|second|remaining|ETA/i)
})

test('pending record round-trips and rejects stale, malformed or foreign shapes', () => {
  const now = 1_700_000_000_000
  const ok = { callId: UUID, jobId: UUID, filename: 'a.wav', at: now - 1000 }
  assert.deepEqual(parsePending(serializePending(ok), now), ok)
  assert.equal(parsePending(null, now), null)
  assert.equal(parsePending('not json', now), null)
  assert.equal(parsePending(serializePending({ ...ok, at: now - PENDING_MAX_AGE_MS - 1 }), now), null)
  assert.equal(parsePending(serializePending({ ...ok, at: now + 10 * 60_000 }), now), null)
  assert.equal(parsePending(JSON.stringify({ ...ok, callId: '../../etc/passwd' }), now), null)
  assert.equal(parsePending(JSON.stringify({ ...ok, jobId: 'x' }), now), null)
  assert.deepEqual(parsePending(serializePending({ ...ok, jobId: null }), now)?.jobId, null)
})

test('call id is derived from the signed path exactly as the API creates it', () => {
  assert.equal(callIdFromPath(`user-1/${UUID}.wav`), UUID)
  assert.equal(callIdFromPath(`user-1/${UUID}`), UUID)
})
