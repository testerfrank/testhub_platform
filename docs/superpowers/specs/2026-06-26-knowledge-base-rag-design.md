# 项目级知识库与 RAG 能力设计

## 背景

当前 TestHub 已具备 AI 需求评审、需求分析、用例编写、用例评审、模型用途配置等能力。但需求文档通常只覆盖局部功能描述，缺少真实业务背景、历史规则、异常场景、历史缺陷、工单上下文和既有测试经验。仅基于单份需求文档生成的分析结论和测试用例，容易出现以下问题：

- 用例只覆盖文档显式描述，缺少隐含业务规则。
- AI 难以识别需求与历史业务规则之间的冲突。
- 缺少历史缺陷、工单、线上问题沉淀，异常场景覆盖不足。
- 用例表达通用化，不贴合项目真实业务流程。
- 需求评审和用例评审缺少可追溯背景依据。

因此需要新增项目级知识库，沉淀业务资料，并在 AI 需求评审、需求分析、用例设计、用例编写、用例评审时作为背景知识自动召回。

## 目标

1. 新增项目级知识库，每个项目维护独立业务知识，避免跨项目知识污染。
2. 第一阶段优先支持人工上传和维护知识资料。
3. 上传资料后由 AI 自动整理为结构化业务知识。
4. 使用 Qdrant 作为向量检索后端，建立专业 RAG 架构。
5. 在需求评审、需求分析、用例设计、用例编写、用例评审中自动召回相关知识。
6. AI 输出展示引用来源，让用户知道本次分析或生成参考了哪些知识。
7. 数据结构为后续接入历史用例、缺陷、工单、执行记录、评审意见和知识图谱预留扩展空间。

## 非目标

第一阶段不包含以下能力：

- 跨项目共享知识库。
- 知识图谱可视化。
- 实体关系推理。
- 自动判断知识是否过期。
- 自动合并重复或冲突知识。
- 片段级权限控制。
- 用户在每次 AI 生成前手动勾选或排除知识片段。
- 平台历史用例、缺陷、工单、执行记录的自动同步入库。

这些能力可以作为后续阶段扩展。

## 总体架构

新增独立 Django app：

```text
apps/knowledge_base/
```

该 app 负责知识库完整生命周期：

```text
知识上传
  ↓
文本提取
  ↓
AI 结构化整理
  ↓
知识切片
  ↓
Embedding 生成
  ↓
写入 MySQL + Qdrant
  ↓
混合检索召回
  ↓
注入需求评审 / 需求分析 / 用例设计 / 用例编写 / 用例评审 Prompt
  ↓
AI 输出展示引用来源
```

核心组件：

```text
Django / MySQL
- 知识文档元数据
- 知识片段元数据
- AI 整理结果
- 标签、业务域、模块、知识类型
- Qdrant point_id 映射
- 处理任务状态
- 引用记录

Qdrant
- 存储知识片段 embedding
- 通过 project_id、知识类型、模块、标签等 payload 过滤
- 执行语义召回

AI 模型服务
- 复用现有模型管理中心
- 新增知识整理模型用途
- 新增 embedding 模型用途
- 预留 rerank 模型用途

知识召回服务
- 根据当前需求或用例上下文生成查询
- 执行关键词、标签、结构化字段和向量混合召回
- 对候选结果重排
- 返回 Top N 知识片段与引用来源

AI 业务流程
- 需求评审、需求分析、用例设计、用例编写、用例评审调用知识召回服务
- Prompt 中增加业务背景知识段
- 保存 AI 输出和知识引用关系
```

## 与现有模块关系

### `projects`

知识库按项目隔离。每个知识文档和知识片段都归属于一个项目。

AI 处理某个项目下的需求或用例时，默认只召回该项目知识。

### `requirement_analysis`

继续负责：

- 需求文档分析。
- 需求评审。
- 需求分析。
- 用例生成任务。
- 用例评审。
- Prompt 配置。
- 模型用途配置。

改造点：

- AI 调用前根据项目和当前上下文调用知识召回服务。
- Prompt 中增加“项目业务背景知识”区域。
- 保存本次 AI 结果引用的知识片段。
- 前端展示引用来源。

### `testcases`、`reviews`、`executions`

第一阶段不主动同步这些模块的数据到知识库。

后续可以作为知识来源类型接入：

```text
manual_testcase
ai_generated_testcase
defect
execution_result
review_comment
ticket
```

## 模型用途配置扩展

现有模型管理中心已经支持业务用途绑定。需要新增以下用途类型：

```text
knowledge_organizer       知识整理模型
knowledge_embedding       知识向量化模型
knowledge_reranker        知识重排模型，预留
```

### `knowledge_organizer`

用于对上传资料进行结构化整理，提取：

- 文档摘要。
- 业务域。
- 模块。
- 业务流程。
- 业务规则。
- 角色权限。
- 数据约束。
- 异常场景。
- 接口或页面线索。
- 测试关注点。
- 历史风险点。
- 关键词和标签。

### `knowledge_embedding`

用于生成文档片段 embedding。

要求：

- embedding 模型维度需要记录在模型配置或知识库配置中。
- Qdrant collection 的向量维度必须与 embedding 模型输出维度一致。
- 更换 embedding 模型维度时，需要新建 collection 或触发重建索引任务。

### `knowledge_reranker`

第一阶段可先不实现真实 rerank 模型，但在用途配置中预留，后续可用于提升召回排序质量。

## 数据模型设计

### KnowledgeDocument

知识文档表，保存上传资料和 AI 整理状态。

```text
id
project                  ForeignKey -> Project
title                    文档标题
source_type              uploaded_document / manual_text / imported_ticket / imported_defect / imported_testcase / other
file                     上传文件，可为空
file_name
file_type                pdf / docx / txt / md / xlsx / csv / html / json / other
file_size
status                   uploaded / extracting / organizing / chunking / embedding / indexed / failed
language                 zh / en / mixed / unknown
summary                  AI 生成摘要
business_domain          业务域
module                   模块
version                  知识版本，默认 1
is_active                是否参与召回
error_message            处理失败原因
created_by               ForeignKey -> User
created_at
updated_at
```

说明：

- `project` 是第一阶段最重要的隔离字段。
- `is_active=false` 时，该文档及其片段不参与召回。
- `source_type` 为后续导入平台内部数据预留。

### KnowledgeStructuredItem

AI 整理出的结构化业务知识。

```text
id
document                 ForeignKey -> KnowledgeDocument
project                  ForeignKey -> Project
item_type                business_rule / business_process / role_permission / data_constraint / exception_scenario / interface_rule / page_rule / test_focus / risk_point / term / other
title                    结构化知识标题
content                  结构化知识正文
module                   模块
business_domain          业务域
entities                 JSON，预留实体信息
relations                JSON，预留关系信息
confidence               AI 置信度
source_excerpt           来源原文摘录
source_location          页码、段落、sheet、行号等来源位置
created_at
updated_at
```

说明：

- 该表承载“AI 结构化整理”的结果。
- `entities` 和 `relations` 第一阶段只保存 JSON，不做图谱推理。
- 后续知识图谱可从这些字段中抽取实体关系。

### KnowledgeChunk

知识片段表，保存用于召回的最小知识单元。

```text
id
document                 ForeignKey -> KnowledgeDocument
structured_item          ForeignKey -> KnowledgeStructuredItem，可为空
project                  ForeignKey -> Project
chunk_index              文档内片段序号
content                  原文片段或结构化知识片段
summary                  片段摘要
chunk_type               raw_text / structured_item / table_row / qa_pair / rule / scenario
tokens                   估算 token 数
keywords                 JSON 数组
tags                     JSON 数组
module                   模块
business_domain          业务域
knowledge_types          JSON 数组
qdrant_collection        Qdrant collection 名称
qdrant_point_id          Qdrant point id
embedding_model          embedding 模型名称或配置 id
embedding_dim            向量维度
is_active                是否参与召回
created_at
updated_at
```

说明：

- `content` 是最终注入 Prompt 的主要文本。
- `summary` 用于引用展示和召回结果摘要。
- `qdrant_point_id` 用于 MySQL 与 Qdrant 之间建立映射。

### KnowledgeIngestionTask

知识处理任务表。

```text
id
task_id                  唯一任务 ID
project                  ForeignKey -> Project
document                 ForeignKey -> KnowledgeDocument
task_type                extract / organize / chunk / embed / index / rebuild_index
status                   pending / running / completed / failed
progress                 0-100
result                   JSON
error_message
started_at
completed_at
created_at
```

说明：

- 上传文档后创建处理任务。
- 任务可拆为多个阶段，也可用一个主任务记录整体进度。
- 第一阶段可以先同步执行或后台线程执行；后续再接入 Celery。

### KnowledgeCitation

知识引用记录表，保存 AI 输出与知识片段之间的引用关系。

```text
id
project                  ForeignKey -> Project
scenario                 requirement_review / requirement_analysis / testcase_design / testcase_generation / testcase_review
object_type              requirement_document / business_requirement / generated_testcase / review_task / other
object_id                业务对象 ID
chunk                    ForeignKey -> KnowledgeChunk
score                    最终召回分数
vector_score             向量相似度分数
keyword_score            关键词匹配分数
rank                     排名
quoted_content           注入 Prompt 时实际使用的内容
created_at
```

说明：

- 用于展示“AI 参考了哪些知识”。
- 也用于后续分析哪些知识被频繁引用。

## Qdrant 设计

### Collection 策略

推荐第一阶段使用单 collection：

```text
testhub_knowledge_chunks
```

所有项目的知识片段写入同一个 collection，通过 payload 中的 `project_id` 做过滤。

优点：

- 管理简单。
- 不需要为每个项目创建 collection。
- Qdrant payload filter 可以满足项目级隔离。

如果后续项目数量或数据量很大，可演进为：

```text
testhub_knowledge_chunks_{project_id}
```

### Vector 配置

```text
vector_name: default
size: 由 embedding 模型维度决定
distance: Cosine
```

### Payload 字段

每个 Qdrant point 保存以下 payload：

```json
{
  "project_id": 1,
  "document_id": 10,
  "chunk_id": 1001,
  "structured_item_id": 501,
  "source_type": "uploaded_document",
  "file_type": "docx",
  "chunk_type": "structured_item",
  "module": "订单管理",
  "business_domain": "电商交易",
  "knowledge_types": ["business_rule", "exception_scenario"],
  "tags": ["退款", "订单状态", "权限"],
  "keywords": ["退款", "审核", "订单取消"],
  "is_active": true,
  "created_at": "2026-06-26T10:00:00+08:00",
  "updated_at": "2026-06-26T10:00:00+08:00"
}
```

召回时必须添加过滤条件：

```text
project_id = 当前项目 ID
is_active = true
```

可选过滤条件：

```text
module
business_domain
knowledge_types
tags
source_type
```

## AI 知识整理流程

### 处理阶段

```text
1. 上传文档
2. 保存 KnowledgeDocument，状态 uploaded
3. 文本提取，状态 extracting
4. AI 结构化整理，状态 organizing
5. 切片，状态 chunking
6. 生成 embedding，状态 embedding
7. 写入 Qdrant，状态 indexed
8. 失败则状态 failed，并记录 error_message
```

### 文本提取

复用或抽象现有文档提取能力，支持：

- PDF。
- Word。
- TXT。
- Markdown。
- Excel / CSV。
- JSON。
- HTML。

Excel 和 CSV 需要保留 sheet、行号、列名等来源位置，便于引用追溯。

### AI 结构化整理输出格式

知识整理模型输出结构建议为：

```json
{
  "summary": "文档整体摘要",
  "business_domain": "业务域",
  "modules": ["模块A", "模块B"],
  "tags": ["标签1", "标签2"],
  "items": [
    {
      "item_type": "business_rule",
      "title": "退款审核规则",
      "content": "当订单状态为已发货时，用户提交退款需要进入人工审核。",
      "module": "订单管理",
      "business_domain": "电商交易",
      "keywords": ["退款", "人工审核", "已发货"],
      "tags": ["订单", "售后"],
      "confidence": 0.88,
      "source_excerpt": "来源原文摘录",
      "source_location": "第 3 页，第 2 段",
      "entities": [
        {"type": "status", "name": "已发货"},
        {"type": "process", "name": "人工审核"}
      ],
      "relations": [
        {"from": "已发货", "relation": "requires", "to": "人工审核"}
      ]
    }
  ]
}
```

### 知识类型

第一阶段支持以下结构化知识类型：

```text
business_rule        业务规则
business_process     业务流程
role_permission      角色权限
data_constraint      数据约束
exception_scenario   异常场景
interface_rule       接口规则
page_rule            页面规则
test_focus           测试关注点
risk_point           风险点
term                 术语
other                其他
```

### 切片策略

切片优先级：

1. 结构化知识项作为高质量片段。
2. 原文按标题、段落、表格行进行补充切片。
3. 片段大小控制在适合 Prompt 注入和 embedding 的长度。
4. 保留重叠上下文，避免切断业务规则。

推荐默认：

```text
chunk_size: 800-1200 中文字符
chunk_overlap: 100-200 中文字符
top_k: 8-12
```

可在系统配置中调整。

## 混合召回策略

### 输入

知识召回服务接收：

```text
project_id
scenario
query_text
module，可选
business_domain，可选
requirement_type，可选
limit，默认 8-12
```

`scenario` 用于决定召回偏好：

```text
requirement_review
requirement_analysis
testcase_design
testcase_generation
testcase_review
```

### 不同场景的召回侧重点

#### 需求评审

重点召回：

- 业务规则。
- 业务流程。
- 数据约束。
- 角色权限。
- 历史风险点。
- 异常场景。

目标：识别需求遗漏、冲突、不明确和验收标准不足。

#### 需求分析

重点召回：

- 业务流程。
- 模块说明。
- 术语。
- 接口规则。
- 页面规则。
- 数据约束。

目标：帮助 AI 拆分需求、补齐业务上下文和上下游影响。

#### 用例设计

重点召回：

- 业务流程。
- 异常场景。
- 风险点。
- 测试关注点。
- 数据约束。

目标：形成覆盖策略和测试点。

#### 用例编写

重点召回：

- 业务规则。
- 异常场景。
- 角色权限。
- 数据约束。
- 接口/页面规则。

目标：生成更贴合业务的前置条件、操作步骤和预期结果。

#### 用例评审

重点召回：

- 业务规则。
- 测试关注点。
- 风险点。
- 历史异常场景。

目标：检查用例是否遗漏关键规则、异常路径、权限边界和数据约束。

### 召回流程

```text
1. 根据 query_text 生成查询 embedding。
2. 使用 project_id 和 is_active 过滤 Qdrant。
3. 加入模块、业务域、知识类型等 payload 过滤或加权。
4. Qdrant 返回向量候选。
5. MySQL 关键词、标签、模块匹配返回候选。
6. 合并候选并去重。
7. 计算最终分数。
8. 按 scenario 对知识类型加权。
9. 返回 Top N。
```

### 分数设计

第一阶段可使用简单加权：

```text
final_score = vector_score * 0.6
            + keyword_score * 0.2
            + tag_score * 0.1
            + scenario_type_weight * 0.1
```

后续可接入 rerank 模型替代简单加权。

## Prompt 注入设计

在 AI 调用前，将召回知识整理成独立上下文段：

```text
## 项目业务背景知识
以下知识来自项目知识库，可能与当前需求相关。请优先参考这些知识进行分析，但不要编造未出现的规则。如果知识与需求文档冲突，请明确指出冲突点。

[知识 1]
来源：订单售后规则说明.docx / 第 3 页第 2 段
类型：业务规则
模块：订单管理
内容：当订单状态为已发货时，用户提交退款需要进入人工审核。

[知识 2]
来源：历史缺陷导出.xlsx / Sheet1 第 18 行
类型：风险点
模块：订单管理
内容：历史上出现过取消订单后库存未回滚的问题。
```

AI 输出要求增加：

```text
## 参考知识
- 订单售后规则说明.docx / 第 3 页第 2 段 / 业务规则
- 历史缺陷导出.xlsx / Sheet1 第 18 行 / 风险点
```

系统同时保存 `KnowledgeCitation`，不只依赖模型文本输出。

## API 设计

### 知识文档接口

```text
GET    /api/knowledge-base/documents/?project={project_id}
POST   /api/knowledge-base/documents/
GET    /api/knowledge-base/documents/{id}/
PATCH  /api/knowledge-base/documents/{id}/
DELETE /api/knowledge-base/documents/{id}/
POST   /api/knowledge-base/documents/{id}/reprocess/
POST   /api/knowledge-base/documents/{id}/enable/
POST   /api/knowledge-base/documents/{id}/disable/
```

### 结构化知识接口

```text
GET    /api/knowledge-base/structured-items/?project={project_id}&document={document_id}
GET    /api/knowledge-base/structured-items/{id}/
PATCH  /api/knowledge-base/structured-items/{id}/
```

第一阶段允许用户查看和少量修正 AI 整理结果。

### 知识片段接口

```text
GET    /api/knowledge-base/chunks/?project={project_id}&document={document_id}
GET    /api/knowledge-base/chunks/{id}/
PATCH  /api/knowledge-base/chunks/{id}/
```

### 检索接口

```text
POST /api/knowledge-base/retrieve/
```

请求示例：

```json
{
  "project": 1,
  "scenario": "testcase_generation",
  "query_text": "用户在订单已发货状态下申请退款，需要生成测试用例",
  "module": "订单管理",
  "limit": 10
}
```

响应示例：

```json
{
  "results": [
    {
      "chunk_id": 1001,
      "document_id": 10,
      "title": "退款审核规则",
      "content": "当订单状态为已发货时，用户提交退款需要进入人工审核。",
      "summary": "已发货订单退款需人工审核",
      "source": "订单售后规则说明.docx / 第 3 页第 2 段",
      "module": "订单管理",
      "knowledge_types": ["business_rule"],
      "score": 0.91
    }
  ]
}
```

### 引用接口

```text
GET /api/knowledge-base/citations/?scenario={scenario}&object_type={object_type}&object_id={object_id}
```

用于前端展示 AI 结果参考来源。

## 前端设计

### 入口

推荐放在项目详情下：

```text
项目详情
- 概览
- 需求
- 用例
- 执行
- 知识库
```

理由：知识库是项目级数据，不是全局配置。

### 知识库页面

页面结构：

```text
知识库
- 文档列表
- 上传知识
- AI 整理结果
- 知识片段
- 引用历史
```

### 文档列表

展示字段：

- 文档标题。
- 文件类型。
- 来源类型。
- 业务域。
- 模块。
- 状态。
- 是否启用。
- 上传人。
- 更新时间。
- 操作：查看、重新处理、启用/禁用、删除。

### 上传知识

上传表单字段：

- 所属项目。
- 文档标题。
- 文件。
- 业务域，可选。
- 模块，可选。
- 标签，可选。
- 是否上传后立即处理。

### AI 整理结果

按知识类型分组展示：

```text
业务规则
业务流程
角色权限
数据约束
异常场景
接口规则
页面规则
测试关注点
风险点
术语
```

每条结构化知识展示：

- 标题。
- 内容。
- 模块。
- 标签。
- 置信度。
- 来源摘录。
- 来源位置。

允许用户进行轻量编辑，例如修正标题、内容、模块、标签、是否启用。

### 知识片段

用于排查召回效果，展示：

- 片段内容。
- 摘要。
- 类型。
- 标签。
- Qdrant point id。
- 是否启用。

### 引用历史

展示某个 AI 结果引用过哪些知识：

- AI 场景。
- 业务对象。
- 知识文档。
- 知识片段。
- 分数。
- 引用时间。

### AI 输出引用展示

在需求评审、需求分析、用例生成、用例评审结果页增加区域：

```text
参考知识来源
- 订单售后规则说明.docx / 第 3 页第 2 段 / 业务规则
- 历史缺陷导出.xlsx / Sheet1 第 18 行 / 风险点
```

点击可打开知识片段详情。

## 错误处理

### 上传失败

- 文件类型不支持：提示支持的文件类型。
- 文件过大：提示最大文件限制。
- 文件为空或无法读取：提示用户检查文件内容。

### 文本提取失败

- 状态置为 `failed`。
- 记录 `error_message`。
- 支持重新处理。

### AI 整理失败

- 状态置为 `failed`。
- 保留已提取文本。
- 用户可以重新处理。
- 如果模型用途未配置，提示先配置知识整理模型。

### Embedding 失败

- 状态置为 `failed`。
- 提示 embedding 模型配置、维度或 API 调用错误。
- 支持重新生成 embedding。

### Qdrant 写入失败

- MySQL 中保留知识片段。
- 状态置为 `failed`。
- 支持重新写入索引。

### 召回失败

AI 业务流程不能因为知识召回失败完全不可用。

策略：

- 记录日志。
- 前端提示“知识库召回失败，本次 AI 将仅基于当前需求内容处理”。
- 继续执行原 AI 流程。

## 安全与权限

第一阶段按项目权限控制：

- 能访问项目的用户才能查看该项目知识库。
- 能编辑项目的用户才能上传、编辑、删除、重新处理知识。
- AI 召回严格限制 `project_id`。
- Qdrant payload filter 必须带 `project_id`。

API 层不能只依赖前端传入项目 ID，需要校验当前用户是否有项目访问权限。

## 配置项

建议增加知识库配置：

```text
QDRANT_URL
QDRANT_API_KEY
QDRANT_COLLECTION_NAME=testhub_knowledge_chunks
KNOWLEDGE_CHUNK_SIZE=1000
KNOWLEDGE_CHUNK_OVERLAP=150
KNOWLEDGE_RETRIEVAL_TOP_K=10
KNOWLEDGE_MAX_CONTEXT_TOKENS=6000
KNOWLEDGE_VECTOR_WEIGHT=0.6
KNOWLEDGE_KEYWORD_WEIGHT=0.2
KNOWLEDGE_TAG_WEIGHT=0.1
KNOWLEDGE_SCENARIO_WEIGHT=0.1
```

也可以在后续提供前端配置页面。

## 测试策略

### 后端单元测试

覆盖：

- 文档上传和状态变更。
- 文本提取。
- AI 整理结果解析。
- 知识切片。
- Qdrant payload 构造。
- 混合召回分数计算。
- 项目权限过滤。
- 引用记录保存。

### 集成测试

覆盖：

- 上传文档到索引完成的完整流程。
- 召回接口返回同项目知识。
- 不召回其他项目知识。
- 需求分析调用知识召回并保存引用。
- 用例生成调用知识召回并保存引用。

### 前端测试

覆盖：

- 文档列表展示。
- 上传知识。
- 状态展示。
- AI 整理结果查看。
- 知识片段查看。
- AI 输出引用来源展示。

### 验收标准

1. 用户可以在项目下上传知识文档。
2. 系统可以自动提取文本并调用 AI 整理结构化知识。
3. 系统可以生成 embedding 并写入 Qdrant。
4. 召回接口只返回当前项目的知识片段。
5. 需求评审、需求分析、用例设计、用例编写、用例评审都能自动使用知识库背景。
6. AI 输出页面展示引用来源。
7. 知识召回失败时，原 AI 流程仍可继续执行并给出提示。
8. 禁用的知识文档和片段不会参与召回。

## 后续扩展路线

### 第二阶段：接入平台历史数据

将以下数据源转为知识：

- 历史测试用例。
- AI 生成用例。
- 缺陷记录。
- 执行失败记录。
- 评审意见。
- 工单数据。

新增同步任务：

```text
source_type = manual_testcase / generated_testcase / defect / execution_result / review_comment / ticket
```

### 第三阶段：知识质量治理

增加：

- 重复知识检测。
- 冲突知识提示。
- 知识过期提醒。
- 高频引用统计。
- 低质量知识标记。

### 第四阶段：知识图谱

基于 `entities` 和 `relations` 字段构建图谱：

```text
业务实体 -> 流程 -> 页面 -> 接口 -> 规则 -> 用例 -> 缺陷
```

支持：

- 关系查询。
- 影响分析。
- 缺陷与用例关联。
- 需求变更影响范围分析。

## 推荐实施顺序

1. 新增 `apps/knowledge_base` app 和基础模型。
2. 接入 Qdrant 客户端和配置。
3. 实现文档上传、文本提取和处理任务状态。
4. 新增知识整理模型用途和 embedding 模型用途。
5. 实现 AI 结构化整理。
6. 实现知识切片和 Qdrant 写入。
7. 实现知识召回服务。
8. 改造需求评审和需求分析流程接入召回。
9. 改造用例设计、用例编写、用例评审流程接入召回。
10. 实现引用记录和前端引用展示。
11. 实现知识库前端页面。
12. 补齐测试和错误处理。

## 设计结论

第一阶段直接采用专业 RAG 架构：

> 每个项目拥有独立知识库。用户上传业务资料后，系统通过 AI 自动整理为结构化业务知识，将知识片段写入 MySQL 和 Qdrant。需求评审、需求分析、用例设计、用例编写、用例评审在调用 AI 前自动召回当前项目相关知识，并在输出中展示引用来源。

该方案实现成本高于轻量关键词检索方案，但更符合“让 AI 输出贴合真实业务”的目标，也为后续接入历史用例、缺陷、工单和知识图谱打下基础。
