# 项目概念与层级调整设计

## 背景

TestHub 当前定位是 AI 驱动的测试管理平台，已经包含需求分析、手工用例、测试套件、测试执行、评审、报告、API 测试、UI 自动化、App 自动化、AI 需求分析和项目级知识库等能力。

现有代码中存在多个“项目”概念：

- `apps/projects.Project`：平台级项目，承载成员、权限、版本、需求、用例、执行、报告等主业务关系。
- `apps/api_testing.ApiProject`：API 测试模块内部项目。
- `apps/ui_automation.UiProject`：UI 自动化模块内部项目。
- App 自动化模块中也存在类似按项目归属的自动化资产。

这些概念短期内能支撑各模块独立运行，但长期会带来用户心智和数据边界混乱：用户会难以区分“项目管理”“API 项目”“UI 项目”的关系；权限、知识库、需求分析、质量看板也难以统一聚合。

## 设计结论

保留“项目”概念，并将其明确提升为全平台唯一的顶层业务容器：

> `Project = 一个真实产品 / 被测系统 / 业务域`。

例如：商城系统、ERP 系统、支付平台、CRM 系统都应该是 Project。

API 测试、UI 自动化、App 自动化等模块不应该再各自定义与 Project 平级的“项目”。这些模块中的现有项目概念应逐步降级并重命名为项目内的测试资产分组，例如服务、应用、模块、集合或自动化空间。

## Project 的职责边界

Project 是平台的主隔离单元，承担以下职责。

### 权限边界

项目成员、角色、数据访问权限都以 Project 为基础。

用户能看到哪些需求、用例、执行、报告、知识库、自动化资产，应首先由其是否能访问对应 Project 决定。

### 业务上下文边界

Project 代表一个真实产品或被测系统，因此它天然承载业务知识和测试上下文。

项目知识库、需求文档、AI 需求评审、需求分析、用例生成、用例评审都应绑定 Project，并默认只使用当前 Project 的业务上下文。

### 质量资产归属边界

以下资产应直接或间接归属于 Project：

- 需求文档与需求分析结果。
- 手工测试用例与 AI 生成用例。
- 测试套件。
- 测试计划。
- 测试执行记录。
- 测试报告。
- 缺陷。
- 评审任务与评审模板。
- 版本与发布。

### 自动化资产归属边界

API 测试、UI 自动化、App 自动化资产都应归属于 Project。

这些资产可以有自己的二级分组，但二级分组不再叫项目。

### 统计和质量看板边界

Project 是质量度量的聚合口径。

后续质量看板可以按 Project 展示：需求覆盖率、用例数量、执行通过率、缺陷趋势、评审通过率、AI 生成质量、知识库引用情况等。

## 推荐产品层级

目标产品层级如下：

```text
Project 项目 / 产品 / 被测系统
├── Version 版本 / 发布
├── Requirement 需求
├── KnowledgeBase 知识库
├── TestCase 手工 / AI 用例
├── TestSuite 用例集
├── TestPlan 测试计划
├── TestRun 执行记录
├── Report 报告
├── Defect 缺陷
├── Review 评审
├── ApiTesting API 测试
│   ├── ApiService / ApiModule / ApiCollection
│   ├── ApiEnvironment
│   ├── ApiCase
│   └── ApiSuite
├── UiAutomation UI 自动化
│   ├── UiApplication
│   ├── PageObject
│   ├── Element
│   ├── UiCase
│   └── UiSuite
└── AppAutomation App 自动化
    ├── AppApplication
    ├── Device / Capability
    ├── AppCase
    └── AppSuite
```

核心规则：

1. 平台中只有 `Project` 是真正的项目。
2. API、UI、App 自动化模块内部不再新增平级项目概念。
3. API、UI、App 自动化资产必须直接或间接挂到 `Project` 下。
4. 各模块可以保留自己的二级组织结构，但命名应避免继续使用“项目”。

## API 测试模块调整方向

当前 `ApiProject` 更适合改造成 Project 下的 API 资产分组。

推荐命名优先级：

1. `ApiService`：适合表示一个后端服务，例如订单服务、支付服务、库存服务。
2. `ApiModule`：适合表示业务模块，例如订单管理、售后管理。
3. `ApiCollectionGroup`：适合表示接口集合分组。

推荐关系：

```text
Project
└── ApiService / ApiModule
    ├── ApiCollection
    ├── ApiEnvironment
    ├── ApiCase
    └── ApiSuite
```

迁移时可以先保留数据库表和旧类名，在产品文案和 API 语义上逐步从“API 项目”改为“API 服务”或“API 模块”。稳定后再考虑模型类和表名迁移。

## UI 自动化模块调整方向

当前 `UiProject` 更适合改造成 Project 下的应用或自动化空间。

推荐命名优先级：

1. `UiApplication`：适合表示被测前端应用，例如用户端 Web、管理后台、移动端 H5。
2. `UiApp`：更短，但表达略弱。
3. `UiAutomationSpace`：适合表示一组 UI 自动化资产，但业务含义不如应用清晰。

推荐关系：

```text
Project
└── UiApplication
    ├── PageObject
    ├── Element
    ├── UiCase
    ├── UiSuite
    └── UiExecution
```

UI 自动化中的页面对象、元素、脚本、套件、执行记录应继续按应用组织，但应用必须归属于平台级 Project。

## App 自动化模块调整方向

App 自动化应与 UI 自动化保持同样的层级思路。

推荐关系：

```text
Project
└── AppApplication
    ├── Device / Capability
    ├── AppPage / Element
    ├── AppCase
    ├── AppSuite
    └── AppExecution
```

如果一个 Project 同时包含 Web、H5、iOS、Android，可以分别建多个应用；它们共享同一个项目知识库、需求、用例和质量看板。

## 与项目级知识库的关系

项目级知识库应继续绑定 `Project`。

```text
KnowledgeDocument.project -> Project
KnowledgeStructuredItem.project -> Project
KnowledgeChunk.project -> Project
KnowledgeCitation.project -> Project
Qdrant payload.project_id -> Project.id
```

这样可以保证 AI 只召回当前产品或被测系统的业务知识，避免跨项目知识污染。

在用户选择 A 语义后，知识库的项目级隔离是合理的：Project 代表一个真实业务系统，而不是一次临时测试活动或简单分类标签。

示例：

```text
项目：电商平台
知识库：
- 订单业务规则
- 支付异常场景
- 库存扣减规则
- 历史缺陷
- 客服退款 SOP
```

同一 Project 下的需求评审、需求分析、用例设计、API 用例生成、UI 用例生成都可以召回这些知识。

## 权限规则

第一阶段沿用现有项目成员模型：

- 能访问 Project 的用户，可以查看该 Project 下的需求、用例、执行、报告、知识库和自动化资产。
- 能编辑 Project 的用户，可以创建或修改该 Project 下的测试资产。
- AI 召回、自动化资产查询、报告统计都必须校验 Project 权限。
- 后端 API 不能只依赖前端传入的 `project_id`，必须校验当前用户是否拥有该 Project 的访问权限。

API/UI/App 自动化二级资产可以在后续增加更细粒度权限，但第一阶段不建议引入片段级或资产级复杂权限，以免增加实现和使用成本。

## 迁移策略

由于当前代码已经存在多个项目模型，建议分阶段迁移，避免一次性大改导致业务不可用。

### 第一阶段：统一产品文案和新功能边界

- 明确 `apps/projects.Project` 是平台唯一顶层项目。
- 新增功能，例如知识库、AI 召回、质量看板，只绑定平台级 Project。
- 前端文案避免继续扩大“API 项目”“UI 项目”的概念。
- 新设计和新接口统一使用 Project 作为主上下文。

### 第二阶段：为 API/UI/App 自动化资产补充平台 Project 关联

- 为 API 测试、UI 自动化、App 自动化中的顶层资产补充 `project` 外键，指向 `apps.projects.Project`。
- 继续保留原有 `ApiProject`、`UiProject` 的内部组织能力，但将其视为 Project 下的二级分组。
- 列表、创建、查询接口按平台 Project 过滤。
- 权限统一走平台 Project 成员关系。

### 第三阶段：重命名产品概念和前端页面

- 将“API 项目”文案调整为“API 服务”或“API 模块”。
- 将“UI 项目”文案调整为“UI 应用”。
- 将导航结构调整为项目详情下的子模块入口。
- 保持旧 API 兼容，避免一次性破坏前端或已有数据。

### 第四阶段：模型和表结构深度重构

在业务稳定后再考虑：

- `ApiProject` 模型重命名为 `ApiService` 或 `ApiModule`。
- `UiProject` 模型重命名为 `UiApplication`。
- 迁移数据库表名和 related_name。
- 清理旧路由、旧字段和旧文案。

此阶段风险较高，应单独制定迁移计划和回滚策略。

## 非目标

本设计不在第一阶段解决以下问题：

- 引入 Workspace、Organization 或 Tenant 层。
- 重构为完整多租户 SaaS 架构。
- 一次性重命名所有模型、表名和接口。
- 增加资产级、字段级或知识片段级权限。
- 合并所有 API/UI/App 自动化数据结构。

这些能力可以根据后续产品规模和团队协作需求再扩展。

## 方案对比

### 方案一：维持多个项目概念

优点：改动最小，各模块短期可继续独立运行。

缺点：用户心智混乱，权限和知识库难以统一，质量看板难以聚合。长期不推荐。

### 方案二：统一 Project 为顶层业务容器

优点：概念清晰，权限、知识库、需求、用例、自动化和报告都能统一归属，符合测试管理平台长期演进方向。

缺点：需要分阶段迁移现有 API/UI/App 自动化模块。

这是推荐方案。

### 方案三：引入 Workspace，再让 Project 下降一级

优点：适合多组织、多客户、多租户 SaaS。

缺点：当前系统还没有必须引入组织层的强需求，过早引入会增加复杂度。

当前阶段不推荐。

## 验收标准

1. 产品概念上，Project 被定义为真实产品、被测系统或业务域。
2. 新增知识库能力只绑定平台级 Project。
3. 新增 AI 能力默认以 Project 作为业务上下文和知识召回边界。
4. 新增质量统计默认以 Project 作为聚合口径。
5. API/UI/App 自动化模块的新设计不再新增平级项目概念。
6. API/UI/App 自动化资产后续可以按平台 Project 过滤和授权。
7. 前端导航和文案逐步减少“API 项目”“UI 项目”等平级项目表达。

## 最终建议

项目概念不仅有必要，而且应该成为 TestHub 的顶层业务主线。

当前需要调整的不是删除项目，而是统一项目概念：

- `Project` 表示真实产品 / 被测系统。
- 项目是权限、知识、需求、用例、执行、报告、缺陷和自动化资产的统一归属边界。
- API、UI、App 自动化中的“项目”应降级为服务、应用、模块或集合。
- 知识库按 Project 隔离是正确方向，也是 AI 输出贴合真实业务的基础。

该调整应分阶段推进，优先统一新功能和产品语义，再逐步迁移旧模块。