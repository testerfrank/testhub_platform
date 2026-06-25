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
          <el-select v-model="providerForm.provider_type">
            <el-option v-for="item in providerTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key" :required="!providerForm.id"><el-input v-model="providerForm.api_key" type="password" show-password /></el-form-item>
        <el-form-item label="Base URL" required><el-input v-model="providerForm.base_url" /></el-form-item>
        <el-form-item label="模型名称" required><el-input v-model="providerForm.model_name" /></el-form-item>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  bulkUpsertModelUsages,
  createModelProvider,
  deleteModelProvider,
  getModelProviders,
  getModelUsages,
  testModelProviderConnection,
  updateModelProvider
} from '@/api/requirement-analysis'

const activeTab = ref('providers')
const providers = ref([])
const usages = ref([])
const providerLoading = ref(false)
const providerDialogVisible = ref(false)

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

function defaultProviderForm() {
  return {
    id: null,
    name: '',
    provider_type: 'openai_compatible',
    api_key: '',
    base_url: '',
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
  providerDialogVisible.value = true
}

async function saveProvider() {
  const payload = { ...providerForm }
  if (payload.id && !payload.api_key) delete payload.api_key
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
</style>
