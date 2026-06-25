# 模型配置中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build unified model management with model pool (AIModelProvider) + usage binding (AIModelUsageConfig), decoupling connection info from business role.

**Architecture:** Two new Django models replace the role-coupled AIModelConfig pattern. AIModelProvider stores pure connection info (no role). AIModelUsageConfig maps usage_type → AIModelProvider FK. TestCaseGenerationTask gets new AIModelProvider FK fields. Frontend gets a tabbed ModelManagement page (Model List / AI Use Case Config / AI Intelligent Mode Config).

**Tech Stack:** Django 4.2 + DRF, Vue 3 + Element Plus

---

### Task 1: Create AIModelProvider and AIModelUsageConfig models

**Files:**
- Modify: `apps/requirement_analysis/models.py` (append before AIModelService)

- [ ] **Add AIModelProvider model after GenerationConfig (line ~331) and before TestCaseGenerationTask**

```python
class AIModelProvider(models.Model):
    """模型池 - 只保存模型调用信息，不包含业务角色语义"""
    PROVIDER_CHOICES = [
        ('deepseek', 'DeepSeek'),
        ('qwen', '通义千问'),
        ('siliconflow', '硅基流动'),
        ('zhipu', '智谱'),
        ('xiaomi', '小米'),
        ('openai_compatible', 'OpenAI 兼容'),
        ('other', '其他'),
    ]

    name = models.CharField(max_length=100, verbose_name='配置名称')
    provider_type = models.CharField(max_length=30, choices=PROVIDER_CHOICES, verbose_name='模型提供商')
    api_key = models.CharField(max_length=200, verbose_name='API Key', blank=True, null=True)
    base_url = models.URLField(verbose_name='API Base URL')
    model_name = models.CharField(max_length=100, verbose_name='模型名称')
    max_tokens = models.IntegerField(default=4096, verbose_name='最大Token数')
    temperature = models.FloatField(default=0.7, verbose_name='温度参数')
    top_p = models.FloatField(default=0.9, verbose_name='Top P参数')
    is_active = models.BooleanField(default=True, verbose_name='是否启用')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name='创建者')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'ai_model_provider'
        verbose_name = 'AI模型提供商'
        verbose_name_plural = 'AI模型提供商'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_provider_type_display()})"

    @classmethod
    def get_active_providers(cls):
        return cls.objects.filter(is_active=True)
```

- [ ] **Add AIModelUsageConfig model after AIModelProvider**

```python
class AIModelUsageConfig(models.Model):
    """业务用途绑定 - 表达某个业务用途选择哪个模型池中的模型"""
    USAGE_CHOICES = [
        ('requirement_reviewer', '需求评审专家'),
        ('requirement_analyzer', '需求分析专家'),
        ('testcase_writer', '测试用例编写专家'),
        ('testcase_reviewer', '测试用例评审专家'),
        ('browser_use_text', 'Browser Use 文本模式'),
        ('browser_use_vision', 'Browser Use 视觉模式（预留）'),
    ]

    usage_type = models.CharField(
        max_length=30, choices=USAGE_CHOICES, unique=True, verbose_name='用途类型'
    )
    model_provider = models.ForeignKey(
        AIModelProvider, on_delete=models.SET_NULL, null=True,
        related_name='usage_configs', verbose_name='关联模型'
    )
    is_active = models.BooleanField(default=True, verbose_name='是否启用')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name='创建者')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'ai_model_usage_config'
        verbose_name = 'AI模型用途配置'
        verbose_name_plural = 'AI模型用途配置'

    def __str__(self):
        return f"{self.get_usage_type_display()} -> {self.model_provider.name if self.model_provider else '未配置'}"
```

- [ ] **Run makemigrations**

Run: `python manage.py makemigrations requirement_analysis`
Expected: Two new migrations created for AIModelProvider and AIModelUsageConfig

- [ ] **Run migrate**

Run: `python manage.py migrate`
Expected: Tables ai_model_provider and ai_model_usage_config created

- [ ] **Commit**

```bash
git add apps/requirement_analysis/models.py
git commit -m "feat: add AIModelProvider and AIModelUsageConfig models"
```

---

### Task 2: Create serializers for new models

**Files:**
- Modify: `apps/requirement_analysis/serializers.py`

- [ ] **Add imports and AIModelProviderSerializer**

Add to imports in serializers.py:
```python
from .models import (
    RequirementDocument, RequirementAnalysis, BusinessRequirement,
    GeneratedTestCase, AnalysisTask, AIModelConfig, PromptConfig, TestCaseGenerationTask,
    GenerationConfig, AIModelProvider, AIModelUsageConfig
)
```

Add after `GenerationConfigSerializer` (at end of file):

```python
class AIModelProviderSerializer(serializers.ModelSerializer):
    """AI模型提供商序列化器"""
    provider_type_display = serializers.CharField(source='get_provider_type_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    api_key_masked = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AIModelProvider
        fields = ['id', 'name', 'provider_type', 'provider_type_display', 'api_key', 'api_key_masked',
                  'base_url', 'model_name', 'max_tokens', 'temperature', 'top_p',
                  'is_active', 'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['created_by', 'created_by_name']
        extra_kwargs = {
            'api_key': {'write_only': True, 'required': False, 'allow_null': True},
        }

    def get_api_key_masked(self, obj):
        if obj.api_key:
            if len(obj.api_key) > 7:
                return f"{obj.api_key[:3]}{'*' * (len(obj.api_key) - 7)}{obj.api_key[-4:]}"
            else:
                return '*' * len(obj.api_key)
        return ''

    def create(self, validated_data):
        user = self.context['request'].user
        if user.is_authenticated:
            validated_data['created_by'] = user
        else
            from apps.users.models import User
            default_user = User.objects.filter(is_superuser=True).first()
            if not default_user:
                default_user = User.objects.first()
            validated_data['created_by'] = default_user
        return super().create(validated_data)


class AIModelUsageConfigSerializer(serializers.ModelSerializer):
    """模型用途绑定序列化器"""
    usage_type_display = serializers.CharField(source='get_usage_type_display', read_only=True)
    model_provider_id = serializers.IntegerField(source='model_provider.id', read_only=True)
    model_provider_name = serializers.CharField(source='model_provider.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = AIModelUsageConfig
        fields = ['id', 'usage_type', 'usage_type_display', 'model_provider',
                  'model_provider_id', 'model_provider_name', 'is_active',
                  'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['created_by', 'created_by_name', 'model_provider_id', 'model_provider_name']

    def validate_model_provider(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError(f'模型 "{value.name}" 已被禁用，请选择启用状态的模型')
        return value

    def create(self, validated_data):
        user = self.context['request'].user
        if user.is_authenticated:
            validated_data['created_by'] = user
        else
            from apps.users.models import User
            default_user = User.objects.filter(is_superuser=True).first()
            if not default_user:
                default_user = User.objects.first()
            validated_data['created_by'] = default_user
        return super().create(validated_data)


class AIModelUsageBulkUpsertSerializer(serializers.Serializer):
    """批量保存用途绑定序列化器"""
    usages = AIModelUsageConfigSerializer(many=True, allow_empty=False)
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/serializers.py
git commit -m "feat: add serializers for AIModelProvider and AIModelUsageConfig"
```

---

### Task 3: Create views for new models

**Files:**
- Modify: `apps/requirement_analysis/views.py`

- [ ] **Add new imports in views.py**

```python
from .models import (
    RequirementDocument, RequirementAnalysis, BusinessRequirement,
    GeneratedTestCase, AnalysisTask, AIModelConfig, PromptConfig, TestCaseGenerationTask,
    GenerationConfig, AIModelService, AIModelProvider, AIModelUsageConfig
)
from .serializers import (
    RequirementDocumentSerializer, RequirementAnalysisSerializer,
    BusinessRequirementSerializer, GeneratedTestCaseSerializer,
    AnalysisTaskSerializer, DocumentUploadSerializer,
    TestCaseGenerationRequestSerializer, TestCaseReviewRequestSerializer,
    AIModelConfigSerializer, PromptConfigSerializer, TestCaseGenerationTaskSerializer,
    GenerationConfigSerializer, AIModelProviderSerializer,
    AIModelUsageConfigSerializer, AIModelUsageBulkUpsertSerializer
)
```

- [ ] **Add AIModelProviderViewSet after AIModelConfigViewSet (before PromptConfigViewSet)**

```python
class AIModelProviderViewSet(viewsets.ModelViewSet):
    """AI模型提供商视图集（模型池管理）"""
    queryset = AIModelProvider.objects.all()
    serializer_class = AIModelProviderSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        provider_type = self.request.query_params.get('provider_type')
        if provider_type:
            queryset = queryset.filter(provider_type=provider_type)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset.order_by('-created_at')

    def perform_update(self, serializer):
        # 编辑时如果未传 API Key，则不覆盖原 API Key
        if 'api_key' in serializer.validated_data and not serializer.validated_data['api_key']:
            serializer.validated_data.pop('api_key')
        serializer.save()

    def perform_destroy(self, instance):
        # 检查是否被用途绑定引用
        usages = AIModelUsageConfig.objects.filter(model_provider=instance)
        if usages.exists():
            usage_names = [u.get_usage_type_display() for u in usages]
            raise serializers.ValidationError(
                f'该模型正在被以下配置使用：{"、".join(usage_names)}。请先更换绑定后再删除。'
            )
        instance.delete()

    def _fetch_models_with_timeout(self, provider, timeout=30.0):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                asyncio.wait_for(
                    AIModelService.list_available_models(provider),
                    timeout=timeout
                )
            )
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            finally:
                loop.close()

    @action(detail=True, methods=['get', 'post'], url_path='available_models')
    def available_models(self, request, pk=None):
        """获取已保存配置下的可用模型列表"""
        try:
            provider = self.get_object()
            models = self._fetch_models_with_timeout(provider)
            return Response({
                'success': True,
                'message': f'成功获取{len(models)}个模型',
                'models': models
            }, status=status.HTTP_200_OK)
        except asyncio.TimeoutError:
            return Response(
                {'success': False, 'message': '获取模型列表超时，请检查网络连接或API地址是否正确'},
                status=status.HTTP_408_REQUEST_TIMEOUT
            )
        except Exception as e:
            logger.error(f"获取模型列表失败: {e}")
            return Response(
                {'success': False, 'message': f'获取模型列表失败: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'], url_path='available_models')
    def available_models_preview(self, request):
        """获取未保存配置下的可用模型列表"""
        try:
            data = request.data
            required_fields = ['provider_type', 'api_key', 'base_url']
            missing_fields = [field for field in required_fields if not data.get(field)]
            if missing_fields:
                return Response(
                    {'success': False, 'message': f'缺少必填字段: {", ".join(missing_fields)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            preview_provider = AIModelProvider(
                name=data.get('name', '临时模型列表配置'),
                provider_type=data.get('provider_type'),
                api_key=data.get('api_key'),
                base_url=data.get('base_url'),
                model_name=data.get('model_name', 'temp-model'),
                max_tokens=data.get('max_tokens') or 256,
                temperature=data.get('temperature') if data.get('temperature') is not None else 0.7,
                top_p=data.get('top_p') if data.get('top_p') is not None else 0.9,
                is_active=False
            )

            models = self._fetch_models_with_timeout(preview_provider)
            return Response({
                'success': True,
                'message': f'成功获取{len(models)}个模型',
                'models': models
            }, status=status.HTTP_200_OK)
        except asyncio.TimeoutError:
            return Response(
                {'success': False, 'message': '获取模型列表超时，请检查网络连接或API地址是否正确'},
                status=status.HTTP_408_REQUEST_TIMEOUT
            )
        except Exception as e:
            logger.error(f"获取未保存配置模型列表失败: {e}")
            return Response(
                {'success': False, 'message': f'获取模型列表失败: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'], url_path='test_connection')
    def test_connection(self, request, pk=None):
        """测试已保存的模型连接"""
        try:
            provider = self.get_object()
            test_messages = [
                {"role": "system", "content": "你是一个AI助手"},
                {"role": "user", "content": "请回复'连接成功'"}
            ]

            def test_api():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(
                        asyncio.wait_for(
                            AIModelService.call_openai_compatible_api(provider, test_messages),
                            timeout=60.0
                        )
                    )
                    return {
                        'success': True,
                        'message': '连接测试成功',
                        'response': result.get('choices', [{}])[0].get('message', {}).get('content', '')
                    }
                except asyncio.TimeoutError:
                    return {'success': False, 'message': '连接测试超时: 请检查网络连接或API地址是否正确'}
                finally:
                    try:
                        loop.run_until_complete(loop.shutdown_asyncgens())
                    except Exception:
                        pass
                    finally:
                        loop.close()

            result = test_api()
            return Response(
                result,
                status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"测试连接时出错: {e}")
            return Response(
                {'success': False, 'message': f'测试失败: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], url_path='test_connection')
    def test_connection_preview(self, request):
        """测试未保存的模型配置连接"""
        try:
            data = request.data
            required_fields = ['provider_type', 'api_key', 'base_url', 'model_name']
            missing_fields = [field for field in required_fields if not data.get(field)]
            if missing_fields:
                return Response(
                    {'success': False, 'message': f'缺少必填字段: {", ".join(missing_fields)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            test_provider = AIModelProvider(
                name=data.get('name', '临时测试配置'),
                provider_type=data.get('provider_type'),
                api_key=data.get('api_key'),
                base_url=data.get('base_url'),
                model_name=data.get('model_name'),
                max_tokens=data.get('max_tokens') or 256,
                temperature=data.get('temperature') if data.get('temperature') is not None else 0.7,
                top_p=data.get('top_p') if data.get('top_p') is not None else 0.9,
                is_active=False
            )

            test_messages = [
                {"role": "system", "content": "你是一个AI助手"},
                {"role": "user", "content": "请回复'连接成功'"}
            ]

            def test_api():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(
                        asyncio.wait_for(
                            AIModelService.call_openai_compatible_api(test_provider, test_messages),
                            timeout=60.0
                        )
                    )
                    return {
                        'success': True,
                        'message': '连接测试成功',
                        'response': result.get('choices', [{}])[0].get('message', {}).get('content', '')
                    }
                except asyncio.TimeoutError:
                    return {'success': False, 'message': '连接测试超时: 请检查网络连接或API地址是否正确'}
                finally:
                    try:
                        loop.run_until_complete(loop.shutdown_asyncgens())
                    except Exception:
                        pass
                    finally:
                        loop.close()

            result = test_api()
            return Response(
                result,
                status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"测试未保存配置连接时出错: {e}")
            return Response(
                {'success': False, 'message': f'测试失败: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def enable(self, request, pk=None):
        """启用配置"""
        provider = self.get_object()
        provider.is_active = True
        provider.save()
        return Response({'message': '模型已启用', 'id': provider.id, 'is_active': True})

    @action(detail=True, methods=['post'])
    def disable(self, request, pk=None):
        """禁用配置"""
        provider = self.get_object()
        provider.is_active = False
        provider.save()
        return Response({'message': '模型已禁用', 'id': provider.id, 'is_active': False})
```

- [ ] **Add AIModelUsageConfigViewSet after AIModelProviderViewSet**

```python
class AIModelUsageConfigViewSet(viewsets.ModelViewSet):
    """AI模型用途配置视图集"""
    queryset = AIModelUsageConfig.objects.all()
    serializer_class = AIModelUsageConfigSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        usage_type = self.request.query_params.get('usage_type')
        if usage_type:
            queryset = queryset.filter(usage_type=usage_type)

        return queryset.order_by('usage_type')

    @action(detail=False, methods=['get'])
    def by_usage(self, request):
        """根据用途类型获取绑定配置"""
        usage_type = request.query_params.get('usage_type')
        if not usage_type:
            return Response(
                {'error': '请提供 usage_type 参数'},
                status=status.HTTP_400_BAD_REQUEST
            )
        config = AIModelUsageConfig.objects.filter(usage_type=usage_type).first()
        if not config:
            return Response(
                {'error': f'未找到用途类型 "{usage_type}" 的绑定配置'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(config)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='bulk_upsert')
    def bulk_upsert(self, request):
        """批量保存用途绑定"""
        usages_data = request.data.get('usages', [])
        if not usages_data:
            return Response(
                {'error': '请提供用途绑定数据'},
                status=status.HTTP_400_BAD_REQUEST
            )

        results = []
        errors = []
        for item in usages_data:
            usage_type = item.get('usage_type')
            model_provider_id = item.get('model_provider')

            if not usage_type:
                errors.append({'error': '缺少 usage_type', 'data': item})
                continue

            # 验证模型存在且启用
            if model_provider_id:
                try:
                    provider = AIModelProvider.objects.get(id=model_provider_id)
                    if not provider.is_active:
                        errors.append({
                            'usage_type': usage_type,
                            'error': f'模型 "{provider.name}" 已被禁用，请选择启用状态的模型'
                        })
                        continue
                except AIModelProvider.DoesNotExist:
                    errors.append({
                        'usage_type': usage_type,
                        'error': f'模型 ID {model_provider_id} 不存在'
                    })
                    continue

            config, created = AIModelUsageConfig.objects.update_or_create(
                usage_type=usage_type,
                defaults={
                    'model_provider_id': model_provider_id,
                    'is_active': item.get('is_active', True),
                    'created_by': request.user if request.user.is_authenticated else None,
                }
            )
            results.append({
                'id': config.id,
                'usage_type': usage_type,
                'model_provider': model_provider_id,
                'created': created
            })

        return Response({
            'success': len(errors) == 0,
            'message': f'成功处理 {len(results)} 个用途绑定' + (f'，{len(errors)} 个错误' if errors else ''),
            'results': results,
            'errors': errors
        }, status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS)
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/views.py apps/requirement_analysis/serializers.py
git commit -m "feat: add AIModelProviderViewSet and AIModelUsageConfigViewSet"
```

---

### Task 4: Update URLs

**Files:**
- Modify: `apps/requirement_analysis/urls.py`

- [ ] **Add new viewset imports and register routes**

```python
from .views import (
    RequirementDocumentViewSet,
    RequirementAnalysisViewSet,
    BusinessRequirementViewSet,
    GeneratedTestCaseViewSet,
    AnalysisTaskViewSet,
    AIModelConfigViewSet,
    PromptConfigViewSet,
    GenerationConfigViewSet,
    TestCaseGenerationTaskViewSet,
    ConfigStatusViewSet,
    AIModelProviderViewSet,
    AIModelUsageConfigViewSet,
    upload_and_analyze,
    analyze_text
)

router.register(r'model-providers', AIModelProviderViewSet, basename='aimodelprovider')
router.register(r'model-usages', AIModelUsageConfigViewSet, basename='aimodelusageconfig')
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/urls.py
git commit -m "feat: register model-providers and model-usages API routes"
```

---

### Task 5: Update AIModelService to work with AIModelProvider

**Files:**
- Modify: `apps/requirement_analysis/models.py` (AIModelService class)

- [ ] **Update AIModelService type hints**

The AIModelService currently has type hints like `config: AIModelConfig`. Since AIModelProvider has the same field names needed (api_key, base_url, model_name, max_tokens, temperature, top_p, get_model_type_display vs get_provider_type_display), change the type hints to accept both.

Change `config: AIModelConfig` to `config` (remove type hints) in:
- `call_openai_compatible_api`
- `list_available_models`
- `call_openai_compatible_api_stream`

Also update `call_openai_compatible_api` and related methods to use `config.provider_type` instead of `config.model_type` for error messages, falling back to `getattr(config, 'model_type', None)` for backward compatibility.

Replace `config.get_model_type_display()` with:
```python
provider_display = getattr(config, 'get_provider_type_display', None)
if provider_display:
    provider_name = provider_display()
else:
    provider_name = getattr(config, 'get_model_type_display', lambda: 'Unknown')()
```

This ensures the service works with both AIModelProvider and legacy AIModelConfig.

Also update `call_openai_compatible_api_stream` similarly (line ~641 has the same pattern).

- [ ] **Commit**

```bash
git add apps/requirement_analysis/models.py
git commit -m "refactor: update AIModelService to support both AIModelProvider and AIModelConfig"
```

---

### Task 6: Update TestCaseGenerationTask - add AIModelProvider FK fields

**Files:**
- Modify: `apps/requirement_analysis/models.py`

- [ ] **Add AIModelProvider FK fields to TestCaseGenerationTask**

Add after `reviewer_prompt_config` field (after line ~425):

```python
    # 新模型提供商字段（替代上面旧的 AIModelConfig FK）
    requirement_reviewer_model_provider = models.ForeignKey(
        AIModelProvider, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requirement_reviewer_tasks', verbose_name='需求评审模型提供商'
    )
    requirement_analyzer_model_provider = models.ForeignKey(
        AIModelProvider, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requirement_analyzer_tasks', verbose_name='需求分析模型提供商'
    )
    writer_model_provider = models.ForeignKey(
        AIModelProvider, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='writer_tasks', verbose_name='编写模型提供商'
    )
    reviewer_model_provider = models.ForeignKey(
        AIModelProvider, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewer_tasks', verbose_name='评审模型提供商'
    )
```

- [ ] **Run migration**

Run: `python manage.py makemigrations requirement_analysis && python manage.py migrate`

- [ ] **Commit**

```bash
git add apps/requirement_analysis/models.py
git commit -m "feat: add AIModelProvider FK fields to TestCaseGenerationTask"
```

---

### Task 7: Update TestCaseGenerationTaskSerializer

**Files:**
- Modify: `apps/requirement_analysis/serializers.py`

- [ ] **Add new read-only fields to TestCaseGenerationTaskSerializer**

Add after existing model name fields (after `reviewer_prompt_name` field):

```python
    requirement_reviewer_provider_name = serializers.CharField(
        source='requirement_reviewer_model_provider.name', read_only=True
    )
    requirement_analyzer_provider_name = serializers.CharField(
        source='requirement_analyzer_model_provider.name', read_only=True
    )
    writer_provider_name = serializers.CharField(
        source='writer_model_provider.name', read_only=True
    )
    reviewer_provider_name = serializers.CharField(
        source='reviewer_model_provider.name', read_only=True
    )
```

Add to `fields` list:
```python
                 'requirement_reviewer_model_provider', 'requirement_reviewer_provider_name',
                 'requirement_analyzer_model_provider', 'requirement_analyzer_provider_name',
                 'writer_model_provider', 'writer_provider_name',
                 'reviewer_model_provider', 'reviewer_provider_name',
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/serializers.py
git commit -m "feat: add AIModelProvider fields to TestCaseGenerationTaskSerializer"
```

---

### Task 8: Update TestCaseGenerationTaskViewSet.generate to use AIModelUsageConfig

**Files:**
- Modify: `apps/requirement_analysis/views.py`

- [ ] **Update the `generate` action in TestCaseGenerationTaskViewSet**

Replace the old `get_active_model(role)` function (lines ~1414-1457) with new code that reads from AIModelUsageConfig:

```python
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """创建新的测试用例生成任务"""
        try:
            serializer = TestCaseGenerationRequestSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            validated_data = serializer.validated_data

            # 从用途绑定中读取模型
            def get_usage_model(usage_type):
                usage = AIModelUsageConfig.objects.filter(
                    usage_type=usage_type, is_active=True
                ).select_related('model_provider').first()
                if not usage or not usage.model_provider:
                    return None
                return usage.model_provider

            def get_required_usage(usage_type, label):
                usage = AIModelUsageConfig.objects.filter(
                    usage_type=usage_type
                ).select_related('model_provider').first()
                if not usage:
                    return None, f'AI 用例模型配置不完整：请为"{label}"选择模型'
                if not usage.model_provider:
                    return None, f'AI 用例模型配置不完整：请为"{label}"选择模型'
                if not usage.model_provider.is_active:
                    return None, f'"{label}"绑定的模型已禁用，请启用该模型或重新选择'
                return usage.model_provider, None

            usage_mapping = [
                ('requirement_reviewer', '需求评审专家'),
                ('requirement_analyzer', '需求分析专家'),
                ('testcase_writer', '测试用例编写专家'),
                ('testcase_reviewer', '测试用例评审专家'),
            ]

            models = {}
            errors = []
            for usage_type, label in usage_mapping:
                provider, error = get_required_usage(usage_type, label)
                if error:
                    errors.append(error)
                models[usage_type] = provider

            # 检查提示词配置
            def get_required_prompt(prompt_type):
                return PromptConfig.get_active_config(prompt_type)

            prompts =
            prompt_mapping = [
                ('requirement_reviewer', '需求评审提示词配置'),
                ('requirement_analyzer', '需求分析提示词配置'),
                ('writer', '测试用例编写提示词配置'),
                ('reviewer', '测试用例评审提示词配置'),
            ]
            for prompt_type, label in prompt_mapping:
                prompt = get_required_prompt(prompt_type)
                if not prompt:
                    errors.append(f'缺少{label}')
                prompts[prompt_type] = prompt

            if errors:
                return Response({'error': '、'.join(errors)}, status=status.HTTP_400_BAD_REQUEST)

            task_data = {
                'title': validated_data['title'],
                'requirement_text': validated_data['requirement_text'],
                # 新模型提供商字段
                'requirement_reviewer_model_provider': models['requirement_reviewer'].id,
                'requirement_analyzer_model_provider': models['requirement_analyzer'].id,
                'writer_model_provider': models['testcase_writer'].id,
                'reviewer_model_provider': models['testcase_reviewer'].id,
                # 提示词配置（保持不变）
                'requirement_reviewer_prompt_config': prompts['requirement_reviewer'].id,
                'requirement_analyzer_prompt_config': prompts['requirement_analyzer'].id,
                'writer_prompt_config': prompts['writer'].id,
                'reviewer_prompt_config': prompts['reviewer'].id,
            }

            if 'project' in validated_data and validated_data['project']:
                task_data['project'] = validated_data['project']

            output_mode = request.data.get('output_mode')
            if output_mode and output_mode in ['stream', 'complete']:
                task_data['output_mode'] = output_mode
            else:
                gen_config = GenerationConfig.get_active_config()
                task_data['output_mode'] = gen_config.default_output_mode if gen_config else 'stream'

            task_serializer = TestCaseGenerationTaskSerializer(data=task_data, context={'request': request})
            if not task_serializer.is_valid():
                return Response(task_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            task = task_serializer.save()

            # ... rest of the generate method (run_generation_task, execute_task, etc.) stays the same
```

- [ ] **Note**: Keep the existing `run_generation_task` and `execute_task` functions as-is. They access `task.writer_model_config` etc. which still exist (old AIModelConfig FK fields). The new provider fields are stored on the task but not yet used by the service.

Actually, wait - since we want the new system to be used, we need to also update `AIModelService` methods to use the new provider fields. Let me update the `execute_task` function to use the new provider fields.

- [ ] **Update the execute_task function inside `generate` to use new provider fields**

In the execute_task function (around line ~1476):
- Replace `task.writer_model_config` with `task.writer_model_provider`
- Replace `task.reviewer_model_config` with `task.reviewer_model_provider`  
- Replace `task.requirement_reviewer_model_config` with `task.requirement_reviewer_model_provider`
- Replace `task.requirement_analyzer_model_config` with `task.requirement_analyzer_model_provider`

These changes are in `AIModelService.review_requirement_stream(task, ...)`, `AIModelService.analyze_requirement_stream(task, ...)`, `AIModelService.generate_test_cases_stream(task, ...)`, `AIModelService.review_test_cases_stream(task, ...)`, `AIModelService.revise_test_cases_based_on_review(task, ...)`.

- [ ] **Commit**

```bash
git add apps/requirement_analysis/views.py
git commit -m "feat: update testcase generation to use AIModelUsageConfig and AIModelProvider"
```

---

### Task 9: Update ConfigStatusViewSet

**Files:**
- Modify: `apps/requirement_analysis/views.py`

- [ ] **Update `check` method to also check AIModelUsageConfig**

Replace the `model_status` helper and the response data to include both old and new checks, or just the new checks:

```python
    @action(detail=False, methods=['get'])
    def check(self, request):
        """检查AI配置状态"""
        try:
            def usage_status(usage_type, required=True):
                config = AIModelUsageConfig.objects.filter(
                    usage_type=usage_type
                ).select_related('model_provider').first()
                provider = config.model_provider if config and config.model_provider else None
                return {
                    'configured': config is not None and provider is not None,
                    'enabled': config is not None and config.is_active and provider is not None and provider.is_active,
                    'name': provider.name if provider else None,
                    'provider': provider.get_provider_type_display() if provider else None,
                    'id': provider.id if provider else None,
                    'required': required,
                    'error': None,
                }

            def prompt_status(prompt_type):
                enabled = PromptConfig.objects.filter(prompt_type=prompt_type, is_active=True).first()
                disabled = PromptConfig.objects.filter(prompt_type=prompt_type, is_active=False).first()
                config = enabled or disabled
                return {
                    'configured': config is not None,
                    'enabled': enabled is not None,
                    'name': config.name if config else None,
                    'id': config.id if config else None,
                    'required': True,
                }

            generation_config = GenerationConfig.get_active_config()
            required_keys = [
                'requirement_reviewer_model', 'requirement_analyzer_model', 'writer_model', 'reviewer_model',
                'requirement_reviewer_prompt', 'requirement_analyzer_prompt', 'writer_prompt', 'reviewer_prompt',
            ]
            response_data = {
                'requirement_reviewer_model': usage_status('requirement_reviewer'),
                'requirement_analyzer_model': usage_status('requirement_analyzer'),
                'writer_model': usage_status('testcase_writer'),
                'reviewer_model': usage_status('testcase_reviewer'),
                'requirement_reviewer_prompt': prompt_status('requirement_reviewer'),
                'requirement_analyzer_prompt': prompt_status('requirement_analyzer'),
                'writer_prompt': prompt_status('writer'),
                'reviewer_prompt': prompt_status('reviewer'),
                'generation_config': {
                    'configured': generation_config is not None,
                    'enabled': generation_config is not None,
                    'name': generation_config.name if generation_config else None,
                    'id': generation_config.id if generation_config else None,
                    'required': True,
                    'default_output_mode': generation_config.default_output_mode if generation_config else None,
                    'enable_auto_review': generation_config.enable_auto_review if generation_config else None
                }
            }
            all_ready = all(
                response_data[key]['configured'] and response_data[key]['enabled']
                for key in required_keys
            )
            all_ready = all_ready and response_data['generation_config']['configured']
            response_data['overall_status'] = 'enabled' if all_ready else 'not_configured'
            response_data['message'] = '配置完整且已启用' if all_ready else '存在未配置或未启用的AI配置'

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"检查配置状态失败: {e}")
            return Response({
                'error': f'检查配置状态失败: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/views.py
git commit -m "feat: update ConfigStatusViewSet to check AIModelUsageConfig"
```

---

### Task 10: Update admin.py

**Files:**
- Modify: `apps/requirement_analysis/admin.py`

- [ ] **Register new models in admin**

```python
from .models import (
    RequirementDocument, RequirementAnalysis, BusinessRequirement,
    GeneratedTestCase, AnalysisTask, AIModelConfig, PromptConfig,
    GenerationConfig, TestCaseGenerationTask, AIModelProvider, AIModelUsageConfig
)


@admin.register(AIModelProvider)
class AIModelProviderAdmin(admin.ModelAdmin):
    list_display = ['name', 'provider_type', 'model_name', 'is_active', 'created_at']
    list_filter = ['provider_type', 'is_active', 'created_at']
    search_fields = ['name', 'model_name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AIModelUsageConfig)
class AIModelUsageConfigAdmin(admin.ModelAdmin):
    list_display = ['usage_type', 'model_provider', 'is_active', 'created_at']
    list_filter = ['usage_type', 'is_active']
    readonly_fields = ['created_at', 'updated_at']
```

- [ ] **Commit**

```bash
git add apps/requirement_analysis/admin.py
git commit -m "feat: register AIModelProvider and AIModelUsageConfig in admin"
```

---

### Task 11: Add frontend API calls for model-providers and model-usages

**Files:**
- Modify: `frontend/src/api/requirement-analysis.js`

- [ ] **Add API calls at end of file**

```javascript
// ==================== 模型提供商 (Model Provider) ====================

// 获取所有模型提供商
export function getModelProviders(params) {
  return request({
    url: '/requirement-analysis/model-providers/',
    method: 'get',
    params
  })
}

// 获取模型提供商详情
export function getModelProviderDetail(id) {
  return request({
    url: `/requirement-analysis/model-providers/${id}/`,
    method: 'get'
  })
}

// 创建模型提供商
export function createModelProvider(data) {
  return request({
    url: '/requirement-analysis/model-providers/',
    method: 'post',
    data
  })
}

// 更新模型提供商
export function updateModelProvider(id, data) {
  return request({
    url: `/requirement-analysis/model-providers/${id}/`,
    method: 'patch',
    data
  })
}

// 删除模型提供商
export function deleteModelProvider(id) {
  return request({
    url: `/requirement-analysis/model-providers/${id}/`,
    method: 'delete'
  })
}

// 测试模型连接
export function testModelProviderConnection(id, data) {
  const url = id
    ? `/requirement-analysis/model-providers/${id}/test_connection/`
    : '/requirement-analysis/model-providers/test_connection/'
  return request({
    url,
    method: 'post',
    data
  })
}

// 获取可用模型列表
export function fetchAvailableModels(id, data) {
  const url = id
    ? `/requirement-analysis/model-providers/${id}/available_models/`
    : '/requirement-analysis/model-providers/available_models/'
  return request({
    url,
    method: id ? 'get' : 'post',
    data
  })
}

// 启用模型提供商
export function enableModelProvider(id) {
  return request({
    url: `/requirement-analysis/model-providers/${id}/enable/`,
    method: 'post'
  })
}

// 禁用模型提供商
export function disableModelProvider(id) {
  return request({
    url: `/requirement-analysis/model-providers/${id}/disable/`,
    method: 'post'
  })
}

// ==================== 模型用途配置 (Model Usage Config) ====================

// 获取所有用途绑定
export function getModelUsageConfigs(params) {
  return request({
    url: '/requirement-analysis/model-usages/',
    method: 'get',
    params
  })
}

// 根据用途类型获取绑定
export function getModelUsageByType(usageType) {
  return request({
    url: `/requirement-analysis/model-usages/by_usage/`,
    method: 'get',
    params: { usage_type: usageType }
  })
}

// 批量保存用途绑定
export function bulkUpsertModelUsages(usages) {
  return request({
    url: '/requirement-analysis/model-usages/bulk_upsert/',
    method: 'post',
    data: { usages }
  })
}
```

- [ ] **Commit**

```bash
git add frontend/src/api/requirement-analysis.js
git commit -m "feat: add API calls for model-providers and model-usages"
```

---

### Task 12: Create frontend ModelManagement page (tabs wrapper)

**Files:**
- Create: `frontend/src/views/configuration/ModelManagement.vue`

- [ ] **Create ModelManagement.vue with el-tabs**

```vue
<template>
  <div class="model-management">
    <el-tabs v-model="activeTab" type="card" class="model-tabs">
      <el-tab-pane :label="$t('configuration.modelManagement.tabProviders')" name="providers">
        <ModelProviderList />
      </el-tab-pane>
      <el-tab-pane :label="$t('configuration.modelManagement.tabUseCase')" name="usecase">
        <AIUseCaseConfig />
      </el-tab-pane>
      <el-tab-pane :label="$t('configuration.modelManagement.tabAiMode')" name="aimode">
        <AIIntelligentModeConfig />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ModelProviderList from './ModelProviderList.vue'
import AIUseCaseConfig from './AIUseCaseConfig.vue'
import AIIntelligentModeConfig from './AIIntelligentModeConfig.vue'

const activeTab = ref('providers')
</script>

<style scoped>
.model-management {
  height: 100%;
}
.model-tabs {
  height: 100%;
}
.model-tabs :deep(.el-tab-pane) {
  height: calc(100% - 40px);
  overflow-y: auto;
}
</style>
```

- [ ] **Commit**

```bash
git add frontend/src/views/configuration/ModelManagement.vue
git commit -m "feat: create ModelManagement page with tabs"
```

---

### Task 13: Create ModelProviderList.vue (Tab 1 - Provider CRUD)

**Files:**
- Create: `frontend/src/views/configuration/ModelProviderList.vue`

This is a CRUD table for AIModelProvider with:
- Table listing: name, provider_type, model_name, base_url, max_tokens, temperature, top_p, is_active
- Add/Edit dialog: name, provider_type, api_key, base_url, model_name (with fetch from API), max_tokens, temperature, top_p
- Actions: enable/disable toggle, test connection, delete (with ref-check warning)
- Available models fetch (for saved and unsaved configs)

```vue
<template>
  <div class="model-provider-list">
    <div class="section-header">
      <h2>{{ $t('configuration.modelManagement.providerTitle') }}</h2>
      <el-button type="primary" @click="openAddDialog">
        {{ $t('configuration.modelManagement.addProvider') }}
      </el-button>
    </div>

    <el-table :data="providers" v-loading="loading" stripe style="width: 100%">
      <el-table-column prop="name" :label="$t('configuration.modelManagement.providerName')" min-width="140" />
      <el-table-column prop="provider_type_display" :label="$t('configuration.modelManagement.providerType')" width="120" />
      <el-table-column prop="model_name" :label="$t('configuration.modelManagement.modelName')" min-width="140" />
      <el-table-column prop="base_url" :label="$t('configuration.modelManagement.baseUrl')" min-width="200" show-overflow-tooltip />
      <el-table-column prop="max_tokens" label="max_tokens" width="100" />
      <el-table-column prop="temperature" label="temperature" width="100" />
      <el-table-column prop="top_p" label="top_p" width="80" />
      <el-table-column :label="$t('configuration.common.status')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? $t('configuration.common.enabled') : $t('configuration.common.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('configuration.common.actions')" width="240" fixed="right">
        <template #default="{ row }">
          <el-switch
            v-model="row.is_active"
            size="small"
            @change="(val) => toggleActive(row, val)"
            :loading="row._toggling"
          />
          <el-button link type="primary" size="small" @click="testConnection(row)">
            {{ $t('configuration.modelManagement.test') }}
          </el-button>
          <el-button link type="primary" size="small" @click="openEditDialog(row)">
            {{ $t('configuration.common.edit') }}
          </el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">
            {{ $t('configuration.common.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? $t('configuration.modelManagement.editProvider') : $t('configuration.modelManagement.addProvider')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="120px">
        <el-form-item :label="$t('configuration.modelManagement.providerName')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="$t('configuration.modelManagement.providerType')" prop="provider_type">
          <el-select v-model="form.provider_type" style="width: 100%" @change="onProviderTypeChange">
            <el-option
              v-for="pt in providerTypes"
              :key="pt.value"
              :label="pt.label"
              :value="pt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('configuration.modelManagement.apiKey')" prop="api_key">
          <el-input v-model="form.api_key" type="password" show-password
            :placeholder="isEditing ? $t('configuration.modelManagement.apiKeyPlaceholderEdit') : ''" />
        </el-form-item>
        <el-form-item :label="$t('configuration.modelManagement.baseUrl')" prop="base_url">
          <el-input v-model="form.base_url" />
        </el-form-item>
        <el-form-item :label="$t('configuration.modelManagement.modelName')" prop="model_name">
          <el-input v-model="form.model_name" style="width: calc(100% - 120px)" />
          <el-button @click="fetchModels" :loading="fetchingModels" style="margin-left: 8px">
            {{ $t('configuration.modelManagement.fetchModels') }}
          </el-button>
          <div v-if="availableModels.length > 0" class="model-list-dropdown">
            <el-tag
              v-for="m in filteredModels"
              :key="m"
              @click="form.model_name = m"
              closable
              size="small"
              style="margin: 2px; cursor: pointer"
            >{{ m }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="max_tokens" prop="max_tokens">
          <el-input-number v-model="form.max_tokens" :min="256" :max="128000" :step="1024" />
        </el-form-item>
        <el-form-item label="temperature" prop="temperature">
          <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" style="width: 200px" />
        </el-form-item>
        <el-form-item label="top_p" prop="top_p">
          <el-slider v-model="form.top_p" :min="0" :max="1" :step="0.05" style="width: 200px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testUnsavedConnection" :loading="testing">
          {{ $t('configuration.modelManagement.testConnection') }}
        </el-button>
        <el-button @click="dialogVisible = false">{{ $t('configuration.common.cancel') }}</el-button>
        <el-button type="primary" @click="saveProvider" :loading="saving">
          {{ $t('configuration.common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getModelProviders, createModelProvider, updateModelProvider, deleteModelProvider,
  enableModelProvider, disableModelProvider, testModelProviderConnection,
  fetchAvailableModels
} from '@/api/requirement-analysis'

const loading = ref(false)
const providers = ref([])
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref(null)
const saving = ref(false)
const testing = ref(false)
const fetchingModels = ref(false)
const availableModels = ref([])
const formRef = ref(null)

const providerTypes = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问' },
  { value: 'siliconflow', label: '硅基流动' },
  { value: 'zhipu', label: '智谱' },
  { value: 'xiaomi', label: '小米' },
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'other', label: '其他' },
]

const defaultBaseUrls = {
  deepseek: 'https://api.deepseek.com',
  qwen: 'https://dashscope.aliyuncs.com',
  siliconflow: 'https://api.siliconflow.cn',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  xiaomi: 'https://api.minimax.chat/v1',
  openai_compatible: 'https://api.openai.com/v1',
  other: '',
}

const form = reactive({
  name: '',
  provider_type: '',
  api_key: '',
  base_url: '',
  model_name: '',
  max_tokens: 4096,
  temperature: 0.7,
  top_p: 0.9,
})

const formRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  provider_type: [{ required: true, message: '请选择模型提供商', trigger: 'change' }],
  api_key: [{ required: true, message: '请输入API Key', trigger: 'blur' }],
  base_url: [{ required: true, message: '请输入API Base URL', trigger: 'blur' }],
  model_name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
}

const filteredModels = computed(() => {
  if (!form.model_name) return availableModels.value
  return availableModels.value.filter(m =>
    m.toLowerCase().includes(form.model_name.toLowerCase())
  )
})

function onProviderTypeChange(val) {
  if (!isEditing.value) {
    form.base_url = defaultBaseUrls[val] || ''
    const defaults = {
      deepseek: 'deepseek-chat',
      qwen: 'qwen-max',
      siliconflow: 'Qwen/Qwen2.5-72B-Instruct-128K',
      zhipu: 'glm-4-plus',
      xiaomi: 'minimax-text-01',
      openai_compatible: 'gpt-4o',
    }
    form.model_name = defaults[val] || ''
  }
}

async function loadProviders() {
  loading.value = true
  try {
    const res = await getModelProviders()
    providers.value = res.data || []
  } catch (e) {
    ElMessage.error('加载模型列表失败')
  } finally {
    loading.value = false
  }
}

function openAddDialog() {
  isEditing.value = false
  editingId.value = null
  Object.assign(form, {
    name: '', provider_type: '', api_key: '', base_url: '',
    model_name: '', max_tokens: 4096, temperature: 0.7, top_p: 0.9,
  })
  availableModels.value = []
  dialogVisible.value = true
}

function openEditDialog(row) {
  isEditing.value = true
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    provider_type: row.provider_type,
    api_key: '',
    base_url: row.base_url,
    model_name: row.model_name,
    max_tokens: row.max_tokens,
    temperature: row.temperature,
    top_p: row.top_p,
  })
  availableModels.value = []
  dialogVisible.value = true
}

async function saveProvider() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const data = { ...form }
    if (isEditing.value && !data.api_key) {
      delete data.api_key
    }
    if (isEditing.value) {
      await updateModelProvider(editingId.value, data)
      ElMessage.success('更新成功')
    } else {
      await createModelProvider(data)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await loadProviders()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确定要删除此模型配置吗？', '确认', { type: 'warning' })
    await deleteModelProvider(row.id)
    ElMessage.success('删除成功')
    await loadProviders()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e.response?.data?.detail || e.response?.data?.message || e.message
      ElMessage.error(msg || '删除失败')
    }
  }
}

async function toggleActive(row, val) {
  row._toggling = true
  try {
    if (val) {
      await enableModelProvider(row.id)
    } else {
      await disableModelProvider(row.id)
    }
    ElMessage.success(val ? '已启用' : '已禁用')
  } catch (e) {
    row.is_active = !val
    ElMessage.error('操作失败')
  } finally {
    row._toggling = false
  }
}

async function testConnection(row) {
  testing.value = true
  try {
    const res = await testModelProviderConnection(row.id)
    if (res.data.success) {
      ElMessage.success('连接测试成功')
    } else {
      ElMessage.error(res.data.message || '连接测试失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

async function testUnsavedConnection() {
  const required = ['provider_type', 'api_key', 'base_url', 'model_name']
  const missing = required.filter(k => !form[k])
  if (missing.length > 0) {
    ElMessage.warning('请先填写完整的模型信息')
    return
  }
  testing.value = true
  try {
    const res = await testModelProviderConnection(null, form)
    if (res.data.success) {
      ElMessage.success('连接测试成功')
    } else {
      ElMessage.error(res.data.message || '连接测试失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

async function fetchModels() {
  if (!form.provider_type || !form.api_key || !form.base_url) {
    ElMessage.warning('请先选择提供商并填写API Key和Base URL')
    return
  }
  fetchingModels.value = true
  try {
    const data = { ...form }
    if (editingId.value) {
      const res = await fetchAvailableModels(editingId.value)
      availableModels.value = res.data.models || []
    } else {
      const res = await fetchAvailableModels(null, data)
      availableModels.value = res.data.models || []
    }
    ElMessage.success(`获取到 ${availableModels.value.length} 个模型`)
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '获取模型列表失败')
  } finally {
    fetchingModels.value = false
  }
}

onMounted(loadProviders)
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.model-list-dropdown {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 4px;
}
</style>
```

- [ ] **Commit**

```bash
git add frontend/src/views/configuration/ModelProviderList.vue
git commit -m "feat: create ModelProviderList component for provider CRUD"
```

---

### Task 14: Create AIUseCaseConfig.vue (Tab 2 - Usage Binding)

**Files:**
- Create: `frontend/src/views/configuration/AIUseCaseConfig.vue`

```vue
<template>
  <div class="ai-use-case-config">
    <div class="section-header">
      <h2>{{ $t('configuration.modelManagement.useCaseTitle') }}</h2>
    </div>

    <el-alert
      :title="$t('configuration.modelManagement.useCaseDescription')"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-table :data="usages" stripe style="width: 100%">
      <el-table-column prop="usage_type_display" :label="$t('configuration.modelManagement.usageType')" width="160" />
      <el-table-column :label="$t('configuration.modelManagement.currentModel')" min-width="180">
        <template #default="{ row }">
          <span v-if="row.model_provider_name">{{ row.model_provider_name }}</span>
          <el-tag v-else type="danger" size="small">{{ $t('configuration.common.notConfigured') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('configuration.common.status')" width="100">
        <template #default="{ row }">
          <el-tag v-if="!row.model_provider" type="danger" size="small">{{ $t('configuration.common.notConfigured') }}</el-tag>
          <el-tag v-else-if="row._providerActive === false" type="warning" size="small">
            {{ $t('configuration.modelManagement.modelDisabled') }}
          </el-tag>
          <el-tag v-else type="success" size="small">{{ $t('configuration.common.configured') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('configuration.common.actions')" width="120">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="selectProvider(row)">
            {{ $t('configuration.modelManagement.changeModel') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 16px; text-align: right">
      <el-button type="primary" @click="saveAll" :loading="saving">
        {{ $t('configuration.common.save') }}
      </el-button>
    </div>

    <!-- Model Selector Dialog -->
    <el-dialog
      v-model="selectorVisible"
      :title="$t('configuration.modelManagement.selectModel')"
      width="400px"
    >
      <el-select v-model="selectedProviderId" style="width: 100%" :placeholder="$t('configuration.modelManagement.selectModelPlaceholder')">
        <el-option
          v-for="p in activeProviders"
          :key="p.id"
          :label="p.name"
          :value="p.id"
        >
          <span>{{ p.name }}</span>
          <span style="float: right; color: #999; font-size: 12px">{{ p.model_name }}</span>
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="selectorVisible = false">{{ $t('configuration.common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmSelect">{{ $t('configuration.common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getModelUsageConfigs, getModelProviders, bulkUpsertModelUsages
} from '@/api/requirement-analysis'

const usages = ref([])
const activeProviders = ref([])
const saving = ref(false)
const selectorVisible = ref(false)
const selectedProviderId = ref(null)
const currentEditingRow = ref(null)

const usageTypes = [
  'requirement_reviewer',
  'requirement_analyzer',
  'testcase_writer',
  'testcase_reviewer',
]

async function loadUsages() {
  try {
    const [usageRes, providerRes] = await Promise.all([
      getModelUsageConfigs(),
      getModelProviders({ is_active: true }),
    ])
    activeProviders.value = providerRes.data || []

    // Build usage list in order
    const usageMap = {}
    for (const u of (usageRes.data || [])) {
      usageMap[u.usage_type] = u
    }

    usages.value = usageTypes.map(ut => {
      const existing = usageMap[ut]
      return {
        usage_type: ut,
        usage_type_display: existing?.usage_type_display || ut,
        model_provider: existing?.model_provider || null,
        model_provider_name: existing?.model_provider_name || null,
        _providerActive: existing?.model_provider
          ? activeProviders.value.some(p => p.id === existing.model_provider)
          : null,
        _id: existing?.id || null,
        _original: existing,
      }
    })
  } catch (e) {
    ElMessage.error('加载用途配置失败')
  }
}

function selectProvider(row) {
  currentEditingRow.value = row
  selectedProviderId.value = row.model_provider || null
  selectorVisible.value = true
}

function confirmSelect() {
  if (!currentEditingRow.value) return
  const provider = activeProviders.value.find(p => p.id === selectedProviderId.value)
  currentEditingRow.value.model_provider = selectedProviderId.value
  currentEditingRow.value.model_provider_name = provider?.name || ''
  currentEditingRow.value._providerActive = true
  selectorVisible.value = false
}

async function saveAll() {
  saving.value = true
  try {
    const payload = usages.value.map(u => ({
      usage_type: u.usage_type,
      model_provider: u.model_provider,
    }))
    await bulkUpsertModelUsages(payload)
    ElMessage.success('保存成功')
    await loadUsages()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadUsages)
</script>

<style scoped>
.section-header {
  margin-bottom: 16px;
}
</style>
```

- [ ] **Commit**

```bash
git add frontend/src/views/configuration/AIUseCaseConfig.vue
git commit -m "feat: create AIUseCaseConfig component for usage binding"
```

---

### Task 15: Update AIIntelligentModeConfig.vue (Tab 3)

**Files:**
- Modify: `frontend/src/views/configuration/AIIntelligentModeConfig.vue`

Replace the content to show a simplified binding UI for browser_use_text:

```vue
<template>
  <div class="ai-mode-config">
    <div class="section-header">
      <h2>{{ $t('configuration.modelManagement.aiModeTitle') }}</h2>
    </div>

    <el-alert
      title="为 Browser Use AI 智能模式选择模型"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-table :data="modeUsages" stripe style="width: 100%">
      <el-table-column prop="usage_type_display" label="用途" width="200" />
      <el-table-column label="当前模型" min-width="200">
        <template #default="{ row }">
          <span v-if="row.model_provider_name">{{ row.model_provider_name }}</span>
          <el-tag v-else type="danger" size="small">未配置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="!row.model_provider" type="danger" size="small">未配置</el-tag>
          <el-tag v-else type="success" size="small">已配置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="!row._disabled"
            link type="primary" size="small"
            @click="selectProvider(row)"
          >{{ row.model_provider ? '更换' : '选择' }}</el-button>
          <span v-else style="color: #999; font-size: 12px">预留</span>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 16px; text-align: right">
      <el-button type="primary" @click="saveAll" :loading="saving">保存配置</el-button>
    </div>

    <el-dialog v-model="selectorVisible" title="选择模型" width="400px">
      <el-select v-model="selectedProviderId" style="width: 100%" placeholder="请选择模型">
        <el-option
          v-for="p in activeProviders"
          :key="p.id"
          :label="p.name"
          :value="p.id"
        >
          <span>{{ p.name }}</span>
          <span style="float: right; color: #999; font-size: 12px">{{ p.model_name }}</span>
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="selectorVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSelect">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getModelUsageConfigs, getModelProviders, bulkUpsertModelUsages
} from '@/api/requirement-analysis'

const modeUsages = ref([])
const activeProviders = ref([])
const saving = ref(false)
const selectorVisible = ref(false)
const selectedProviderId = ref(null)
const currentEditingRow = ref(null)

const modeTypes = [
  { usage_type: 'browser_use_text', label: 'Browser Use 文本模式', disabled: false },
  { usage_type: 'browser_use_vision', label: 'Browser Use 视觉模式', disabled: true },
]

async function loadData() {
  try {
    const [usageRes, providerRes] = await Promise.all([
      getModelUsageConfigs(),
      getModelProviders({ is_active: true }),
    ])
    activeProviders.value = providerRes.data || []
    const usageMap = {}
    for (const u of (usageRes.data || [])) {
      usageMap[u.usage_type] = u
    }

    modeUsages.value = modeTypes.map(mt => {
      const existing = usageMap[mt.usage_type]
      return {
        usage_type: mt.usage_type,
        usage_type_display: existing?.usage_type_display || mt.label,
        model_provider: existing?.model_provider || null,
        model_provider_name: existing?.model_provider_name || null,
        _disabled: mt.disabled,
        _id: existing?.id || null,
        _original: existing,
      }
    })
  } catch (e) {
    ElMessage.error('加载配置失败')
  }
}

function selectProvider(row) {
  if (row._disabled) return
  currentEditingRow.value = row
  selectedProviderId.value = row.model_provider || null
  selectorVisible.value = true
}

function confirmSelect() {
  if (!currentEditingRow.value) return
  const provider = activeProviders.value.find(p => p.id === selectedProviderId.value)
  currentEditingRow.value.model_provider = selectedProviderId.value
  currentEditingRow.value.model_provider_name = provider?.name || ''
  selectorVisible.value = false
}

async function saveAll() {
  saving.value = true
  try {
    const payload = modeUsages.value
      .filter(u => !u._disabled)
      .map(u => ({
        usage_type: u.usage_type,
        model_provider: u.model_provider,
      }))
    await bulkUpsertModelUsages(payload)
    ElMessage.success('保存成功')
    await loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.section-header {
  margin-bottom: 16px;
}
</style>
```

- [ ] **Commit**

```bash
git add frontend/src/views/configuration/AIIntelligentModeConfig.vue
git commit -m "refactor: simplify AIIntelligentModeConfig to use AIModelUsageConfig binding"
```

---

### Task 16: Add frontend i18n translations

**Files:**
- Modify: `frontend/src/locales/lang/zh-cn/configuration.js`

- [ ] **Add modelManagement translations**

Add before the closing `}` of the export:

```javascript
  modelManagement: {
    tabProviders: '模型列表',
    tabUseCase: 'AI 用例模型配置',
    tabAiMode: 'AI 智能模式配置',
    providerTitle: '模型池列表',
    addProvider: '新增模型',
    editProvider: '编辑模型',
    providerName: '配置名称',
    providerType: '模型提供商',
    modelName: '模型名称',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    apiKeyPlaceholderEdit: '留空则不修改',
    fetchModels: '获取模型列表',
    testConnection: '测试连接',
    test: '测试',
    useCaseTitle: 'AI 用例模型配置',
    useCaseDescription: '为 AI 用例生成流程中的四个用途选择模型。请先在"模型列表"中添加并启用模型。',
    usageType: '用途',
    currentModel: '当前模型',
    changeModel: '更换',
    selectModel: '选择模型',
    selectModelPlaceholder: '请选择模型（只显示已启用的模型）',
    modelDisabled: '模型已禁用',
    aiModeTitle: 'AI 智能模式配置',
  },
```

- [ ] **Commit**

```bash
git add frontend/src/locales/lang/zh-cn/configuration.js
git commit -m "feat: add i18n translations for model management"
```

---

### Task 17: Update frontend router

**Files:**
- Modify: `frontend/src/router/index.js`

- [ ] **Change `/configuration/ai-model` route to `/configuration/models`**

Replace the existing ai-model route:

```javascript
{
    path: 'ai-model',
    name: 'ConfigAIModel',
    component: () => import('@/views/requirement-analysis/AIModelConfig.vue')
},
```

With:

```javascript
{
    path: 'models',
    name: 'ConfigModels',
    component: () => import('@/views/configuration/ModelManagement.vue')
},
```

Also update the redirect path:

```javascript
{
    path: '',
    redirect: 'models'
},
```

- [ ] **Commit**

```bash
git add frontend/src/router/index.js
git commit -m "feat: update router for new ModelManagement page"
```

---

### Task 18: Run migrations verification

- [ ] **Run makemigrations to check for any pending migrations**

Run: `python manage.py makemigrations requirement_analysis`
Expected: "No changes detected"

- [ ] **Run migrate to apply any pending**

Run: `python manage.py migrate`
Expected: All migrations applied

- [ ] **Run frontend lint check**

Run: `cd frontend && npm run lint`
Expected: No errors (or fix any lint issues)

---

### Task 19: Smoke test the full workflow

- [ ] **Start the dev server**

Run: `python manage.py runserver` (backend)

- [ ] **Start the frontend**

Run: `cd frontend && npm run dev` (frontend)

- [ ] **Verify:**
  1. Navigate to /configuration/models - Tabs show: 模型列表 | AI 用例模型配置 | AI 智能模式配置
  2. Tab 1: Can add a new model provider (DeepSeek, etc.)
  3. Tab 1: Can test connection (may fail if no valid API key, but shouldn't error)
  4. Tab 1: Can toggle enable/disable
  5. Tab 1: Can delete an unused model
  6. Tab 2: Shows 4 usage type rows
  7. Tab 2: Can select an enabled provider for each usage type
  8. Tab 2: Can save the binding
  9. Tab 3: Shows browser_use_text row, can select provider
  10. Tab 3: browser_use_vision shows as "预留" and is disabled