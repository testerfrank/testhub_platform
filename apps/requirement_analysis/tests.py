from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.requirement_analysis.models import AIModelProvider, AIModelUsageConfig, PromptConfig


class ModelProviderAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='tester', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create_provider(self, **overrides):
        data = {
            'name': 'DeepSeek Chat',
            'provider_type': 'deepseek',
            'api_key': 'sk-test',
            'base_url': 'https://api.example.com',
            'model_name': 'deepseek-chat',
            'max_tokens': 4096,
            'temperature': 0.7,
            'top_p': 0.9,
            'is_active': True,
        }
        data.update(overrides)
        return AIModelProvider.objects.create(created_by=self.user, **data)

    def test_patch_model_provider_without_api_key_keeps_existing_key(self):
        provider = self.create_provider(api_key='sk-original')

        response = self.client.patch(
            f'/api/requirement-analysis/model-providers/{provider.id}/',
            {'name': 'Updated DeepSeek'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        provider.refresh_from_db()
        self.assertEqual(provider.name, 'Updated DeepSeek')
        self.assertEqual(provider.api_key, 'sk-original')

    def test_delete_provider_referenced_by_usage_returns_reference_names(self):
        provider = self.create_provider()
        AIModelUsageConfig.objects.create(
            usage_type='testcase_writer',
            model_provider=provider,
            created_by=self.user,
        )

        response = self.client.delete(f'/api/requirement-analysis/model-providers/{provider.id}/')

        self.assertEqual(response.status_code, 400)
        self.assertIn('测试用例编写专家', response.data['error'])
        self.assertTrue(AIModelProvider.objects.filter(id=provider.id).exists())

    def test_model_provider_list_masks_api_key_without_plaintext(self):
        provider = self.create_provider(api_key='sk-secret-1234')

        response = self.client.get('/api/requirement-analysis/model-providers/')

        self.assertEqual(response.status_code, 200)
        result = response.data['results'][0]
        self.assertEqual(result['id'], provider.id)
        self.assertNotIn('api_key', result)
        self.assertEqual(result['api_key_masked'], 'sk-*******1234')

    def test_reveal_model_provider_api_key_returns_plaintext(self):
        provider = self.create_provider(api_key='sk-secret-1234')

        response = self.client.get(f'/api/requirement-analysis/model-providers/{provider.id}/api_key/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['api_key'], 'sk-secret-1234')


class ModelUsageAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='tester', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.provider = AIModelProvider.objects.create(
            name='DeepSeek Chat',
            provider_type='deepseek',
            api_key='sk-test',
            base_url='https://api.example.com',
            model_name='deepseek-chat',
            is_active=True,
            created_by=self.user,
        )

    def test_model_usage_rejects_inactive_provider(self):
        self.provider.is_active = False
        self.provider.save()

        response = self.client.post(
            '/api/requirement-analysis/model-usages/',
            {'usage_type': 'testcase_writer', 'model_provider': self.provider.id},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('启用状态', str(response.data))

    def test_bulk_upsert_replaces_existing_usage_binding(self):
        old_provider = self.provider
        new_provider = AIModelProvider.objects.create(
            name='Qwen Max',
            provider_type='qwen',
            api_key='sk-qwen',
            base_url='https://dashscope.example.com',
            model_name='qwen-max',
            is_active=True,
            created_by=self.user,
        )
        AIModelUsageConfig.objects.create(
            usage_type='testcase_writer',
            model_provider=old_provider,
            created_by=self.user,
        )

        response = self.client.post(
            '/api/requirement-analysis/model-usages/bulk_upsert/',
            {'usages': [{'usage_type': 'testcase_writer', 'model_provider': new_provider.id}]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        usage = AIModelUsageConfig.objects.get(usage_type='testcase_writer')
        self.assertEqual(usage.model_provider, new_provider)
        self.assertEqual(AIModelUsageConfig.objects.filter(usage_type='testcase_writer').count(), 1)


class TestCaseGenerationRuntimeConfigTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='tester', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        PromptConfig.objects.create(
            name='Writer Prompt',
            prompt_type='writer',
            content='write cases',
            is_active=True,
            created_by=self.user,
        )
        PromptConfig.objects.create(
            name='Reviewer Prompt',
            prompt_type='reviewer',
            content='review cases',
            is_active=True,
            created_by=self.user,
        )

    def create_provider(self, name='DeepSeek Chat', active=True):
        return AIModelProvider.objects.create(
            name=name,
            provider_type='deepseek',
            api_key='sk-test',
            base_url='https://api.example.com',
            model_name='deepseek-chat',
            is_active=active,
            created_by=self.user,
        )

    def test_generation_rejects_missing_required_usage_binding(self):
        provider = self.create_provider()
        for usage_type in ['requirement_reviewer', 'requirement_analyzer', 'testcase_reviewer']:
            AIModelUsageConfig.objects.create(
                usage_type=usage_type,
                model_provider=provider,
                created_by=self.user,
            )

        response = self.client.post(
            '/api/requirement-analysis/testcase-generation/generate/',
            {'title': 'Login', 'requirement_text': 'User can login'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'AI 用例模型配置不完整：请为“测试用例编写专家”选择模型')

    def test_generation_rejects_disabled_bound_provider(self):
        provider = self.create_provider(active=False)
        for usage_type in ['requirement_reviewer', 'requirement_analyzer', 'testcase_writer', 'testcase_reviewer']:
            AIModelUsageConfig.objects.create(
                usage_type=usage_type,
                model_provider=provider,
                created_by=self.user,
            )

        response = self.client.post(
            '/api/requirement-analysis/testcase-generation/generate/',
            {'title': 'Login', 'requirement_text': 'User can login'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], '“需求评审专家”绑定的模型已禁用，请启用该模型或重新选择')
