package com.ai.assistance.llama

object LlamaNative {

    init {
        LlamaLibraryLoader.loadLibraries()
    }

    @JvmStatic external fun nativeIsAvailable(): Boolean

    @JvmStatic external fun nativeGetUnavailableReason(): String

    @JvmStatic
    external fun nativeCreateSession(
        pathModel: String,
        nThreads: Int,
        nCtx: Int,
        nBatch: Int,
        nUBatch: Int,
        nGpuLayers: Int,
        useMmap: Boolean,
        flashAttention: Boolean,
        kvUnified: Boolean,
        offloadKqv: Boolean
    ): Long

    @JvmStatic external fun nativeReleaseSession(sessionPtr: Long)

    @JvmStatic external fun nativeCancel(sessionPtr: Long)

    @JvmStatic external fun nativeCountTokens(sessionPtr: Long, text: String): Int

    @JvmStatic
    external fun nativeSetSamplingParams(
        sessionPtr: Long,
        temperature: Float,
        topP: Float,
        topK: Int,
        repetitionPenalty: Float,
        frequencyPenalty: Float,
        presencePenalty: Float,
        penaltyLastN: Int
    ): Boolean

    @JvmStatic
    external fun nativeApplyChatTemplate(
        sessionPtr: Long,
        roles: Array<String>,
        contents: Array<String>,
        addAssistant: Boolean
    ): String?

    @JvmStatic
    external fun nativeApplyStructuredChatTemplate(
        sessionPtr: Long,
        messagesJson: String,
        toolsJson: String?,
        addAssistant: Boolean
    ): String?

    @JvmStatic
    external fun nativeGenerateStream(
        sessionPtr: Long,
        prompt: String,
        maxTokens: Int,
        callback: GenerationCallback
    ): Boolean

    @JvmStatic
    external fun nativeClearToolCallGrammar(sessionPtr: Long): Boolean

    @JvmStatic
    external fun nativeParseToolCallResponse(
        sessionPtr: Long,
        content: String
    ): String?

    /**
     * Compute embedding vector for the given text using a GGUF model file.
     * Creates a temporary embedding context with pooling_type=MEAN.
     * @param pathModel Absolute path to the GGUF model file
     * @param text Input text to embed
     * @param nThreads Number of threads to use
     * @return Embedding vector as FloatArray, or null on failure
     */
    @JvmStatic
    external fun nativeGetEmbedding(
        pathModel: String,
        text: String,
        nThreads: Int
    ): FloatArray?

    interface GenerationCallback {
        fun onToken(token: String): Boolean
    }
}
