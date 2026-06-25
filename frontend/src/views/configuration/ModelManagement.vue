<template>
  <div class="model-management">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="模型列表" name="providers">
        <div class="toolbar">
          <el-button type="primary" @click="openProviderDialog()">新增模型</el-button>
        </div>
        <el-table v-loading="providerLoading" :data="providers" border>
          <el-table-column prop="name" label="配置名称" min-width="140" />
          <el-table-column prop="provider_type_display" label="模型提供商" width="130" />
          <el-table-column prop="model_name" label="模型名称" min-width="150" />
          <el-table-column prop="base_url" label="Base URL" min-width="220" show-overflow-tooltip />
          <el-table-column prop="max_tokens" label="max_tokens" width="110" />
          <el-table-column prop="temperature" label="temperature" width="120" />
          <el-table-column prop="top_p" label="top_p" width="90" />
          <el-table-column label="启用状态" width="100">
            <template #default="{ row }">
              <el-switch v-model="row.is_active" @change="toggleProvider(row)" />
            </template>
          </el-table-column>
          <el-table-column label="业务使用" min-width="170">
            <template #default="{ row }">
              <el-tag v-if="!row.is_used" type="info">未使用</el-tag>
              <el-space v-else wrap>
                <el-tag v-for="usage in row.usage_names" :key="usage" type="success">{{ usage }}</el-tag>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openProviderDialog(row)">编辑</el-button>
              <el-button link type="primary" @click="testConnection(row)">测试连接</el-button>
              <el-button link type="danger" @click="removeProvider(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="AI 用例模型配置" name="testcase">
        <el-table :data="testcaseUsageRows" border>
          <el-table-column prop="label" label="用途" width="180" />
          <el-table-column label="当前模型" min-width="220">
            <template #default="{ row }">
              <el-select v-model="row.model_provider" placeholder="请选择启用模型" clearable filterable>
                <el-option v-for="provider in activeProviders" :key="provider.id" :label="provider.name" :value="provider.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="140">
            <template #default="{ row }">
              <el-tag :type="getUsageStatus(row).type">{{ getUsageStatus(row).text }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div class="actions">
          <el-button type="primary" @click="saveTestcaseUsages">保存 AI 用例模型配置</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="AI 智能模式配置" name="browser">
        <el-table :data="browserUsageRows" border>
          <el-table-column prop="label" label="用途" width="220" />
          <el-table-column label="当前模型" min-width="220">
            <template #default="{ row }">
              <el-select v-if="!row.reserved" v-model="row.model_provider" placeholder="请选择启用模型" clearable filterable>
                <el-option v-for="provider in activeProviders" :key="provider.id" :label="provider.name" :value="provider.id" />
              </el-select>
              <el-text v-else type="info">暂未开放</el-text>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="140">
            <template #default="{ row }">
              <el-tag :type="row.reserved ? 'info' : getUsageStatus(row).type">{{ row.reserved ? '预留' : getUsageStatus(row).text }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div class="actions">
          <el-button type="primary" @click="saveBrowserUsages">保存 AI 智能模式配置</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="providerDialogVisible" :title="providerForm.id ? '编辑模型' : '新增模型'" width="640px">
      <el-form :model="providerForm" label-width="120px">
        <el-form-item label="配置名称" required><el-input v-model="providerForm.name" /></el-form-item>
        <el-form-item label="模型提供商" required>
          <el-select v-model="providerForm.provider_type" @change="markProviderTypeDirty">
            <el-option v-for="item in providerTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key" :required="!providerForm.id">
          <el-input
            v-model="apiKeyInputValue"
            :type="providerForm.api_key_visible ? 'text' : (providerForm.id && !providerForm.api_key_dirty ? 'text' : 'password')"
            :show-password="!providerForm.id || providerForm.api_key_dirty"
            :readonly="providerForm.id && !providerForm.api_key_visible && !providerForm.api_key_dirty"
            :placeholder="apiKeyPlaceholder"
            @input="markApiKeyDirty"
          >
            <template v-if="providerForm.id && !providerForm.api_key_dirty" #append>
              <el-button :icon="providerForm.api_key_visible ? Hide : View" :loading="apiKeyRevealLoading" @click="toggleApiKeyVisibility" />
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="Base URL" required><el-input v-model="providerForm.base_url" @input="markBaseUrlDirty" /></el-form-item>
        <el-form-item label="模型名称" required>
          <el-space class="model-name-picker">
            <el-select
              v-model="providerForm.model_name"
              filterable
              allow-create
              default-first-option
              placeholder="请输入或选择模型"
            >
              <el-option v-for="model in availableModels" :key="model" :label="model" :value="model" />
            </el-select>
            <el-button :loading="modelListLoading" @click="fetchAvailableModels">获取模型列表</el-button>
          </el-space>
        </el-form-item>
        <el-form-item label="max_tokens"><el-input-number v-model="providerForm.max_tokens" :min="1" /></el-form-item>
        <el-form-item label="temperature"><el-input-number v-model="providerForm.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
        <el-form-item label="top_p"><el-input-number v-model="providerForm.top_p" :min="0" :max="1" :step="0.1" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="providerForm.is_active" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProvider">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Hide, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  bulkUpsertModelUsages,
  createModelProvider,
  deleteModelProvider,
  getModelProviderAvailableModels,
  getModelProviders,
  getModelUsages,
  previewModelProviderAvailableModels,
  revealModelProviderApiKey,
  testModelProviderConnection,
  updateModelProvider
} from '@/api/requirement-analysis'
import {
  getApiKeyDisplayValue,
  getApiKeyPlaceholder,
  getModelFetchMode,
  normalizeAvailableModels,
  shouldSubmitApiKey
} from './modelProviderForm'

const activeTab = ref('providers')
const providers = ref([])
const usages = ref([])
const providerLoading = ref(false)
const providerDialogVisible = ref(false)
const apiKeyRevealLoading = ref(false)
const modelListLoading = ref(false)
const availableModels = ref([])

const providerTypes = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '通义千问', value: 'qwen' },
  { label: '硅基流动', value: 'siliconflow' },
  { label: '智谱', value: 'zhipu' },
  { label: '小米', value: 'xiaomi' },
  { label: 'OpenAI Compatible', value: 'openai_compatible' },
  { label: '其他', value: 'other' }
]

const testcaseUsageRows = reactive([
  { usage_type: 'requirement_reviewer', label: '需求评审专家', model_provider: null },
  { usage_type: 'requirement_analyzer', label: '需求分析专家', model_provider: null },
  { usage_type: 'testcase_writer', label: '测试用例编写专家', model_provider: null },
  { usage_type: 'testcase_reviewer', label: '测试用例评审专家', model_provider: null }
])

const browserUsageRows = reactive([
  { usage_type: 'browser_use_text', label: 'Browser Use 文本模式', model_provider: null },
  { usage_type: 'browser_use_vision', label: 'Browser Use 视觉模式', model_provider: null, reserved: true }
])

const providerForm = reactive(defaultProviderForm())

const activeProviders = computed(() => providers.value.filter((provider) => provider.is_active))
const apiKeyPlaceholder = computed(() => getApiKeyPlaceholder(providerForm))
const apiKeyInputValue = computed({
  get: () => getApiKeyDisplayValue(providerForm),
  set: (value) => {
    providerForm.api_key = value
  }
})

function defaultProviderForm() {
  return {
    id: null,
    name: '',
    provider_type: 'openai_compatible',
    api_key: '',
    api_key_dirty: false,
    api_key_visible: false,
    base_url: '',
    base_url_dirty: false,
    provider_type_dirty: false,
    model_name: '',
    max_tokens: 4096,
    temperature: 0.7,
    top_p: 0.9,
    is_active: true
  }
}

async function loadProviders() {
  providerLoading.value = true
  try {
    const response = await getModelProviders()
    providers.value = response.data.results || response.data || []
  } finally {
    providerLoading.value = false
  }
}

async function loadUsages() {
  const response = await getModelUsages()
  usages.value = response.data.results || response.data || []
  syncUsageRows(testcaseUsageRows)
  syncUsageRows(browserUsageRows)
}

function syncUsageRows(rows) {
  rows.forEach((row) => {
    const usage = usages.value.find((item) => item.usage_type === row.usage_type)
    row.id = usage?.id
    row.model_provider = usage?.model_provider || null
    row.model_provider_status = usage?.model_provider_status
  })
}

function handleTabChange(tabName) {
  if (tabName !== 'providers') {
    loadProviders()
    loadUsages()
  }
}

function getUsageStatus(row) {
  if (!row.model_provider) return { type: 'warning', text: '未配置' }
  const provider = providers.value.find((item) => item.id === row.model_provider)
  if (!provider) return { type: 'danger', text: '模型不存在' }
  if (!provider.is_active) return { type: 'danger', text: '模型已禁用' }
  return { type: 'success', text: '已配置' }
}

function openProviderDialog(row) {
  Object.assign(providerForm, defaultProviderForm(), row || {})
  providerForm.api_key = ''
  providerForm.api_key_dirty = false
  providerForm.api_key_visible = false
  providerForm.base_url_dirty = false
  providerForm.provider_type_dirty = false
  availableModels.value = providerForm.model_name ? [providerForm.model_name] : []
  providerDialogVisible.value = true
}

function markApiKeyDirty() {
  providerForm.api_key_dirty = true
  providerForm.api_key_visible = true
}

function markBaseUrlDirty() {
  providerForm.base_url_dirty = true
}

function markProviderTypeDirty() {
  providerForm.provider_type_dirty = true
}

async function fetchAvailableModels() {
  const mode = getModelFetchMode(providerForm)
  const payload = { ...providerForm }

  if (mode === 'preview' && providerForm.id && !providerForm.api_key_dirty) {
    if (!providerForm.api_key_visible || !providerForm.api_key) {
      ElMessage.warning('请先点击 API Key 右侧眼睛图标获取明文，或输入新的 API Key')
      return
    }
  }

  if (mode === 'preview' && (!payload.api_key || !payload.base_url || !payload.provider_type)) {
    ElMessage.warning('请先填写模型提供商、API Key 和 Base URL')
    return
  }

  modelListLoading.value = true
  try {
    const response = mode === 'saved'
      ? await getModelProviderAvailableModels(providerForm.id)
      : await previewModelProviderAvailableModels(payload)
    availableModels.value = normalizeAvailableModels(response.data.models)
    if (availableModels.value.length) {
      ElMessage.success(response.data.message || `成功获取${availableModels.value.length}个模型`)
    } else {
      ElMessage.warning('未获取到可用模型，请检查接口是否支持模型列表')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '获取模型列表失败')
  } finally {
    modelListLoading.value = false
  }
}

async function toggleApiKeyVisibility() {
  if (!providerForm.id) return
  if (providerForm.api_key_visible) {
    providerForm.api_key_visible = false
    return
  }

  apiKeyRevealLoading.value = true
  try {
    const response = await revealModelProviderApiKey(providerForm.id)
    providerForm.api_key = response.data.api_key || ''
    providerForm.api_key_visible = true
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '获取 API Key 失败')
  } finally {
    apiKeyRevealLoading.value = false
  }
}

async function saveProvider() {
  const payload = { ...providerForm }
  delete payload.api_key_dirty
  delete payload.api_key_visible
  delete payload.base_url_dirty
  delete payload.provider_type_dirty
  if (!shouldSubmitApiKey(providerForm)) delete payload.api_key
  if (payload.id) await updateModelProvider(payload.id, payload)
  else await createModelProvider(payload)
  ElMessage.success('模型配置已保存')
  providerDialogVisible.value = false
  await loadProviders()
}

async function toggleProvider(row) {
  await updateModelProvider(row.id, { is_active: row.is_active })
  ElMessage.success(row.is_active ? '模型已启用' : '模型已禁用')
  await loadProviders()
}

async function removeProvider(row) {
  try {
    await ElMessageBox.confirm(`确认删除模型“${row.name}”？`, '删除确认', { type: 'warning' })
    await deleteModelProvider(row.id)
    ElMessage.success('模型已删除')
    await loadProviders()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || '删除失败')
    }
  }
}

async function testConnection(row) {
  try {
    const response = await testModelProviderConnection(row.id)
    ElMessage.success(response.data.message || '连接测试成功')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '连接测试失败')
  }
}

async function saveTestcaseUsages() {
  await saveUsageRows(testcaseUsageRows)
  ElMessage.success('AI 用例模型配置已保存')
}

async function saveBrowserUsages() {
  await saveUsageRows(browserUsageRows.filter((row) => !row.reserved))
  ElMessage.success('AI 智能模式配置已保存')
}

async function saveUsageRows(rows) {
  const usagesPayload = rows
    .filter((row) => row.model_provider)
    .map((row) => ({ usage_type: row.usage_type, model_provider: row.model_provider }))
  await bulkUpsertModelUsages(usagesPayload)
  await loadUsages()
  await loadProviders()
}

onMounted(async () => {
  await loadProviders()
  await loadUsages()
})
</script>

<style scoped>
.model-management {
  padding: 20px;
}
.toolbar,
.actions {
  margin-bottom: 16px;
}
.actions {
  margin-top: 16px;
}
.model-name-picker {
  width: 100%;
}
.model-name-picker :deep(.el-select) {
  flex: 1;
  min-width: 0;
}
</style>
