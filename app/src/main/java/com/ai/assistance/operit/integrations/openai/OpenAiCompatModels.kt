package com.ai.assistance.operit.integrations.openai

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * OpenAI 兼容接口请求和响应的数据模型
 */

/**
 * OpenAI Chat Completion 请求
 */
@Serializable
data class OpenAiChatCompletionRequest(
    val model: String? = null,
    val messages: List<OpenAiMessage> = emptyList(),
    val temperature: Float? = null,
    val top_p: Float? = null,
    val n: Int? = null,
    val stream: Boolean? = null,
    val stop: String? = null,
    @SerialName("max_tokens")
    val maxTokens: Int? = null,
    @SerialName("max_completion_tokens")
    val maxCompletionTokens: Int? = null,
    val presence_penalty: Float? = null,
    @SerialName("frequency_penalty")
    val frequencyPenalty: Float? = null,
    @SerialName("response_format")
    val responseFormat: ResponseFormat? = null,
    val seed: Long? = null,
    val tools: List<OpenAiTool>? = null,
    @SerialName("tool_choice")
    val toolChoice: ToolChoice? = null,
    val user: String? = null
)

@Serializable
data class OpenAiMessage(
    val role: String,
    val content: String,
    val name: String? = null,
    @SerialName("tool_calls")
    val toolCalls: List<OpenAiToolCall>? = null,
    @SerialName("tool_call_id")
    val toolCallId: String? = null
)

@Serializable
data class ResponseFormat(
    val type: String = "text"
)

@Serializable
data class OpenAiTool(
    val type: String = "function",
    val function: OpenAiFunction
)

@Serializable
data class OpenAiFunction(
    val name: String,
    val description: String? = null,
    val parameters: JsonElement? = null
)

@Serializable
data class ToolChoice(
    val type: String = "function",
    val function: FunctionChoice? = null
)

@Serializable
data class FunctionChoice(
    val name: String
)

@Serializable
data class OpenAiToolCall(
    val id: String,
    val type: String = "function",
    val function: FunctionCall
)

@Serializable
data class FunctionCall(
    val name: String,
    val arguments: String
)

/**
 * OpenAI Chat Completion 响应
 */
@Serializable
data class OpenAiChatCompletionResponse(
    val id: String,
    @SerialName("object")
    val objectType: String = "chat.completion",
    val created: Long,
    val model: String,
    val choices: List<OpenAiChoice>,
    val usage: OpenAiUsage? = null,
    @SerialName("service_tier")
    val serviceTier: String? = null,
    @SerialName("system_fingerprint")
    val systemFingerprint: String? = null
)

@Serializable
data class OpenAiChoice(
    val index: Int,
    val message: OpenAiMessage,
    @SerialName("finish_reason")
    val finishReason: String? = null,
    val logprobs: LogProbs? = null
)

@Serializable
data class LogProbs(
    val content: List<ContentLogProb>? = null
)

@Serializable
data class ContentLogProb(
    val token: String,
    val logprob: Float,
    val bytes: List<Int>? = null,
    val top_logprobs: List<TopLogProb>? = null
)

@Serializable
data class TopLogProb(
    val token: String,
    val logprob: Float,
    val bytes: List<Int>? = null
)

@Serializable
data class OpenAiUsage(
    @SerialName("prompt_tokens")
    val promptTokens: Int,
    @SerialName("completion_tokens")
    val completionTokens: Int,
    @SerialName("total_tokens")
    val totalTokens: Int
)

/**
 * OpenAI Models List 响应
 */
@Serializable
data class OpenAiModelsListResponse(
    @SerialName("object")
    val objectType: String = "list",
    val data: List<OpenAiModel>
)

@Serializable
data class OpenAiModel(
    val id: String,
    @SerialName("object")
    val objectType: String = "model",
    val created: Long = 0,
    val owned_by: String = "operit",
    val permission: List<ModelPermission> = emptyList(),
    val root: String = "",
    val parent: String? = null
)

@Serializable
data class ModelPermission(
    val id: String = "",
    @SerialName("object")
    val objectType: String = "model_permission",
    val created: Long = 0,
    val allow_create_engine: Boolean = false,
    val allow_sampling: Boolean = true,
    val allow_logprobs: Boolean = true,
    val allow_search_indices: Boolean = false,
    val allow_view: Boolean = true,
    val allow_fine_tuning: Boolean = false,
    val organization: String = "*",
    val group: String? = null,
    val is_blocking: Boolean = false
)

/**
 * SSE 流式响应事件
 */
@Serializable
data class OpenAiStreamChoice(
    val index: Int,
    val delta: OpenAiDelta,
    @SerialName("finish_reason")
    val finishReason: String? = null,
    val logprobs: LogProbs? = null
)

@Serializable
data class OpenAiDelta(
    val role: String? = null,
    val content: String? = null,
    @SerialName("tool_calls")
    val toolCalls: List<OpenAiToolCall>? = null
)

@Serializable
data class OpenAiStreamResponse(
    val id: String,
    @SerialName("object")
    val objectType: String = "chat.completion.chunk",
    val created: Long,
    val model: String,
    val choices: List<OpenAiStreamChoice>
)

@Serializable
data class OpenAiStreamUsage(
    @SerialName("prompt_tokens")
    val promptTokens: Int = 0,
    @SerialName("completion_tokens")
    val completionTokens: Int = 0,
    @SerialName("total_tokens")
    val totalTokens: Int = 0
)

/**
 * 错误响应
 */
@Serializable
data class OpenAiErrorResponse(
    val error: OpenAiError
)

@Serializable
data class OpenAiError(
    val message: String,
    val type: String = "invalid_request_error",
    val code: String? = null,
    val param: String? = null,
    val internal_error: InternalError? = null
)

@Serializable
data class InternalError(
    val code: String? = null,
    val message: String? = null
)

/**
 * 服务健康检查响应
 */
@Serializable
data class OpenAiCompatHealthResponse(
    val status: String = "ok",
    val enabled: Boolean,
    val serviceRunning: Boolean,
    val port: Int,
    val versionName: String,
    val supportedEndpoints: List<String>
)

/**
 * 模型信息，用于返回可用模型列表
 */
data class ModelInfo(
    val id: String,
    val displayName: String,
    val provider: String,
    val isLocal: Boolean,
    val description: String = ""
)
