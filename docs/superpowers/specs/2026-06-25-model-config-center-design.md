# 模型配置中心设计

## 背景

当前配置中心中存在两类模型配置入口：

- AI 用例模型配置：用于需求评审、需求分析、测试用例编写、测试用例评审等角色。
- AI 智能模式配置：用于 UI 自动化 Browser Use 文本模式。

两者都与 AI 模型调用相关，但目前模型连接信息和业务用途绑定混在一起，导致同一个模型可能需要在不同业务入口重复配置 API Key、Base URL、模型名称和参数。

本设计目标是新增统一的模型管理能力：先在配置中心维护可复用的模型池，AI 用例模型配置、AI 智能模式配置等业务场景只选择模型池中的模型。

## 目标

1. 在配置中心提供统一的模型管理页面。
2. 将“模型连接信息”和“业务用途绑定”解耦。
3. AI 用例生成流程从用途绑定中读取模型。
4. AI 智能模式从用途绑定中读取模型。
5. 避免不同业务场景重复配置同一个模型。
6. 提供清晰的缺失配置、禁用模型、删除引用模型等错误提示。

## 非目标

本次不包含以下内容：

- 历史数据兼容或旧数据迁移。项目尚未推广使用，可直接采用新结构。
- 多租户或项目级模型隔离。
- 每个业务用途配置多个候选模型并自动 fallback。
- API Key 查看权限细分。
- Browser Use 视觉模式真实执行能力。

## 信息架构

配置中心中的模型相关功能归并到“模型管理”下。

推荐前端结构：

```text
配置中心
- 模型管理
  - 模型列表
  - AI 用例模型配置
  - AI 智能模式配置
- 提示词配置
- 生成行为配置
- UI 环境配置
- APP 环境配置
- 通知配置
- Dify 配置
```

页面表现采用“模型管理”页面内 Tabs：

```text
模型列表 | AI 用例模型配置 | AI 智能模式配置
```

这样用户可以先添加模型，再在同一模块中为不同业务场景选择模型。

## 后端数据模型

### AIModelProvider

新增模型池表，只保存模型调用信息，不包含业务角色语义。

字段：

```text
id
name                配置名称，例如“DeepSeek Chat”
provider_type       deepseek / qwen / siliconflow / zhipu / xiaomi / openai_compatible / other
api_key
base_url
model_name
max_tokens
temperature
top_p
is_active
created_by
created_at
updated_at
```

职责：

- 表达“这个模型如何调用”。
- 支持新增、编辑、删除、启用/禁用、连接测试、获取可用模型列表。
- 不表达“这个模型用于需求评审还是 Browser Use”。

### AIModelUsageConfig

新增业务用途绑定表，只表达“某个业务用途选择哪个模型”。

字段：

```text
id
usage_type
model_provider      ForeignKey -> AIModelProvider
is_active
created_by
created_at
updated_at
```

支持的 `usage_type`：

```text
requirement_reviewer      需求评审专家
requirement_analyzer      需求分析专家
testcase_writer           测试用例编写专家
testcase_reviewer         测试用例评审专家
browser_use_text          Browser Use 文本模式
browser_use_vision        Browser Use 视觉模式，预留
```

约束：

- 每个 `usage_type` 最多一条绑定记录。
- 保存绑定时只允许选择启用状态的模型。
- 删除模型前，如果该模型被任何用途绑定引用，则禁止删除，并返回引用的用途名称。

### 测试用例生成任务模型调整

测试用例生成任务需要保存任务创建时实际使用的模型，便于追溯。

新增或替换字段：

```text
requirement_reviewer_model_provider
requirement_analyzer_model_provider
writer_model_provider
reviewer_model_provider
```

这些字段均指向 `AIModelProvider`。

## 后端接口

接口统一放在 requirement_analysis 模块下。

### 模型池接口

```text
GET    /api/requirement-analysis/model-providers/
POST   /api/requirement-analysis/model-providers/
GET    /api/requirement-analysis/model-providers/{id}/
PATCH  /api/requirement-analysis/model-providers/{id}/
DELETE /api/requirement-analysis/model-providers/{id}/
POST   /api/requirement-analysis/model-providers/{id}/test_connection/
GET    /api/requirement-analysis/model-providers/{id}/available_models/
POST   /api/requirement-analysis/model-providers/available_models/
```

行为：

- 创建/编辑模型时保存连接信息和参数。
- 编辑时如果未传 API Key，则不覆盖原 API Key。
- 删除时检查是否被用途绑定引用。
- 连接测试沿用 OpenAI-compatible 调用方式。
- 获取模型列表复用现有 `/models` 查询逻辑。

### 用途绑定接口

```text
GET   /api/requirement-analysis/model-usages/
POST  /api/requirement-analysis/model-usages/
PATCH /api/requirement-analysis/model-usages/{id}/
GET   /api/requirement-analysis/model-usages/by_usage/?usage_type=testcase_writer
POST  /api/requirement-analysis/model-usages/bulk_upsert/
```

批量保存示例：

```json
{
  "usages": [
    {
      "usage_type": "requirement_reviewer",
      "model_provider": 1
    },
    {
      "usage_type": "requirement_analyzer",
      "model_provider": 2
    },
    {
      "usage_type": "testcase_writer",
      "model_provider": 1
    },
    {
      "usage_type": "testcase_reviewer",
      "model_provider": 3
    }
  ]
}
```

## 前端设计

### 模型管理页面

路径建议：

```text
/configuration/models
```

页面内部使用 Tabs：

```text
模型列表 | AI 用例模型配置 | AI 智能模式配置
```

### Tab 1：模型列表

功能：

- 展示模型池列表。
- 新增模型。
- 编辑模型。
- 删除模型。
- 启用/禁用模型。
- 测试连接。
- 获取可用模型并选择 `model_name`。

展示字段：

- 配置名称
- 模型提供商
- 模型名称
- Base URL
- max_tokens
- temperature
- top_p
- 启用状态
- 是否被业务使用

这里不展示业务角色字段。

### Tab 2：AI 用例模型配置

功能：为 AI 用例生成流程中的四个用途选择模型。

展示结构：

| 用途 | 当前模型 | 状态 | 操作 |
| --- | --- | --- | --- |
| 需求评审专家 | DeepSeek Chat | 已配置 | 更换 |
| 需求分析专家 | Qwen Max | 已配置 | 更换 |
| 测试用例编写专家 | DeepSeek Reasoner | 已配置 | 更换 |
| 测试用例评审专家 | DeepSeek Chat | 已配置 | 更换 |

行为：

- “更换”时只能选择启用的模型。
- 支持一次性保存四个用途绑定。
- 未配置时显示“未配置”。
- 如果后端返回绑定模型禁用或不存在，显示明确异常状态。

### Tab 3：AI 智能模式配置

功能：为 Browser Use AI 智能模式选择模型。

展示结构：

| 用途 | 当前模型 | 状态 | 操作 |
| --- | --- | --- | --- |
| Browser Use 文本模式 | Kimi / DeepSeek / OpenAI Compatible | 已配置 | 更换 |
| Browser Use 视觉模式 | 暂未开放 | 预留 | - |

行为：

- 文本模式可以选择启用模型并保存。
- 视觉模式暂时只预留展示或不显示，避免误导用户配置后即可使用。

## 运行时调用流

### AI 用例生成

```text
前端提交需求文本
  -> 后端读取 AIModelUsageConfig 中的 4 个用途绑定
  -> 校验绑定存在
  -> 校验绑定模型启用
  -> 创建 TestCaseGenerationTask，并保存当时使用的 4 个模型
  -> 后台任务使用对应 AIModelProvider 执行：
     需求评审 -> 需求分析 -> 用例生成 -> 用例评审/改进
```

### AI 智能模式

```text
启动 AI 智能模式
  -> 后端读取 usage_type = browser_use_text 的绑定
  -> 校验绑定存在
  -> 校验绑定模型启用
  -> 使用 AIModelProvider 初始化 ChatOpenAI / browser-use Agent
```

## 错误处理

### 没有模型池

提示：

```text
请先在“模型管理 - 模型列表”中添加并启用至少一个模型
```

### 业务用途未绑定模型

例如缺少用例编写模型：

```text
AI 用例模型配置不完整：请为“测试用例编写专家”选择模型
```

### 绑定的模型被禁用

提示：

```text
“测试用例编写专家”绑定的模型已禁用，请启用该模型或重新选择
```

### 删除被引用模型

禁止删除并提示：

```text
该模型正在被以下配置使用：测试用例编写专家、Browser Use 文本模式。请先更换绑定后再删除。
```

### 连接测试失败

展示后端返回的具体失败原因：

```text
连接失败：HTTP 状态码 / 超时 / API 返回内容
```

## 测试策略

### 后端测试

- 模型池 CRUD：
  - 新增模型成功。
  - 编辑模型时未传 API Key 不覆盖原值。
  - 删除被用途绑定引用的模型失败。
  - 删除未引用模型成功。
- 用途绑定：
  - 每个用途只能绑定一个模型。
  - 保存用途绑定时拒绝禁用模型。
  - 批量保存 AI 用例模型绑定成功。
- 运行时校验：
  - 缺少某个 AI 用例角色绑定时，生成任务返回明确错误。
  - 绑定模型被禁用时，生成任务返回明确错误。
  - AI 智能模式缺少 `browser_use_text` 绑定时，返回明确错误。
- 连接测试：
  - 使用模型池配置调用 OpenAI-compatible 测试逻辑。

### 前端测试

- 模型管理 Tabs 能正常切换。
- 新增模型后能在 AI 用例模型配置和 AI 智能模式配置中被选择。
- 禁用模型后，绑定选择中不可选，已绑定处显示异常状态。
- 删除被引用模型时显示后端返回的引用说明。
- AI 用例模型配置保存后刷新仍显示正确模型。
- AI 智能模式配置保存后 Browser Use 能读取对应模型。

### 回归测试

- 测试用例生成流程仍能创建任务并读取 4 个模型配置。
- UI 自动化 AI 智能模式仍能初始化模型。
- 配置状态检查接口能正确发现缺失配置。

## 实施备注

- 本项目当前尚未推广使用，因此不做旧模型配置数据兼容。
- 现有 `AIModelConfig` 中角色型设计可以被新模型替换或废弃。
- 代码实现时应避免同时保留两套可配置入口造成用户困惑。
