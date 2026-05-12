package com.ai.assistance.operit.integrations.openai

import android.content.Context
import com.ai.assistance.operit.data.model.ApiProviderType
import com.ai.assistance.operit.data.preferences.ModelConfigManager
import com.ai.assistance.operit.data.preferences.OpenAiCompatPreferences
import com.ai.assistance.operit.integrations.externalchat.ExternalChatRequest
import com.ai.assistance.operit.integrations.externalchat.ExternalChatRequestExecutor
import com.ai.assistance.operit.integrations.externalchat.ExternalChatResponseSanitizer
import com.ai.assistance.operit.integrations.externalchat.ExternalChatStreamingSession
import com.ai.assistance.operit.integrations.externalchat.ExternalChatStreamingStartResult
import com.ai.assistance.operit.util.AppLogger
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import java.io.BufferedWriter
import java.io.FilterInputStream
import java.io.IOException
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

data class OpenAiCompatHttpState(
    val isRunning: Boolean = false,
    val port: Int? = null,
    val lastError: String? = null
)

class OpenAiCompatHttpServer(
    context: Context,
    private val preferences: OpenAiCompatPreferences,
    private val serviceScope: CoroutineScope
) : NanoHTTPD(LISTEN_HOST, preferences.getPort()) {

    private val appContext = context.applicationContext
    private val modelConfigManager = ModelConfigManager(appContext)
    private val executor = ExternalChatRequestExecutor(appContext)
    private val running = AtomicBoolean(false)

    // 模型列表缓存，避免每次请求都读 DataStore
    private val modelsCache = MutableStateFlow<List<Map<String, Any>>>(emptyList())
    private val modelsCacheMutex = Mutex()
    private var modelsCacheTimestamp = 0L
    private val MODELS_CACHE_TTL = 30_000L // 30秒缓存

    // 初始化锁，确保 initializeIfNeeded 只执行一次
    private val initMutex = Mutex()
    private var initialized = false

    /**
     * 确保 DataStore 已初始化（创建默认配置等）。
     * 必须在读取任何配置之前调用，否则首次访问可能返回空列表。
     */
    private suspend fun ensureInitialized() {
        initMutex.withLock {
            if (!initialized) {
                AppLogger.i(TAG, "ensureInitialized: calling modelConfigManager.initializeIfNeeded()")
                modelConfigManager.initializeIfNeeded()
                initialized = true
                AppLogger.i(TAG, "ensureInitialized: initialization complete")
            }
        }
    }

    fun startServer() {
        if (running.get()) return
        start(SOCKET_READ_TIMEOUT, false)
        running.set(true)
        AppLogger.i(TAG, "OpenAI compat HTTP server started on port $listeningPort")

        // 在后台预初始化 DataStore 并预加载模型列表
        serviceScope.launch(Dispatchers.IO) {
            try {
                ensureInitialized()
                refreshModelsCache()
                AppLogger.i(TAG, "startServer: pre-loaded ${modelsCache.value.size} models into cache")
            } catch (e: Exception) {
                AppLogger.e(TAG, "startServer: failed to pre-load models", e)
            }
        }
    }

    fun stopServer() {
        if (!running.get()) return
        stop()
        running.set(false)
        AppLogger.i(TAG, "OpenAI compat HTTP server stopped")
    }

    override fun serve(session: IHTTPSession): Response {
        val path = session.uri?.removeTrailingSlash() ?: session.uri
        AppLogger.d(TAG, "serve: ${session.method} $path from ${session.remoteIpAddress}")
        return when {
            session.method == Method.OPTIONS -> handleOptions(session)
            // Health check / server info
            path == "/" || path == "/v1" || path == "/v1/" -> handleServerInfo(session)
            // Models - both /v1/models and /models
            (path == PATH_MODELS || path == PATH_MODELS_ALT || path == PATH_MODELS_NO_V1 || path == PATH_MODELS_NO_V1_ALT) && session.method == Method.GET -> handleModels(session)
            // Chat completions - /v1/chat/completions and /chat/completions
            (path == PATH_CHAT_COMPLETIONS || path == PATH_CHAT_COMPLETIONS_ALT || path == PATH_CHAT_COMPLETIONS_NO_V1 || path == PATH_CHAT_COMPLETIONS_NO_V1_ALT) && session.method == Method.POST -> handleChatCompletions(session)
            // Legacy completions - /v1/completions and /completions
            (path == PATH_COMPLETIONS || path == PATH_COMPLETIONS_ALT || path == PATH_COMPLETIONS_NO_V1 || path == PATH_COMPLETIONS_NO_V1_ALT) && session.method == Method.POST -> handleLegacyCompletions(session)
            // Embeddings - /v1/embeddings and /embeddings
            (path == PATH_EMBEDDINGS || path == PATH_EMBEDDINGS_ALT || path == PATH_EMBEDDINGS_NO_V1 || path == PATH_EMBEDDINGS_NO_V1_ALT) && session.method == Method.POST -> handleEmbeddings(session)
            else -> jsonResponse(Response.Status.NOT_FOUND, mapOf(
                "error" to mapOf(
                    "message" to "Unknown endpoint: ${session.uri}",
                    "type" to "invalid_request_error",
                    "code" to "not_found"
                )
            )).withCors()
        }
    }

    override fun useGzipWhenAccepted(response: Response): Boolean {
        val mimeType = response.mimeType?.lowercase()
        if (mimeType?.startsWith("text/event-stream") == true) return false
        return super.useGzipWhenAccepted(response)
    }

    private fun handleServerInfo(session: IHTTPSession): Response {
        val info = mapOf(
            "id" to "operit",
            "object" to "server.info",
            "name" to "Operit OpenAI-Compatible API",
            "version" to "1.0.0",
            "description" to "Operit local AI server providing OpenAI-compatible API for cloud, MNN, and LLAMA models",
            "endpoints" to listOf(
                mapOf("path" to "/v1/models", "method" to "GET", "description" to "List available models"),
                mapOf("path" to "/v1/chat/completions", "method" to "POST", "description" to "Chat completions (streaming supported)"),
                mapOf("path" to "/v1/completions", "method" to "POST", "description" to "Legacy text completions"),
                mapOf("path" to "/v1/embeddings", "method" to "POST", "description" to "Text embeddings"),
            ),
            "features" to mapOf(
                "streaming" to true,
                "vision" to true,
                "embeddings" to true,
                "cors" to true
            )
        )
        return jsonResponse(Response.Status.OK, info).withCors()
    }

    private fun handleModels(session: IHTTPSession): Response {
        val unauthorized = requireAuth(session)
        if (unauthorized != null) return unauthorized

        AppLogger.i(TAG, "handleModels: received model list request from ${session.remoteIpAddress}")

        val allModels = try {
            runBlocking {
                withTimeoutOrNull(15000L) {
                    ensureInitialized()
                    getAllModelsCached()
                } ?: run {
                    AppLogger.e(TAG, "handleModels: getAllModels timed out after 15s")
                    // 返回缓存（即使可能过期）
                    val cached = modelsCache.value
                    if (cached.isNotEmpty()) cached else emptyList()
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "handleModels: failed to get models", e)
            // 尝试返回缓存
            val cached = modelsCache.value
            if (cached.isNotEmpty()) cached else emptyList()
        }

        // 如果获取为空，返回一个默认条目，避免客户端显示异常
        val finalModels = if (allModels.isEmpty()) {
            AppLogger.w(TAG, "handleModels: no models found, returning default fallback")
            listOf(mapOf(
                "id" to "operit/default/0",
                "object" to "model",
                "created" to (System.currentTimeMillis() / 1000).toInt(),
                "owned_by" to "operit",
                "metadata" to mapOf(
                    "type" to "cloud",
                    "config_id" to "default",
                    "config_name" to "Default",
                    "model_name" to "default",
                    "model_index" to 0
                )
            ))
        } else {
            allModels
        }

        AppLogger.i(TAG, "handleModels: returning ${finalModels.size} models")

        val result = mapOf(
            "object" to "list",
            "data" to finalModels
        )
        return jsonResponse(Response.Status.OK, result).withCors()
    }

    /**
     * Get all available models from ModelConfigManager (includes cloud, MNN, LLaMA configs).
     * For configs with comma-separated model names, each model is listed as a separate entry.
     */
    private suspend fun getAllModels(): List<Map<String, Any>> {
        ensureInitialized()
        val models = mutableListOf<Map<String, Any>>()
        val summaries = modelConfigManager.getAllConfigSummaries()
        AppLogger.i(TAG, "getAllModels: found ${summaries.size} config summaries")

        for (summary in summaries) {
            AppLogger.i(TAG, "getAllModels: config id=${summary.id}, name=${summary.name}, modelName=${summary.modelName}, providerType=${summary.apiProviderType}")

            val providerLabel = when (summary.apiProviderType) {
                ApiProviderType.MNN -> "mnn"
                ApiProviderType.LLAMA_CPP -> "llama"
                else -> "cloud"
            }

            // A config may have comma-separated model names; expand each into its own entry
            val modelNames = if (summary.modelName.contains(",")) {
                summary.modelName.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            } else {
                listOf(summary.modelName)
            }

            for ((idx, modelName) in modelNames.withIndex()) {
                // Use readable format: {providerLabel}/{configName}/{modelName}
                // For single-model configs, skip the model name part
                val modelId = if (modelNames.size == 1) {
                    "$providerLabel/${summary.name}"
                } else {
                    "$providerLabel/${summary.name}/$modelName"
                }

                // Detect if this is an embedding model (by config field or model name pattern)
                val isEmbedding = when (summary.apiProviderType) {
                    ApiProviderType.MNN -> {
                        val modelDir = java.io.File(
                            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                            "Operit/models/mnn/$modelName"
                        )
                        if (modelDir.exists()) {
                            com.ai.assistance.mnn.MNNLlmSession.isEmbeddingModelByDir(modelDir.absolutePath)
                        } else {
                            com.ai.assistance.mnn.MNNLlmSession.isEmbeddingModelByName(modelName)
                        }
                    }
                    else -> {
                        val lower = modelName.lowercase()
                        lower.contains("embed") || lower.contains("bge") ||
                        lower.contains("e5-") || lower.contains("gte-") ||
                        lower.contains("text-embedding")
                    }
                }

                models.add(mapOf(
                    "id" to modelId,
                    "object" to "model",
                    "created" to (System.currentTimeMillis() / 1000).toInt(),
                    "owned_by" to summary.name,
                    "metadata" to mapOf(
                        "type" to providerLabel,
                        "config_id" to summary.id,
                        "config_name" to summary.name,
                        "model_name" to modelName,
                        "model_index" to idx,
                        "api_endpoint" to (summary.apiEndpoint ?: ""),
                        "provider_type" to summary.apiProviderType.name,
                        "is_embedding" to isEmbedding
                    )
                ))
            }
        }

        return models
    }

    /**
     * 带缓存的获取模型列表。缓存 TTL 为 30 秒，过期后自动刷新。
     */
    private suspend fun getAllModelsCached(): List<Map<String, Any>> {
        modelsCacheMutex.withLock {
            val now = System.currentTimeMillis()
            if (modelsCache.value.isNotEmpty() && (now - modelsCacheTimestamp) < MODELS_CACHE_TTL) {
                AppLogger.d(TAG, "getAllModelsCached: returning ${modelsCache.value.size} models from cache (age=${now - modelsCacheTimestamp}ms)")
                return modelsCache.value
            }
        }
        // 缓存过期或为空，刷新
        refreshModelsCache()
        return modelsCache.value
    }

    /**
     * 刷新模型列表缓存
     */
    private suspend fun refreshModelsCache() {
        val freshModels = getAllModels()
        modelsCacheMutex.withLock {
            modelsCache.value = freshModels
            modelsCacheTimestamp = System.currentTimeMillis()
        }
        AppLogger.i(TAG, "refreshModelsCache: refreshed cache with ${freshModels.size} models")
    }

    /**
     * Parse a model ID string and return (configId, modelIndex) for routing.
     * Supports formats:
     *   - "{providerLabel}/{configName}"           (e.g. "cloud/MyGPT4", "mnn/Qwen2.5")
     *   - "{providerLabel}/{configName}/{model}"   (e.g. "cloud/MyConfig/gpt-4o")
     *   - "operit/{configId}/{modelIndex}"          (legacy UUID format)
     *   - "cloud/{configId}/{modelName}"           (legacy format)
     *   - "{configId}"                             (bare config ID, uses model index 0)
     *   - "{modelName}"                            (bare model name, searches across configs)
     */
    private suspend fun resolveModelId(modelId: String): Pair<String, Int>? {
        ensureInitialized()
        val summaries = modelConfigManager.getAllConfigSummaries()

        // Format: operit/{configId}/{modelIndex} (legacy UUID format)
        if (modelId.startsWith("operit/")) {
            val parts = modelId.removePrefix("operit/").split("/")
            if (parts.size == 2) {
                val configId = parts[0]
                val modelIndex = parts[1].toIntOrNull() ?: 0
                if (summaries.any { it.id == configId }) return Pair(configId, modelIndex)
            }
        }

        // New readable format: {providerLabel}/{configName} or {providerLabel}/{configName}/{modelName}
        val providerLabels = listOf("cloud", "mnn", "llama")
        for (label in providerLabels) {
            if (modelId.startsWith("$label/")) {
                val rest = modelId.removePrefix("$label/")
                // Try matching by config name (single model config)
                val summary = summaries.find { it.name == rest }
                if (summary != null) {
                    return Pair(summary.id, 0)
                }
                // Try {configName}/{modelName}
                val slashIdx = rest.indexOf('/')
                if (slashIdx > 0) {
                    val configName = rest.substring(0, slashIdx)
                    val modelName = rest.substring(slashIdx + 1)
                    val matchedSummary = summaries.find { it.name == configName }
                    if (matchedSummary != null) {
                        val modelNames = matchedSummary.modelName.split(",").map { it.trim() }.filter { it.isNotEmpty() }
                        val idx = modelNames.indexOf(modelName).takeIf { it >= 0 } ?: 0
                        return Pair(matchedSummary.id, idx)
                    }
                }
                // No exact match for this provider label, continue to next format
            }
        }

        // Legacy format: cloud/{configId}/{modelName}
        if (modelId.startsWith("cloud/")) {
            val parts = modelId.removePrefix("cloud/").split("/", limit = 2)
            if (parts.size == 2) {
                val configId = parts[0]
                val modelName = parts[1]
                val summary = summaries.find { it.id == configId }
                if (summary != null) {
                    val modelNames = summary.modelName.split(",").map { it.trim() }.filter { it.isNotEmpty() }
                    val idx = modelNames.indexOf(modelName).takeIf { it >= 0 } ?: 0
                    return Pair(summary.id, idx)
                }
            }
        }

        // Format: bare configId
        val summaryById = summaries.find { it.id == modelId }
        if (summaryById != null) {
            return Pair(modelId, 0)
        }

        // Try matching by model name across all configs
        for (summary in summaries) {
            val modelNames = summary.modelName.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            val idx = modelNames.indexOf(modelId)
            if (idx >= 0) {
                return Pair(summary.id, idx)
            }
        }

        return null
    }

    private fun handleEmbeddings(session: IHTTPSession): Response {
        val unauthorized = requireAuth(session)
        if (unauthorized != null) return unauthorized

        val requestBodyResult = readRequestBody(session)
        if (requestBodyResult.error != null) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to requestBodyResult.error,
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val rawBody = requestBodyResult.body.orEmpty()
        if (rawBody.isBlank()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Request body is empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val request = try {
            json.decodeFromString<EmbeddingRequest>(rawBody)
        } catch (e: Exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Invalid JSON: ${e.message}",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val inputTexts = request.getInputTexts()
        if (inputTexts.isEmpty()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "input is required and must not be empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        // Resolve model ID to determine the provider type and config
        val resolved = runBlocking { resolveModelId(request.model) }
        val (configId, modelIndex) = if (resolved != null) {
            resolved
        } else {
            AppLogger.w(TAG, "Embedding: Model ID '${request.model}' not found")
            return jsonResponse(Response.Status.NOT_FOUND, mapOf(
                "error" to mapOf(
                    "message" to "Model '${request.model}' not found",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        // Get the model config to determine the provider type
        val config = runBlocking {
            ensureInitialized()
            modelConfigManager.getModelConfig(configId)
        }
        if (config == null) {
            return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                "error" to mapOf(
                    "message" to "Model configuration not found for ID: $configId",
                    "type" to "server_error"
                )
            )).withCors()
        }

        // Resolve the specific model name (for configs with comma-separated model names)
        val configModelNames = config.modelName.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val resolvedModelName = if (modelIndex < configModelNames.size) configModelNames[modelIndex] else configModelNames.firstOrNull() ?: ""

        if (resolvedModelName.isEmpty()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Model '${request.model}' has no model name configured. Please set the modelName in the model configuration.",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val modelName = request.model

        // Compute embeddings based on provider type
        val embeddingResults = mutableListOf<List<Float>>()
        var totalPromptTokens = 0

        when (config.apiProviderType) {
            ApiProviderType.MNN -> {
                // MNN embedding: use MNNLlmSession.getEmbedding()
                val modelDir = java.io.File(
                    android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                    "Operit/models/mnn/$resolvedModelName")
                if (!modelDir.exists() || !modelDir.isDirectory) {
                    return jsonResponse(Response.Status.NOT_FOUND, mapOf(
                        "error" to mapOf(
                            "message" to "MNN model directory not found: ${modelDir.absolutePath}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }

                // Check if the model is actually an embedding model before loading it
                // Detection: llm_config.json is_embedding/model_type field + model name pattern (BGE, E5, GTE, etc.)
                if (!com.ai.assistance.mnn.MNNLlmSession.isEmbeddingModelByDir(modelDir.absolutePath)) {
                    return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                        "error" to mapOf(
                            "message" to "Model '$resolvedModelName' is not an MNN embedding model. Embedding models require llm_config.json with is_embedding=true or model_type=\"embedding\", or have a recognized embedding model name (e.g., BGE, E5, GTE). For MNN LLM models, use the chat completions endpoint instead.",
                            "type" to "invalid_request_error"
                        )
                    )).withCors()
                }

                // Create a temporary MNN session for embedding
                val mnnSession = try {
                    com.ai.assistance.mnn.MNNLlmSession.create(
                        modelDir.absolutePath,
                        backendType = mapMnnForwardType(config.mnnForwardType),
                        threadNum = config.mnnThreadCount
                    )
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to create MNN session for embedding", e)
                    null
                }

                if (mnnSession == null) {
                    return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                        "error" to mapOf(
                            "message" to "Failed to create MNN embedding session for model: ${config.modelName}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }

                try {
                    for (text in inputTexts) {
                        val embedding = mnnSession.getEmbedding(text)
                        if (embedding != null) {
                            embeddingResults.add(embedding.toList())
                        } else {
                            AppLogger.w(TAG, "MNN embedding returned null for text")
                            embeddingResults.add(emptyList())
                        }
                        totalPromptTokens += text.length / 4
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "MNN embedding computation failed", e)
                    return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                        "error" to mapOf(
                            "message" to "MNN embedding computation failed: ${e.message}",
                            "type" to "server_error"
                        )
                    )).withCors()
                } finally {
                    mnnSession.release()
                }
            }

            ApiProviderType.LLAMA_CPP -> {
                // llama.cpp embedding: use LlamaSession.getEmbedding()
                val modelFile = java.io.File(
                    android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                    "Operit/models/llama/$resolvedModelName")
                if (!modelFile.exists()) {
                    return jsonResponse(Response.Status.NOT_FOUND, mapOf(
                        "error" to mapOf(
                            "message" to "llama.cpp model file not found: ${modelFile.absolutePath}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }

                if (!com.ai.assistance.llama.LlamaSession.isAvailable()) {
                    return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                        "error" to mapOf(
                            "message" to "llama.cpp backend is not available: ${com.ai.assistance.llama.LlamaSession.getUnavailableReason()}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }

                val nThreads = config.llamaThreadCount

                try {
                    for (text in inputTexts) {
                        val embedding = com.ai.assistance.llama.LlamaNative.nativeGetEmbedding(
                            modelFile.absolutePath, text, nThreads
                        )
                        if (embedding != null) {
                            embeddingResults.add(embedding.toList())
                        } else {
                            AppLogger.w(TAG, "llama.cpp embedding returned null for text")
                            embeddingResults.add(emptyList())
                        }
                        totalPromptTokens += text.length / 4
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "llama.cpp embedding computation failed", e)
                    return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                        "error" to mapOf(
                            "message" to "llama.cpp embedding computation failed: ${e.message}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }
            }

            else -> {
                // Cloud/remote API: forward the embedding request to the API endpoint
                val apiEndpoint = config.apiEndpoint ?: ""
                val apiKey = config.apiKey ?: ""

                if (apiEndpoint.isBlank()) {
                    return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                        "error" to mapOf(
                            "message" to "Model '${request.model}' does not have a configured API endpoint for embeddings",
                            "type" to "invalid_request_error"
                        )
                    )).withCors()
                }

                // Use CloudEmbeddingService to forward to the remote API
                val embeddingConfig = com.ai.assistance.operit.data.model.CloudEmbeddingConfig(
                    enabled = true,
                    endpoint = apiEndpoint,
                    apiKey = apiKey,
                    model = resolvedModelName
                )
                val embeddingService = com.ai.assistance.operit.services.CloudEmbeddingService(appContext)

                try {
                    for (text in inputTexts) {
                        val embedding = runBlocking {
                            embeddingService.generateEmbedding(embeddingConfig, text)
                        }
                        if (embedding != null) {
                            embeddingResults.add(embedding.vector.toList())
                        } else {
                            AppLogger.w(TAG, "Cloud embedding returned null for text")
                            embeddingResults.add(emptyList())
                        }
                        totalPromptTokens += text.length / 4
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Cloud embedding computation failed", e)
                    return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                        "error" to mapOf(
                            "message" to "Cloud embedding computation failed: ${e.message}",
                            "type" to "server_error"
                        )
                    )).withCors()
                }
            }
        }

        // Build OpenAI-compatible response
        val data = embeddingResults.mapIndexed { index, embedding ->
            mapOf(
                "object" to "embedding",
                "embedding" to embedding,
                "index" to index
            )
        }

        val response = mapOf(
            "object" to "list",
            "data" to data,
            "model" to modelName,
            "usage" to mapOf(
                "prompt_tokens" to totalPromptTokens,
                "total_tokens" to totalPromptTokens
            )
        )

        AppLogger.i(TAG, "handleEmbeddings: returned ${embeddingResults.size} embeddings for model '$modelName'")
        return jsonResponse(Response.Status.OK, response).withCors()
    }

    /**
     * Map MNN forward type integer to backend string.
     */
    private fun mapMnnForwardType(forwardType: Int): String {
        return when (forwardType) {
            3 -> "opencl"
            4 -> "auto"
            6 -> "opengl"
            7 -> "vulkan"
            else -> "cpu"
        }
    }

    private fun handleChatCompletions(session: IHTTPSession): Response {
        val unauthorized = requireAuth(session)
        if (unauthorized != null) return unauthorized

        val requestBodyResult = readRequestBody(session)
        if (requestBodyResult.error != null) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to requestBodyResult.error,
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val rawBody = requestBodyResult.body.orEmpty()
        if (rawBody.isBlank()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Request body is empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val request = try {
            json.decodeFromString<ChatCompletionRequest>(rawBody)
        } catch (e: Exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Invalid JSON: ${e.message}",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        if (request.messages.isEmpty()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "messages is required and must not be empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        return handleChatCompletionsInternal(request, isLegacy = false)
    }

    /**
     * Core chat completion logic shared between /v1/chat/completions and /v1/completions.
     * When isLegacy=true, the response format matches the legacy completions API.
     */
    private fun handleChatCompletionsInternal(
        request: ChatCompletionRequest,
        isLegacy: Boolean
    ): Response {

        val userMessage = request.messages.lastOrNull { it.role == "user" }
            ?.let { msg ->
                val text = msg.extractTextContent()
                val imageUrls = msg.extractImageUrls()
                if (imageUrls.isEmpty()) {
                    text
                } else {
                    // Inject image URLs into ImagePoolManager and append <link> tags
                    // so that MNN/LLAMA providers can pick them up via preprocessMultimodalText
                    val imageTags = imageUrls.mapNotNull { url ->
                        val imageId = injectImageUrlToPool(url)
                        if (imageId != null) "<link type=\"image\" id=\"$imageId\">" else null
                    }
                    (imageTags + text).joinToString("\n")
                }
            } ?: ""

        // Resolve model ID to (configId, modelIndex) for routing
        val resolved = runBlocking { resolveModelId(request.model) }
        val (configIdOverride, modelIndexOverride) = if (resolved != null) {
            resolved
        } else {
            // Model not found; try to use the first available config as fallback
            AppLogger.w(TAG, "Model ID '${request.model}' not found, attempting fallback to first available config")
            runBlocking {
                ensureInitialized()
                val summaries = modelConfigManager.getAllConfigSummaries()
                val firstNonDefault = summaries.firstOrNull { it.id != ModelConfigManager.DEFAULT_CONFIG_ID }
                val fallback = firstNonDefault ?: summaries.firstOrNull()
                if (fallback != null) {
                    AppLogger.i(TAG, "Fallback to config: id=${fallback.id}, name=${fallback.name}, model=${fallback.modelName}")
                    Pair(fallback.id, 0)
                } else {
                    AppLogger.e(TAG, "No model configs available at all, cannot process request")
                    Pair(null, null)
                }
            }
        }

        if (configIdOverride == null) {
            return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                "error" to mapOf(
                    "message" to "No model configuration available. Please configure an API model in Operit settings first.",
                    "type" to "server_error",
                    "code" to "no_model_config"
                )
            )).withCors()
        }

        // Build external chat request with model config override for proper routing
        // Note: stopAfter=false to keep the chat service running for subsequent requests
        // returnToolStatus=true: return full response including tool output so the
        // OpenAI-compatible client receives all content (not just text outside XML tags).
        val chatRequest = ExternalChatRequest(
            requestId = "oai-${java.util.UUID.randomUUID().toString().take(8)}",
            message = userMessage,
            group = request.model,
            createNewChat = true,
            createIfNone = true,
            showFloating = false,
            returnToolStatus = true,
            stopAfter = false,
            chatModelConfigIdOverride = configIdOverride,
            chatModelIndexOverride = modelIndexOverride
        )

        return if (request.stream) {
            handleStreamChatWithFallback(request, chatRequest, isLegacy)
        } else {
            handleSyncChat(request, chatRequest, isLegacy)
        }
    }

    /**
     * Handle legacy /v1/completions requests by converting them to chat completions.
     * Many older clients and libraries still use this endpoint.
     */
    private fun handleLegacyCompletions(session: IHTTPSession): Response {
        val unauthorized = requireAuth(session)
        if (unauthorized != null) return unauthorized

        val requestBodyResult = readRequestBody(session)
        if (requestBodyResult.error != null) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to requestBodyResult.error,
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val rawBody = requestBodyResult.body.orEmpty()
        if (rawBody.isBlank()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Request body is empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        val legacyRequest = try {
            json.decodeFromString<LegacyCompletionRequest>(rawBody)
        } catch (e: Exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "Invalid JSON: ${e.message}",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        // Convert legacy completion to chat completion format
        val prompt = legacyRequest.prompt ?: ""
        if (prompt.isBlank()) {
            return jsonResponse(Response.Status.BAD_REQUEST, mapOf(
                "error" to mapOf(
                    "message" to "prompt is required and must not be empty",
                    "type" to "invalid_request_error"
                )
            )).withCors()
        }

        // Convert prompt to a user message
        val chatRequest = ChatCompletionRequest(
            model = legacyRequest.model,
            messages = listOf(ChatMessage(role = "user", content = JsonPrimitive(prompt))),
            stream = legacyRequest.stream,
            temperature = legacyRequest.temperature,
            top_p = legacyRequest.top_p,
            max_tokens = legacyRequest.max_tokens
        )

        // Delegate to chat completions handler
        return handleChatCompletionsInternal(chatRequest, isLegacy = true)
    }

    private fun handleSyncChat(
        request: ChatCompletionRequest,
        chatRequest: ExternalChatRequest,
        isLegacy: Boolean = false
    ): Response {
        return try {
            val result = runBlocking {
                executor.execute(chatRequest)
            }

            if (!result.success) {
                return jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                    "error" to mapOf(
                        "message" to (result.error ?: "Unknown error"),
                        "type" to "server_error"
                    )
                )).withCors()
            }

            val responseText = result.aiResponse ?: ""
            if (responseText.isBlank() && result.error.isNullOrBlank()) {
                AppLogger.w(TAG, "handleSyncChat: AI returned empty response for model '${request.model}'")
            }
            AppLogger.d(TAG, "handleSyncChat: response length=${responseText.length}, success=${result.success}")
            val chatId = "chatcmpl-${java.util.UUID.randomUUID().toString().replace("-", "").take(24)}"
            val created = System.currentTimeMillis() / 1000

            val responseObj = if (isLegacy) {
                // Legacy completions format
                mapOf(
                    "id" to chatId,
                    "object" to "text_completion",
                    "created" to created,
                    "model" to request.model,
                    "choices" to listOf(
                        mapOf(
                            "index" to 0,
                            "text" to responseText,
                            "finish_reason" to "stop"
                        )
                    ),
                    "usage" to mapOf(
                        "prompt_tokens" to 0,
                        "completion_tokens" to 0,
                        "total_tokens" to 0
                    )
                )
            } else {
                // Chat completions format
                mapOf(
                    "id" to chatId,
                    "object" to "chat.completion",
                    "created" to created,
                    "model" to request.model,
                    "choices" to listOf(
                        mapOf(
                            "index" to 0,
                            "message" to mapOf(
                                "role" to "assistant",
                                "content" to responseText
                            ),
                            "finish_reason" to "stop"
                        )
                    ),
                    "usage" to mapOf(
                        "prompt_tokens" to 0,
                        "completion_tokens" to 0,
                        "total_tokens" to 0
                    )
                )
            }
            jsonResponse(Response.Status.OK, responseObj).withCors()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Sync chat completion failed", e)
            jsonResponse(Response.Status.INTERNAL_ERROR, mapOf(
                "error" to mapOf(
                    "message" to "Internal error: ${e.message}",
                    "type" to "server_error"
                )
            )).withCors()
        }
    }

    /**
     * Handle streaming chat with fallback: try real streaming first,
     * if it fails or hangs, fall back to simulated streaming (sync response sent as SSE chunks).
     * The fallback happens inside the SSE coroutine so the client always gets a valid SSE response.
     */
    private fun handleStreamChatWithFallback(
        request: ChatCompletionRequest,
        chatRequest: ExternalChatRequest,
        isLegacy: Boolean = false
    ): Response {
        val pipeInput = PipedInputStream(SSE_PIPE_BUFFER_SIZE)
        val pipeOutput = PipedOutputStream(pipeInput)

        val chatId = "chatcmpl-${java.util.UUID.randomUUID().toString().replace("-", "").take(24)}"
        val created = System.currentTimeMillis() / 1000
        val streamingSessionRef = AtomicReference<ExternalChatStreamingSession?>(null)

        val streamJob: Job = serviceScope.launch(Dispatchers.IO) {
            pipeOutput.bufferedWriter(StandardCharsets.UTF_8).use { writer ->
                try {
                    // Try real streaming with a timeout
                    val startResult = withTimeoutOrNull(30_000L) {
                        executor.startStreaming(chatRequest)
                    }

                    when {
                        startResult == null -> {
                            // Timeout - streaming start took too long, fall back
                            AppLogger.w(TAG, "Streaming start timed out, falling back to simulated stream")
                            executeSimulatedStream(writer, chatId, created, request, chatRequest, isLegacy)
                        }
                        startResult is ExternalChatStreamingStartResult.Failed -> {
                            // Streaming failed, fall back to simulated stream
                            AppLogger.w(TAG, "Streaming start failed: ${startResult.result.error}, falling back to simulated stream")
                            executeSimulatedStream(writer, chatId, created, request, chatRequest, isLegacy)
                        }
                        startResult is ExternalChatStreamingStartResult.Started -> {
                            val streamSession = startResult.session
                            streamingSessionRef.set(streamSession)

                            // Send initial chunk (role for chat, empty for legacy)
                            if (!isLegacy) {
                                val roleChunk = buildStreamChunk(chatId, created, request.model,
                                    deltaContent = null, deltaRole = "assistant", finishReason = null)
                                writeSseData(writer, json.encodeToString(roleChunk))
                            }

                            val filteredStream = ExternalChatResponseSanitizer.sanitizeStream(
                                streamSession.responseStreamSession.responseStream,
                                returnToolStatus = false
                            )

                            var hasContent = false
                            filteredStream.collect { chunk ->
                                if (chunk.isEmpty()) return@collect
                                hasContent = true
                                val deltaChunk = buildStreamChunk(chatId, created, request.model,
                                    deltaContent = chunk, deltaRole = null, finishReason = null, isLegacy = isLegacy)
                                writeSseData(writer, json.encodeToString(deltaChunk))
                            }

                            if (!hasContent) {
                                AppLogger.w(TAG, "handleStreamChat: AI returned empty response for model '${request.model}'")
                            }

                            // Send final chunk
                            val finalChunk = buildStreamFinalChunk(chatId, created, request.model, isLegacy)
                            writeSseData(writer, json.encodeToString(finalChunk))
                            writeSseData(writer, "[DONE]")
                        }
                    }
                } catch (e: CancellationException) {
                    streamingSessionRef.get()?.responseStreamSession?.cancel()
                    throw e
                } catch (e: IOException) {
                    AppLogger.i(TAG, "SSE client disconnected")
                    streamingSessionRef.get()?.responseStreamSession?.cancel()
                } catch (e: Exception) {
                    AppLogger.e(TAG, "SSE stream failed, falling back to simulated stream", e)
                    try {
                        // Fallback to simulated stream within the same SSE connection
                        executeSimulatedStream(writer, chatId, created, request, chatRequest, isLegacy)
                    } catch (fallbackError: Exception) {
                        AppLogger.e(TAG, "Simulated stream fallback also failed", fallbackError)
                        try {
                            val errorChunk = buildStreamChunk(chatId, created, request.model,
                                deltaContent = "\n[Error: ${e.message}]", deltaRole = null,
                                finishReason = "stop", isLegacy = isLegacy)
                            writeSseData(writer, json.encodeToString(errorChunk))
                            writeSseData(writer, "[DONE]")
                        } catch (_: Exception) {}
                    }
                } finally {
                    streamingSessionRef.get()?.cleanup()
                }
            }
        }

        val responseInput = object : FilterInputStream(pipeInput) {
            override fun close() {
                try {
                    super.close()
                } finally {
                    streamJob.cancel()
                    streamingSessionRef.get()?.responseStreamSession?.cancel()
                    streamingSessionRef.get()?.cleanup()
                }
            }
        }

        return newChunkedResponse(Response.Status.OK, SSE_MIME_TYPE, responseInput).apply {
            addHeader("Cache-Control", "no-cache")
            addHeader("Connection", "keep-alive")
            addHeader("X-Accel-Buffering", "no")
            addHeader("Access-Control-Allow-Origin", "*")
            addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
            addHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Requested-With, X-Api-Key, api-key, OpenAI-Organization, OpenAI-Beta, HTTP-Referer, X-Title, x-stainless-lang")
            addHeader("Access-Control-Expose-Headers", "X-Request-Id, OpenAI-Organization, OpenAI-Version, X-RateLimit-Limit-Requests, X-RateLimit-Limit-Tokens, X-RateLimit-Remaining-Requests, X-RateLimit-Remaining-Tokens")
            addHeader("Access-Control-Max-Age", "86400")
        }
    }

    /**
     * Execute a simulated stream: synchronous request sent as SSE chunks.
     * This is used as a fallback when real streaming fails.
     */
    private suspend fun executeSimulatedStream(
        writer: BufferedWriter,
        chatId: String,
        created: Long,
        request: ChatCompletionRequest,
        chatRequest: ExternalChatRequest,
        isLegacy: Boolean = false
    ) {
        // Send initial chunk (role for chat, nothing for legacy)
        if (!isLegacy) {
            val roleChunk = buildStreamChunk(chatId, created, request.model,
                deltaContent = null, deltaRole = "assistant", finishReason = null)
            writeSseData(writer, json.encodeToString(roleChunk))
        }

        val result = executor.execute(chatRequest)

        if (result.success) {
            val responseText = result.aiResponse ?: ""
            if (responseText.isNotEmpty()) {
                // Split into smaller chunks to simulate streaming
                val chunkSize = 64
                for (i in responseText.indices step chunkSize) {
                    val end = (i + chunkSize).coerceAtMost(responseText.length)
                    val textChunk = responseText.substring(i, end)
                    val contentChunk = buildStreamChunk(chatId, created, request.model,
                        deltaContent = textChunk, deltaRole = null, finishReason = null, isLegacy = isLegacy)
                    writeSseData(writer, json.encodeToString(contentChunk))
                }
            }
        } else {
            val errorMsg = result.error ?: "Unknown error"
            val errorChunk = buildStreamChunk(chatId, created, request.model,
                deltaContent = "[Error: $errorMsg]", deltaRole = null, finishReason = null, isLegacy = isLegacy)
            writeSseData(writer, json.encodeToString(errorChunk))
        }

        // Send final chunk
        val finalChunk = buildStreamFinalChunk(chatId, created, request.model, isLegacy)
        writeSseData(writer, json.encodeToString(finalChunk))
        writeSseData(writer, "[DONE]")
    }

    /**
     * Build a streaming chunk for both chat and legacy completions format.
     * For chat: uses "delta" with "content"/"role" keys and "chat.completion.chunk" object type.
     * For legacy: uses "text" directly and "text_completion" object type.
     */
    private fun buildStreamChunk(
        chatId: String,
        created: Long,
        model: String,
        deltaContent: String?,
        deltaRole: String?,
        finishReason: String?,
        isLegacy: Boolean = false
    ): Map<String, Any> {
        return if (isLegacy) {
            mapOf(
                "id" to chatId,
                "object" to "text_completion",
                "created" to created,
                "model" to model,
                "choices" to listOf(
                    mapOf(
                        "index" to 0,
                        "text" to (deltaContent ?: ""),
                        "finish_reason" to finishReason as Any?
                    )
                )
            )
        } else {
            val delta = mutableMapOf<String, Any>()
            deltaRole?.let { delta["role"] = it }
            deltaContent?.let { delta["content"] = it }
            mapOf(
                "id" to chatId,
                "object" to "chat.completion.chunk",
                "created" to created,
                "model" to model,
                "choices" to listOf(
                    mapOf(
                        "index" to 0,
                        "delta" to (if (delta.isEmpty()) emptyMap<String, Any>() else delta),
                        "finish_reason" to finishReason as Any?
                    )
                )
            )
        }
    }

    /**
     * Build the final streaming chunk that signals completion.
     */
    private fun buildStreamFinalChunk(
        chatId: String,
        created: Long,
        model: String,
        isLegacy: Boolean = false
    ): Map<String, Any> {
        return if (isLegacy) {
            mapOf(
                "id" to chatId,
                "object" to "text_completion",
                "created" to created,
                "model" to model,
                "choices" to listOf(
                    mapOf(
                        "index" to 0,
                        "text" to "",
                        "finish_reason" to "stop"
                    )
                )
            )
        } else {
            mapOf(
                "id" to chatId,
                "object" to "chat.completion.chunk",
                "created" to created,
                "model" to model,
                "choices" to listOf(
                    mapOf(
                        "index" to 0,
                        "delta" to emptyMap<String, Any>(),
                        "finish_reason" to "stop"
                    )
                )
            )
        }
    }

    private fun requireAuth(session: IHTTPSession): Response? {
        val expectedKey = preferences.getApiKey().trim()
        if (expectedKey.isBlank()) {
            return jsonResponse(Response.Status.UNAUTHORIZED, mapOf(
                "error" to mapOf(
                    "message" to "API key not configured on server",
                    "type" to "authentication_error"
                )
            )).withCors()
        }

        // Try multiple authentication methods for broader client compatibility:
        // 1. Authorization: Bearer <key> (standard OpenAI)
        // 2. X-Api-Key: <key> (some API gateways)
        // 3. api-key: <key> (Azure-style)
        // 4. ?key=<key> or ?api_key=<key> query parameter (some JS clients)

        // Method 1: Authorization Bearer header
        val authorization = session.headers.entries.firstOrNull {
            it.key.equals("authorization", ignoreCase = true)
        }?.value?.trim().orEmpty()

        val bearerKey = if (authorization.startsWith("Bearer ", ignoreCase = true)) {
            authorization.substringAfter(' ').trim()
        } else {
            ""
        }

        // Method 2: X-Api-Key header
        val xApiKey = session.headers.entries.firstOrNull {
            it.key.equals("X-Api-Key", ignoreCase = true)
        }?.value?.trim().orEmpty()

        // Method 3: api-key header (Azure style)
        val azureApiKey = session.headers.entries.firstOrNull {
            it.key.equals("api-key", ignoreCase = true)
        }?.value?.trim().orEmpty()

        // Method 4: Query parameter (key= or api_key=)
        val queryKey = session.parms?.let { params ->
            params["key"]?.trim() ?: params["api_key"]?.trim()
        } ?: ""

        val actualKey = when {
            bearerKey.isNotEmpty() -> bearerKey
            xApiKey.isNotEmpty() -> xApiKey
            azureApiKey.isNotEmpty() -> azureApiKey
            queryKey.isNotEmpty() -> queryKey
            else -> ""
        }

        return if (actualKey == expectedKey) {
            null
        } else {
            AppLogger.w(TAG, "Authentication failed from ${session.remoteIpAddress}, key prefix=${actualKey.take(4)}...")
            jsonResponse(Response.Status.UNAUTHORIZED, mapOf(
                "error" to mapOf(
                    "message" to "Invalid API key",
                    "type" to "authentication_error"
                )
            )).withCors()
        }
    }

    private fun handleOptions(session: IHTTPSession): Response {
        return newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "").withCors()
    }

    private fun readRequestBody(session: IHTTPSession): RequestBodyResult {
        return try {
            val contentLength = session.headers.entries.firstOrNull {
                it.key.equals("content-length", ignoreCase = true)
            }?.value?.trim()?.toLongOrNull()
                ?: return RequestBodyResult(error = "Missing or invalid Content-Length")
            if (contentLength < 0L || contentLength > Int.MAX_VALUE.toLong()) {
                return RequestBodyResult(error = "Unsupported Content-Length: $contentLength")
            }
            if (contentLength == 0L) {
                return RequestBodyResult(body = "")
            }

            val bodyBytes = ByteArray(contentLength.toInt())
            var offset = 0
            val inputStream = session.inputStream
            while (offset < bodyBytes.size) {
                val read = inputStream.read(bodyBytes, offset, bodyBytes.size - offset)
                if (read < 0) {
                    return RequestBodyResult(error = "Unexpected end of stream")
                }
                offset += read
            }
            RequestBodyResult(body = String(bodyBytes, StandardCharsets.UTF_8))
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to read HTTP request body", e)
            RequestBodyResult(error = "Failed to read request body: ${e.message ?: "Unknown error"}")
        }
    }

    private fun jsonResponse(status: Response.Status, body: Any): Response {
        val bodyStr = when (body) {
            is String -> body
            else -> json.encodeToString(mapToJson(body))
        }
        return newFixedLengthResponse(status, JSON_MIME_TYPE, bodyStr)
    }

    @Suppress("UNCHECKED_CAST")
    private fun mapToJson(value: Any): JsonElement {
        return when (value) {
            is JsonElement -> value
            is Map<*, *> -> {
                val map = value as Map<String, Any?>
                JsonObject(map.mapValues { (_, v) -> if (v != null) mapToJson(v) else JsonPrimitive(null) })
            }
            is List<*> -> {
                JsonArray(value.map { if (it != null) mapToJson(it) else JsonPrimitive(null) })
            }
            is String -> JsonPrimitive(value)
            is Number -> JsonPrimitive(value)
            is Boolean -> JsonPrimitive(value)
            null -> JsonPrimitive(null)
            else -> JsonPrimitive(value.toString())
        }
    }

    /**
     * Inject an image URL (data URI or http/https URL) into ImagePoolManager
     * so that MNN/LLAMA providers can pick it up via preprocessMultimodalText.
     * Returns the image ID or null on failure.
     */
    private fun injectImageUrlToPool(url: String): String? {
        return try {
            if (url.startsWith("data:image/")) {
                // data:image/png;base64,xxxxx format
                val separatorIdx = url.indexOf(",")
                if (separatorIdx < 0) return null
                val headerPart = url.substring(0, separatorIdx)
                val base64Data = url.substring(separatorIdx + 1)
                val mimeType = headerPart.substringAfter("data:").substringBefore(";")
                com.ai.assistance.operit.util.ImagePoolManager.addImageFromBase64(base64Data, mimeType)
                    .takeIf { it != "error" }
            } else if (url.startsWith("http://") || url.startsWith("https://")) {
                // Download image from URL, then register
                kotlinx.coroutines.runBlocking {
                    try {
                        val connection = java.net.URL(url).openConnection()
                        connection.connectTimeout = 10000
                        connection.readTimeout = 10000
                        val inputStream = connection.getInputStream()
                        val bytes = inputStream.readBytes()
                        inputStream.close()
                        // Convert to base64 and register
                        val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                        // Guess mime type from URL
                        val mimeType = when {
                            url.contains(".png", ignoreCase = true) -> "image/png"
                            url.contains(".gif", ignoreCase = true) -> "image/gif"
                            url.contains(".webp", ignoreCase = true) -> "image/webp"
                            else -> "image/jpeg"
                        }
                        com.ai.assistance.operit.util.ImagePoolManager.addImageFromBase64(base64, mimeType)
                            .takeIf { it != "error" }
                    } catch (e: Exception) {
                        AppLogger.e(TAG, "Failed to download image from URL: $url", e)
                        null
                    }
                }
            } else {
                AppLogger.w(TAG, "Unsupported image URL format: ${url.take(50)}")
                null
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to inject image to pool", e)
            null
        }
    }

    private fun writeSseData(writer: BufferedWriter, data: String) {
        writer.write("data: ")
        writer.write(data)
        writer.newLine()
        writer.newLine()
        writer.flush()
    }

    private fun Response.withCors(): Response {
        addHeader("Access-Control-Allow-Origin", "*")
        addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
        addHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Requested-With, X-Api-Key, api-key, OpenAI-Organization, OpenAI-Beta, HTTP-Referer, X-Title, x-stainless-lang")
        addHeader("Access-Control-Expose-Headers", "X-Request-Id, OpenAI-Organization, OpenAI-Version, X-RateLimit-Limit-Requests, X-RateLimit-Limit-Tokens, X-RateLimit-Remaining-Requests, X-RateLimit-Remaining-Tokens")
        addHeader("Access-Control-Max-Age", "86400")
        return this
    }

    private fun String.removeTrailingSlash(): String =
        if (endsWith("/") && length > 1) dropLast(1) else this

    companion object {
        private const val TAG = "OpenAiCompatHttpServer"
        private const val LISTEN_HOST = "0.0.0.0"
        // /v1/ prefixed paths (standard OpenAI format)
        private const val PATH_MODELS = "/v1/models"
        private const val PATH_MODELS_ALT = "/v1/models/"
        private const val PATH_CHAT_COMPLETIONS = "/v1/chat/completions"
        private const val PATH_CHAT_COMPLETIONS_ALT = "/v1/chat/completions/"
        private const val PATH_COMPLETIONS = "/v1/completions"
        private const val PATH_COMPLETIONS_ALT = "/v1/completions/"
        private const val PATH_EMBEDDINGS = "/v1/embeddings"
        private const val PATH_EMBEDDINGS_ALT = "/v1/embeddings/"
        // Without /v1/ prefix (some providers/clients use these)
        private const val PATH_MODELS_NO_V1 = "/models"
        private const val PATH_MODELS_NO_V1_ALT = "/models/"
        private const val PATH_CHAT_COMPLETIONS_NO_V1 = "/chat/completions"
        private const val PATH_CHAT_COMPLETIONS_NO_V1_ALT = "/chat/completions/"
        private const val PATH_COMPLETIONS_NO_V1 = "/completions"
        private const val PATH_COMPLETIONS_NO_V1_ALT = "/completions/"
        private const val PATH_EMBEDDINGS_NO_V1 = "/embeddings"
        private const val PATH_EMBEDDINGS_NO_V1_ALT = "/embeddings/"
        private const val JSON_MIME_TYPE = "application/json; charset=utf-8"
        private const val SSE_MIME_TYPE = "text/event-stream; charset=utf-8"
        private const val SSE_PIPE_BUFFER_SIZE = 64 * 1024
        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }
}

@Serializable
data class ChatCompletionRequest(
    val model: String = "",
    val messages: List<ChatMessage> = emptyList(),
    val stream: Boolean = false,
    val temperature: Double? = null,
    val top_p: Double? = null,
    val n: Int? = null,
    val max_tokens: Int? = null,
    val max_completion_tokens: Int? = null,
    val stop: JsonElement? = null,
    val presence_penalty: Double? = null,
    val frequency_penalty: Double? = null,
    val logprobs: Boolean? = null,
    val top_logprobs: Int? = null,
    val response_format: JsonElement? = null,
    val seed: Long? = null,
    val tools: JsonArray? = null,
    val tool_choice: JsonElement? = null,
    val user: String? = null,
    val stream_options: JsonElement? = null
)

@Serializable
data class LegacyCompletionRequest(
    val model: String = "",
    val prompt: String? = null,
    val stream: Boolean = false,
    val temperature: Double? = null,
    val top_p: Double? = null,
    val max_tokens: Int? = null,
    val n: Int? = null,
    val stop: JsonElement? = null,
    val presence_penalty: Double? = null,
    val frequency_penalty: Double? = null,
    val logprobs: Int? = null,
    val echo: Boolean? = null,
    val user: String? = null
)

@Serializable
data class EmbeddingRequest(
    val model: String = "",
    @kotlinx.serialization.json.JsonNames("input")
    val input: kotlinx.serialization.json.JsonElement = kotlinx.serialization.json.JsonArray(emptyList()),
    val encoding_format: String? = null
) {
    /** Parse input into a list of strings, handling both string and array formats */
    fun getInputTexts(): List<String> {
        return when (input) {
            is kotlinx.serialization.json.JsonPrimitive -> listOf(input.content)
            is kotlinx.serialization.json.JsonArray -> input.mapNotNull {
                (it as? kotlinx.serialization.json.JsonPrimitive)?.content
            }
            else -> emptyList()
        }
    }
}

@Serializable
data class ChatMessage(
    val role: String,
    val content: JsonElement = JsonPrimitive(""),
    @kotlinx.serialization.json.JsonNames("image_url")
    val imageUrl: ImageUrlContent? = null
) {
    /** Extract plain text content from either string or array content format */
    fun extractTextContent(): String {
        return when (content) {
            is JsonPrimitive -> content.contentOrNull ?: ""
            is JsonArray -> content
                .filterIsInstance<JsonObject>()
                .filter { it["type"]?.let { t -> (t as? JsonPrimitive)?.contentOrNull == "text" } == true }
                .mapNotNull { (it["text"] as? JsonPrimitive)?.contentOrNull }
                .joinToString("\n")
            else -> content.toString()
        }
    }

    /** Extract image URLs from array content format (OpenAI vision format) */
    fun extractImageUrls(): List<String> {
        val urls = mutableListOf<String>()
        // From content array
        if (content is JsonArray) {
            content.filterIsInstance<JsonObject>().forEach { item ->
                if (item["type"]?.let { t -> (t as? JsonPrimitive)?.contentOrNull == "image_url" } == true) {
                    val urlObj = item["image_url"] as? JsonObject
                    val url = urlObj?.get("url")?.let { (it as? JsonPrimitive)?.contentOrNull }
                    if (url != null) urls.add(url)
                }
            }
        }
        // From top-level image_url field
        imageUrl?.url?.let { urls.add(it) }
        return urls
    }
}

@Serializable
data class ImageUrlContent(
    val url: String = "",
    val detail: String? = null
)

private data class RequestBodyResult(
    val body: String? = null,
    val error: String? = null
)
