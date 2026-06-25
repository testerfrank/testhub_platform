import assert from 'node:assert/strict'
import {
  getApiKeyDisplayValue,
  getApiKeyPlaceholder,
  getModelFetchMode,
  normalizeAvailableModels,
  shouldSubmitApiKey
} from './modelProviderForm.js'

assert.equal(
  getApiKeyPlaceholder({ id: 1, api_key_masked: 'sk-****1234' }),
  '点击眼睛图标查看明文，输入新值可覆盖'
)

assert.equal(
  getApiKeyPlaceholder({ id: 1, api_key_masked: '' }),
  '点击眼睛图标查看明文，输入新值可覆盖'
)

assert.equal(
  getApiKeyPlaceholder({ id: null, api_key_masked: '' }),
  '请输入 API Key'
)

assert.equal(
  getApiKeyDisplayValue({ id: 1, api_key: '', api_key_visible: false, api_key_masked: 'sk-****1234' }),
  '************'
)

assert.equal(
  getApiKeyDisplayValue({ id: 1, api_key: 'sk-secret-1234', api_key_visible: true, api_key_masked: 'sk-****1234' }),
  'sk-secret-1234'
)

assert.equal(
  getApiKeyDisplayValue({ id: null, api_key: 'new-key', api_key_visible: true, api_key_masked: '' }),
  'new-key'
)

assert.equal(shouldSubmitApiKey({ id: 1, api_key: '', api_key_dirty: false }), false)
assert.equal(shouldSubmitApiKey({ id: 1, api_key: 'sk-new', api_key_dirty: true }), true)
assert.equal(shouldSubmitApiKey({ id: null, api_key: 'sk-new', api_key_dirty: true }), true)

assert.equal(
  getModelFetchMode({ id: 1, api_key_dirty: false, base_url_dirty: false }),
  'saved'
)
assert.equal(
  getModelFetchMode({ id: 1, api_key_dirty: true, base_url_dirty: false }),
  'preview'
)
assert.equal(
  getModelFetchMode({ id: null, api_key_dirty: false, base_url_dirty: false }),
  'preview'
)

assert.deepEqual(
  normalizeAvailableModels(['gpt-4o', { id: 'claude-sonnet-4-6' }, { name: 'deepseek-chat' }, { model: 'qwen-max' }, '', null, 'gpt-4o']),
  ['gpt-4o', 'claude-sonnet-4-6', 'deepseek-chat', 'qwen-max']
)

console.log('modelProviderForm tests passed')
