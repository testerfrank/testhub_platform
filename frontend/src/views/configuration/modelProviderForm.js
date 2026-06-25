export const SAVED_API_KEY_MASK = '************'

export function getApiKeyPlaceholder(form) {
  if (!form?.id) return '请输入 API Key'
  return '点击眼睛图标查看明文，输入新值可覆盖'
}

export function getApiKeyDisplayValue(form) {
  if (!form?.id) return form?.api_key || ''
  if (form.api_key_visible || form.api_key_dirty) return form.api_key || ''
  return SAVED_API_KEY_MASK
}

export function shouldSubmitApiKey(form) {
  if (!form?.id) return Boolean(form?.api_key)
  return Boolean(form.api_key_dirty && form.api_key)
}

export function getModelFetchMode(form) {
  if (!form?.id) return 'preview'
  if (form.api_key_dirty || form.base_url_dirty || form.provider_type_dirty) return 'preview'
  return 'saved'
}

export function normalizeAvailableModels(models) {
  const modelIds = []
  for (const item of models || []) {
    let modelId = ''
    if (typeof item === 'string') {
      modelId = item
    } else if (item && typeof item === 'object') {
      modelId = item.id || item.model || item.name || ''
    }
    if (modelId) modelIds.push(String(modelId))
  }
  return [...new Set(modelIds)]
}
