package com.ai.assistance.operit.api.voice

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.ai.assistance.operit.R
import com.ai.assistance.operit.data.preferences.SpeechServicesPreferences
import com.ai.assistance.operit.util.AppLogger
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.DoubleBuffer
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.LongBuffer
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * 本地 ONNX TTS provider。
 *
 * 当前实现负责 ONNX Runtime 推理和 PCM 播放；文本前端由配置文件中的 token/phoneme
 * id 映射提供，或由调用方通过 extraParams["token_ids"] / ["phoneme_ids"] 直接传入。
 */
class OnnxVoiceProvider(
    private val context: Context,
    private val config: SpeechServicesPreferences.TtsHttpConfig
) : VoiceService {

    private companion object {
        private const val TAG = "OnnxVoiceProvider"
        private const val SPEECH_PREVIEW_MAX = 48
        private const val DEFAULT_CHUNK_FRAMES = 2048
    }

    private data class RuntimeConfig(
        val sampleRate: Int,
        val tokenMap: Map<String, List<Long>>,
        val addBlank: Boolean,
        val blankId: Long?,
        val bosIds: List<Long>,
        val eosIds: List<Long>,
        val noiseScale: Float?,
        val lengthScale: Float?,
        val noiseW: Float?
    )

    private data class InputBindings(
        val idsInputName: String,
        val lengthInputName: String?,
        val scalesInputName: String?,
        val sidInputName: String?
    )

    private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private val initializeMutex = Mutex()
    private val playbackMutex = Mutex()
    private val stateLock = Any()
    private val providerScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val speakQueue = Channel<SpeakRequest>(Channel.UNLIMITED)
    private val playbackQueue = Channel<PreparedSpeech>(capacity = 1)
    private val stopGeneration = AtomicLong(0)

    private var session: OrtSession? = null
    private var runtimeConfig: RuntimeConfig? = null
    private var inputBindings: InputBindings? = null
    private var currentSpeakerId: String = config.voiceId.trim()

    private var currentAudioTrack: AudioTrack? = null
    private var playbackGeneration: Long = 0L
    private var paused = false

    private data class SpeakRequest(
        val text: String,
        val rate: Float?,
        val pitch: Float?,
        val extraParams: Map<String, String>,
        val generation: Long,
        val completion: CompletableDeferred<Boolean>
    )

    private data class PreparedSpeech(
        val request: SpeakRequest,
        val pcm: ShortArray,
        val sampleRate: Int
    )

    private val _isInitialized = MutableStateFlow(false)
    override val isInitialized: Boolean
        get() = _isInitialized.value

    private val _isSpeaking = MutableStateFlow(false)
    override val isSpeaking: Boolean
        get() = _isSpeaking.value

    override val speakingStateFlow: Flow<Boolean> = _isSpeaking.asStateFlow()

    init {
        providerScope.launch {
            for (request in speakQueue) {
                try {
                    if (request.generation != stopGeneration.get()) {
                        request.completion.complete(false)
                        continue
                    }

                    val prepared = prepareSpeech(request)
                    if (prepared == null) {
                        request.completion.complete(false)
                    } else {
                        playbackQueue.send(prepared)
                    }
                } catch (e: Exception) {
                    request.completion.completeExceptionally(e)
                }
            }
        }

        providerScope.launch {
            for (prepared in playbackQueue) {
                try {
                    if (prepared.request.generation != stopGeneration.get()) {
                        prepared.request.completion.complete(false)
                        continue
                    }

                    val result = playbackMutex.withLock {
                        val generation = synchronized(stateLock) { playbackGeneration }
                        playPcm16(prepared.pcm, prepared.sampleRate, generation)
                    }
                    prepared.request.completion.complete(result)
                } catch (e: Exception) {
                    prepared.request.completion.completeExceptionally(e)
                }
            }
        }
    }

    override suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        initializeMutex.withLock {
            if (_isInitialized.value && session != null && runtimeConfig != null && inputBindings != null) {
                return@withLock true
            }

            try {
                val modelPath = normalizeLocalPath(config.urlTemplate)
                val configPath = normalizeLocalPath(config.modelName)

                if (modelPath.isBlank()) {
                    throw TtsException(context.getString(R.string.onnx_tts_error_model_path_not_set))
                }
                if (configPath.isBlank()) {
                    throw TtsException(context.getString(R.string.onnx_tts_error_config_path_not_set))
                }

                val modelFile = File(modelPath)
                if (!modelFile.exists() || !modelFile.isFile) {
                    throw TtsException(context.getString(R.string.onnx_tts_error_model_file_not_found, modelPath))
                }

                val configFile = File(configPath)
                if (!configFile.exists() || !configFile.isFile) {
                    throw TtsException(context.getString(R.string.onnx_tts_error_config_file_not_found, configPath))
                }

                val parsedConfig = parseRuntimeConfig(configFile)
                val opts = OrtSession.SessionOptions().apply {
                    val threadCount = optionalHeaderInt("threads") ?: 1
                    setIntraOpNumThreads(threadCount)
                    setInterOpNumThreads(1)
                    setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                }
                val createdSession = env.createSession(modelFile.absolutePath, opts)
                val bindings = try {
                    resolveInputBindings(createdSession)
                } catch (e: Exception) {
                    createdSession.close()
                    throw e
                }

                session?.close()
                session = createdSession
                runtimeConfig = parsedConfig
                inputBindings = bindings
                _isInitialized.value = true

                AppLogger.d(
                    TAG,
                    "Initialized ONNX TTS model=${modelFile.absolutePath} inputs=${createdSession.inputNames} outputs=${createdSession.outputNames} sampleRate=${parsedConfig.sampleRate} bindings=$bindings"
                )
                true
            } catch (e: Exception) {
                _isInitialized.value = false
                AppLogger.e(TAG, "ONNX TTS initialize failed", e)
                if (e is TtsException) throw e
                throw TtsException(context.getString(R.string.onnx_tts_error_init_failed), cause = e)
            }
        }
    }

    override suspend fun speak(
        text: String,
        interrupt: Boolean,
        rate: Float?,
        pitch: Float?,
        extraParams: Map<String, String>
    ): Boolean = withContext(Dispatchers.IO) {
        if (interrupt) {
            clearForInterrupt()
        }

        val completion = CompletableDeferred<Boolean>()
        val request = SpeakRequest(
            text = text,
            rate = rate,
            pitch = pitch,
            extraParams = extraParams,
            generation = stopGeneration.get(),
            completion = completion
        )
        speakQueue.send(request)
        completion.await()
    }

    private suspend fun prepareSpeech(request: SpeakRequest): PreparedSpeech? {
        if (!isInitialized) {
            val initOk = initialize()
            if (!initOk) return null
        }

        if (request.generation != stopGeneration.get()) {
            return null
        }

        val activeSession = session
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_init_failed))
        val activeConfig = runtimeConfig
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_init_failed))
        val bindings = inputBindings
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_init_failed))

        try {
            val prefs = SpeechServicesPreferences(context.applicationContext)
            val effectiveRate = request.rate ?: prefs.ttsSpeechRateFlow.first()
            val ids = tokenize(request.text, activeConfig, request.extraParams)
            if (ids.isEmpty()) {
                throw TtsException(context.getString(R.string.onnx_tts_error_tokenize_failed, "empty token ids"))
            }

            AppLogger.d(
                TAG,
                "speak len=${request.text.length} preview=\"${speechPreview(request.text)}\" ids=${ids.size} rate=$effectiveRate pitch=${request.pitch} speaker=$currentSpeakerId"
            )

            val pcm = runModel(activeSession, activeConfig, bindings, ids, effectiveRate)
            if (pcm.isEmpty()) {
                throw TtsException(context.getString(R.string.onnx_tts_error_output_empty))
            }
            if (request.generation != stopGeneration.get()) {
                return null
            }

            return PreparedSpeech(request, pcm, activeConfig.sampleRate)
        } catch (e: Exception) {
            AppLogger.e(TAG, "ONNX TTS speak failed", e)
            if (e is TtsException) throw e
            throw TtsException(context.getString(R.string.onnx_tts_error_request_failed), cause = e)
        }
    }

    private fun runModel(
        activeSession: OrtSession,
        activeConfig: RuntimeConfig,
        bindings: InputBindings,
        ids: LongArray,
        effectiveRate: Float
    ): ShortArray {
        val toClose = ArrayList<AutoCloseable>()
        val inputs = LinkedHashMap<String, OnnxTensor>()

        try {
            val idsInfo = tensorInfo(activeSession, bindings.idsInputName)
            val idsShape = shapeForValues(idsInfo, ids.size, bindings.idsInputName)
            val idsTensor = createIntegerTensor(bindings.idsInputName, ids, idsShape, idsInfo)
            toClose.add(idsTensor)
            inputs[bindings.idsInputName] = idsTensor

            bindings.lengthInputName?.let { name ->
                val lengthInfo = tensorInfo(activeSession, name)
                val lengthShape = shapeForValues(lengthInfo, 1, name)
                val lengthTensor = createIntegerTensor(
                    name = name,
                    values = longArrayOf(ids.size.toLong()),
                    shape = lengthShape,
                    info = lengthInfo
                )
                toClose.add(lengthTensor)
                inputs[name] = lengthTensor
            }

            bindings.scalesInputName?.let { name ->
                val noiseScale = activeConfig.noiseScale
                    ?: throw TtsException(context.getString(R.string.onnx_tts_error_scales_not_set, "noise_scale"))
                val lengthScale = activeConfig.lengthScale
                    ?: throw TtsException(context.getString(R.string.onnx_tts_error_scales_not_set, "length_scale"))
                val noiseW = activeConfig.noiseW
                    ?: throw TtsException(context.getString(R.string.onnx_tts_error_scales_not_set, "noise_w"))
                val scales = floatArrayOf(noiseScale, lengthScale / effectiveRate.coerceAtLeast(0.01f), noiseW)
                val scalesInfo = tensorInfo(activeSession, name)
                val scalesShape = shapeForValues(scalesInfo, scales.size, name)
                val scalesTensor = createFloatTensor(name, scales, scalesShape, scalesInfo)
                toClose.add(scalesTensor)
                inputs[name] = scalesTensor
            }

            bindings.sidInputName?.let { name ->
                val speaker = currentSpeakerId.toLongOrNull()
                    ?: throw TtsException(context.getString(R.string.onnx_tts_error_speaker_required))
                val sidInfo = tensorInfo(activeSession, name)
                val sidShape = shapeForValues(sidInfo, 1, name)
                val sidTensor = createIntegerTensor(name, longArrayOf(speaker), sidShape, sidInfo)
                toClose.add(sidTensor)
                inputs[name] = sidTensor
            }

            activeSession.run(inputs).use { result ->
                val firstOutput = result.get(0).value
                return extractPcm16(firstOutput)
            }
        } finally {
            for (i in toClose.indices.reversed()) {
                try {
                    toClose[i].close()
                } catch (_: Exception) {
                }
            }
        }
    }

    private suspend fun playPcm16(pcm: ShortArray, sampleRate: Int, generation: Long): Boolean {
        val channelMask = AudioFormat.CHANNEL_OUT_MONO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT
        val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelMask, audioFormat)
        if (minBufferSize <= 0) {
            throw TtsException(context.getString(R.string.onnx_tts_error_playback_failed, minBufferSize))
        }
        val bufferSize = minBufferSize.coerceAtLeast(DEFAULT_CHUNK_FRAMES * 2)

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(audioFormat)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelMask)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(bufferSize)
            .build()

        var shouldReleaseImmediately = false
        synchronized(stateLock) {
            if (playbackGeneration == generation) {
                currentAudioTrack?.release()
                currentAudioTrack = track
                paused = false
            } else {
                shouldReleaseImmediately = true
            }
        }
        if (shouldReleaseImmediately) {
            track.release()
            return false
        }

        try {
            track.play()
            _isSpeaking.value = true

            var offset = 0
            while (offset < pcm.size) {
                if (!isCurrentPlayback(generation)) return false
                while (isPlaybackPaused(generation)) {
                    delay(50)
                }
                val count = minOf(DEFAULT_CHUNK_FRAMES, pcm.size - offset)
                val written = track.write(pcm, offset, count, AudioTrack.WRITE_NON_BLOCKING)
                if (written < 0) {
                    throw TtsException(context.getString(R.string.onnx_tts_error_playback_failed, written))
                }
                if (written == 0) {
                    delay(10)
                    continue
                }
                offset += written
            }

            while (isCurrentPlayback(generation) && track.playbackHeadPosition < pcm.size) {
                if (isPlaybackPaused(generation)) {
                    delay(50)
                } else {
                    delay(20)
                }
            }

            return isCurrentPlayback(generation)
        } finally {
            synchronized(stateLock) {
                if (currentAudioTrack === track) {
                    currentAudioTrack = null
                }
                paused = false
            }
            _isSpeaking.value = false
            try {
                track.stop()
            } catch (_: Exception) {
            }
            try {
                track.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun clearPendingRequests() {
        while (true) {
            val request = speakQueue.tryReceive().getOrNull() ?: break
            request.completion.complete(false)
        }
    }

    private fun clearPendingPlayback() {
        while (true) {
            val prepared = playbackQueue.tryReceive().getOrNull() ?: break
            prepared.request.completion.complete(false)
        }
    }

    private fun clearForInterrupt() {
        stopGeneration.incrementAndGet()
        clearPendingRequests()
        clearPendingPlayback()
        stopPlaybackOnly()
    }

    private fun stopPlaybackOnly(): Boolean {
        val track = synchronized(stateLock) {
            playbackGeneration++
            paused = false
            val active = currentAudioTrack
            currentAudioTrack = null
            active
        }

        return try {
            track?.let {
                try {
                    it.pause()
                    it.flush()
                    it.stop()
                } catch (_: Exception) {
                }
                it.release()
            }
            _isSpeaking.value = false
            track != null
        } catch (e: Exception) {
            AppLogger.e(TAG, "Stop ONNX TTS playback failed", e)
            false
        }
    }

    override suspend fun stop(): Boolean = withContext(Dispatchers.IO) {
        stopGeneration.incrementAndGet()
        clearPendingRequests()
        clearPendingPlayback()
        stopPlaybackOnly()
        true
    }

    override suspend fun pause(): Boolean = withContext(Dispatchers.IO) {
        val track = synchronized(stateLock) {
            currentAudioTrack?.also { paused = true }
        } ?: return@withContext false

        return@withContext try {
            track.pause()
            _isSpeaking.value = false
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Pause ONNX TTS playback failed", e)
            false
        }
    }

    override suspend fun resume(): Boolean = withContext(Dispatchers.IO) {
        val track = synchronized(stateLock) {
            currentAudioTrack?.also { paused = false }
        } ?: return@withContext false

        return@withContext try {
            track.play()
            _isSpeaking.value = true
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Resume ONNX TTS playback failed", e)
            false
        }
    }

    override fun shutdown() {
        stopGeneration.incrementAndGet()
        providerScope.cancel()
        clearPendingRequests()
        clearPendingPlayback()
        speakQueue.close()
        playbackQueue.close()

        synchronized(stateLock) {
            playbackGeneration++
            paused = false
            currentAudioTrack?.release()
            currentAudioTrack = null
        }
        _isSpeaking.value = false
        _isInitialized.value = false

        try {
            session?.close()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Close ONNX TTS session failed", e)
        } finally {
            session = null
            runtimeConfig = null
            inputBindings = null
        }
    }

    override suspend fun getAvailableVoices(): List<VoiceService.Voice> = withContext(Dispatchers.IO) {
        val speakerCount = optionalHeaderInt("speaker_count") ?: return@withContext emptyList()
        val locale = config.localeTag.ifBlank { "und" }
        return@withContext (0 until speakerCount).map { id ->
            VoiceService.Voice(id.toString(), "Speaker $id", locale, "NEUTRAL")
        }
    }

    override suspend fun setVoice(voiceId: String): Boolean = withContext(Dispatchers.IO) {
        currentSpeakerId = voiceId.trim()
        true
    }

    private fun parseRuntimeConfig(configFile: File): RuntimeConfig {
        val root = try {
            JSONObject(configFile.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            throw TtsException(context.getString(R.string.onnx_tts_error_config_parse_failed), cause = e)
        }

        val sampleRate = optionalHeaderInt("sample_rate")
            ?: root.optJSONObject("audio")?.optionalInt("sample_rate")
            ?: root.optionalInt("sample_rate")
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_sample_rate_not_set))

        if (sampleRate <= 0) {
            throw TtsException(context.getString(R.string.onnx_tts_error_sample_rate_not_set))
        }

        val tokenSource = firstTokenMapObject(root)
        val tokenSourceObject = tokenSource?.second
        val tokenMap = tokenSourceObject?.let { parseTokenMap(it) }
            ?: firstTokenArray(root)?.let { parseTokenArray(it) }
            ?: emptyMap()
        val inference = root.optJSONObject("inference")
        val blankId = optionalHeaderLong("blank_token_id")
            ?: tokenSourceObject?.let { readFirstTokenId(it, "_") }
            ?: tokenSourceObject?.let { readFirstTokenId(it, "") }
            ?: tokenSourceObject?.let { readFirstTokenId(it, "<blank>") }
        val addBlank = optionalHeaderBool("add_blank")
            ?: optionalHeaderBool("interleave_blank")
            ?: (tokenSource?.first == "phoneme_id_map" && blankId != null)

        return RuntimeConfig(
            sampleRate = sampleRate,
            tokenMap = tokenMap,
            addBlank = addBlank,
            blankId = blankId,
            bosIds = optionalHeaderIds("bos_token_ids")
                ?: optionalHeaderLong("bos_token_id")?.let { listOf(it) }
                ?: tokenSourceObject?.let { readTokenIds(it, "^") }.orEmpty(),
            eosIds = optionalHeaderIds("eos_token_ids")
                ?: optionalHeaderLong("eos_token_id")?.let { listOf(it) }
                ?: tokenSourceObject?.let { readTokenIds(it, "\$") }.orEmpty(),
            noiseScale = optionalHeaderFloat("noise_scale") ?: inference?.optionalFloat("noise_scale"),
            lengthScale = optionalHeaderFloat("length_scale") ?: inference?.optionalFloat("length_scale"),
            noiseW = optionalHeaderFloat("noise_w") ?: inference?.optionalFloat("noise_w")
        )
    }

    private fun resolveInputBindings(activeSession: OrtSession): InputBindings {
        val inputNames = activeSession.inputNames.toSet()
        val idsInput = resolveInputName(
            inputNames = inputNames,
            explicitHeaderKeys = listOf("ids_input", "input_ids_name"),
            candidates = listOf("input", "input_ids", "ids", "text", "x"),
            requiredLabel = "input ids"
        )
        val lengthInput = resolveOptionalInputName(
            inputNames = inputNames,
            explicitHeaderKeys = listOf("length_input", "input_lengths_name"),
            candidates = listOf("input_lengths", "text_lengths", "lengths", "x_lengths")
        )
        val scalesInput = resolveOptionalInputName(
            inputNames = inputNames,
            explicitHeaderKeys = listOf("scales_input", "scales_name"),
            candidates = listOf("scales")
        )
        val sidInput = resolveOptionalInputName(
            inputNames = inputNames,
            explicitHeaderKeys = listOf("sid_input", "speaker_input"),
            candidates = listOf("sid", "speaker_id", "speaker")
        )

        return InputBindings(
            idsInputName = idsInput,
            lengthInputName = lengthInput,
            scalesInputName = scalesInput,
            sidInputName = sidInput
        )
    }

    private fun resolveInputName(
        inputNames: Set<String>,
        explicitHeaderKeys: List<String>,
        candidates: List<String>,
        requiredLabel: String
    ): String {
        explicitHeaderKeys.firstNotNullOfOrNull { key ->
            config.headers[key]?.trim()?.takeIf { it.isNotBlank() }
        }?.let { explicit ->
            if (explicit !in inputNames) {
                throw TtsException(context.getString(R.string.onnx_tts_error_input_not_found, explicit))
            }
            return explicit
        }

        return candidates.firstOrNull { it in inputNames }
            ?: throw TtsException(
                context.getString(
                    R.string.onnx_tts_error_input_name_not_resolved,
                    requiredLabel,
                    inputNames.joinToString()
                )
            )
    }

    private fun resolveOptionalInputName(
        inputNames: Set<String>,
        explicitHeaderKeys: List<String>,
        candidates: List<String>
    ): String? {
        explicitHeaderKeys.firstNotNullOfOrNull { key ->
            config.headers[key]?.trim()?.takeIf { it.isNotBlank() }
        }?.let { explicit ->
            if (explicit !in inputNames) {
                throw TtsException(context.getString(R.string.onnx_tts_error_input_not_found, explicit))
            }
            return explicit
        }
        return candidates.firstOrNull { it in inputNames }
    }

    private fun tokenize(
        text: String,
        activeConfig: RuntimeConfig,
        extraParams: Map<String, String>
    ): LongArray {
        val directIds = listOf("token_ids", "phoneme_ids", "ids")
            .firstNotNullOfOrNull { key -> extraParams[key]?.takeIf { it.isNotBlank() } }
        if (directIds != null) {
            return parseIds(directIds, "extra token ids").toLongArray()
        }

        val textMode = config.headers["text_mode"]?.trim().orEmpty()
        if (textMode.equals("token_ids", ignoreCase = true) || textMode.equals("phoneme_ids", ignoreCase = true)) {
            return parseIds(text, "text token ids").toLongArray()
        }

        if (activeConfig.tokenMap.isEmpty()) {
            throw TtsException(context.getString(R.string.onnx_tts_error_tokenize_failed, "token map is empty"))
        }

        val ids = ArrayList<Long>()
        ids.addAll(activeConfig.bosIds)
        for (symbol in tokenizeSymbolsByMap(text, activeConfig.tokenMap)) {
            val mapped = activeConfig.tokenMap[symbol]
                ?: throw TtsException(
                    context.getString(
                        R.string.onnx_tts_error_unknown_token,
                        printableSymbol(symbol)
                    )
                )
            ids.addAll(mapped)
        }
        ids.addAll(activeConfig.eosIds)

        if (activeConfig.addBlank && ids.isNotEmpty()) {
            val blank = activeConfig.blankId
                ?: throw TtsException(context.getString(R.string.onnx_tts_error_blank_token_not_set))
            val withBlank = ArrayList<Long>(ids.size * 2 - 1)
            ids.forEachIndexed { index, id ->
                if (index > 0) {
                    withBlank.add(blank)
                }
                withBlank.add(id)
            }
            return withBlank.toLongArray()
        }

        return ids.toLongArray()
    }

    private fun tensorInfo(activeSession: OrtSession, name: String): TensorInfo {
        return activeSession.inputInfo[name]?.info as? TensorInfo
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_tensor_info_missing, name))
    }

    private fun createIntegerTensor(
        name: String,
        values: LongArray,
        shape: LongArray,
        info: TensorInfo
    ): OnnxTensor {
        return when (info.type) {
            OnnxJavaType.INT64 -> OnnxTensor.createTensor(env, LongBuffer.wrap(values), shape)
            OnnxJavaType.INT32 -> {
                val intValues = IntArray(values.size) { index ->
                    val value = values[index]
                    if (value < Int.MIN_VALUE || value > Int.MAX_VALUE) {
                        throw TtsException(context.getString(R.string.onnx_tts_error_integer_out_of_range, name))
                    }
                    value.toInt()
                }
                OnnxTensor.createTensor(env, IntBuffer.wrap(intValues), shape)
            }
            else -> throw TtsException(
                context.getString(R.string.onnx_tts_error_unsupported_input_type, name, info.type.name)
            )
        }
    }

    private fun createFloatTensor(
        name: String,
        values: FloatArray,
        shape: LongArray,
        info: TensorInfo
    ): OnnxTensor {
        return when (info.type) {
            OnnxJavaType.FLOAT -> OnnxTensor.createTensor(env, FloatBuffer.wrap(values), shape)
            OnnxJavaType.DOUBLE -> {
                val doubleValues = DoubleArray(values.size) { values[it].toDouble() }
                OnnxTensor.createTensor(env, DoubleBuffer.wrap(doubleValues), shape)
            }
            else -> throw TtsException(
                context.getString(R.string.onnx_tts_error_unsupported_input_type, name, info.type.name)
            )
        }
    }

    private fun shapeForValues(info: TensorInfo, valueCount: Int, inputName: String): LongArray {
        val shape = info.shape ?: return longArrayOf(valueCount.toLong())
        if (shape.isEmpty()) {
            if (valueCount != 1) {
                throw TtsException(context.getString(R.string.onnx_tts_error_shape_unsupported, inputName))
            }
            return longArrayOf()
        }

        val normalized = shape.copyOf()
        val unknownIndices = ArrayList<Int>()
        var knownProduct = 1L
        normalized.forEachIndexed { index, dim ->
            if (dim <= 0) {
                unknownIndices.add(index)
            } else {
                knownProduct *= dim
            }
        }

        if (unknownIndices.isNotEmpty()) {
            if (knownProduct <= 0 || valueCount.toLong() % knownProduct != 0L) {
                throw TtsException(context.getString(R.string.onnx_tts_error_shape_unsupported, inputName))
            }
            unknownIndices.dropLast(1).forEach { index ->
                normalized[index] = 1L
            }
            normalized[unknownIndices.last()] = valueCount.toLong() / knownProduct
        }

        val product = normalized.fold(1L) { acc, dim -> acc * dim }
        if (product != valueCount.toLong()) {
            throw TtsException(context.getString(R.string.onnx_tts_error_shape_unsupported, inputName))
        }
        return normalized
    }

    private fun extractPcm16(value: Any?): ShortArray {
        flattenFloats(value).takeIf { it.isNotEmpty() }?.let { return floatsToPcm16(it) }
        flattenDoubles(value).takeIf { it.isNotEmpty() }?.let { return doublesToPcm16(it) }
        flattenShorts(value).takeIf { it.isNotEmpty() }?.let { return it }
        flattenInts(value).takeIf { it.isNotEmpty() }?.let { ints ->
            return ShortArray(ints.size) { index ->
                ints[index].coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
        }
        flattenBytes(value).takeIf { it.isNotEmpty() }?.let { bytes ->
            if (bytes.size % 2 != 0) {
                throw TtsException(context.getString(R.string.onnx_tts_error_output_unsupported))
            }
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            return ShortArray(bytes.size / 2) { buffer.short }
        }
        throw TtsException(context.getString(R.string.onnx_tts_error_output_unsupported))
    }

    private fun floatsToPcm16(samples: FloatArray): ShortArray {
        return ShortArray(samples.size) { index ->
            val sample = samples[index]
            val safeSample = if (sample.isFinite()) sample.coerceIn(-1f, 1f) else 0f
            (safeSample * Short.MAX_VALUE).roundToInt().toShort()
        }
    }

    private fun doublesToPcm16(samples: DoubleArray): ShortArray {
        return ShortArray(samples.size) { index ->
            val sample = samples[index]
            val safeSample = if (sample.isFinite()) sample.coerceIn(-1.0, 1.0) else 0.0
            (safeSample * Short.MAX_VALUE).roundToInt().toShort()
        }
    }

    private fun flattenFloats(value: Any?): FloatArray {
        val result = ArrayList<Float>()
        fun walk(v: Any?) {
            when (v) {
                is FloatArray -> v.forEach { result.add(it) }
                is Array<*> -> v.forEach { walk(it) }
            }
        }
        walk(value)
        return result.toFloatArray()
    }

    private fun flattenDoubles(value: Any?): DoubleArray {
        val result = ArrayList<Double>()
        fun walk(v: Any?) {
            when (v) {
                is DoubleArray -> v.forEach { result.add(it) }
                is Array<*> -> v.forEach { walk(it) }
            }
        }
        walk(value)
        return result.toDoubleArray()
    }

    private fun flattenShorts(value: Any?): ShortArray {
        val result = ArrayList<Short>()
        fun walk(v: Any?) {
            when (v) {
                is ShortArray -> v.forEach { result.add(it) }
                is Array<*> -> v.forEach { walk(it) }
            }
        }
        walk(value)
        return result.toShortArray()
    }

    private fun flattenInts(value: Any?): IntArray {
        val result = ArrayList<Int>()
        fun walk(v: Any?) {
            when (v) {
                is IntArray -> v.forEach { result.add(it) }
                is LongArray -> v.forEach { result.add(it.coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong()).toInt()) }
                is Array<*> -> v.forEach { walk(it) }
            }
        }
        walk(value)
        return result.toIntArray()
    }

    private fun flattenBytes(value: Any?): ByteArray {
        val result = ArrayList<Byte>()
        fun walk(v: Any?) {
            when (v) {
                is ByteArray -> v.forEach { result.add(it) }
                is Array<*> -> v.forEach { walk(it) }
            }
        }
        walk(value)
        return result.toByteArray()
    }

    private fun firstTokenMapObject(root: JSONObject): Pair<String, JSONObject>? {
        listOf("phoneme_id_map", "token_id_map", "tokens", "vocab").forEach { key ->
            root.optJSONObject(key)?.let { return key to it }
        }
        root.optJSONObject("model")?.optJSONObject("vocab")?.let { return "model.vocab" to it }
        return null
    }

    private fun firstTokenArray(root: JSONObject): JSONArray? {
        root.optJSONArray("symbols")?.let { return it }
        root.optJSONObject("model")?.optJSONArray("symbols")?.let { return it }
        return null
    }

    private fun parseTokenMap(obj: JSONObject): Map<String, List<Long>> {
        val result = LinkedHashMap<String, List<Long>>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key == "_" || key.isEmpty() || key == "<blank>" || key == "^" || key == "\$") {
                continue
            }
            val ids = parseJsonIds(obj.opt(key), key)
            if (ids.isNotEmpty()) {
                result[key] = ids
            }
        }
        return result
    }

    private fun parseTokenArray(arr: JSONArray): Map<String, List<Long>> {
        val result = LinkedHashMap<String, List<Long>>()
        for (i in 0 until arr.length()) {
            val symbol = arr.optString(i, "")
            if (symbol.isNotEmpty() && symbol != "_" && symbol != "<blank>" && symbol != "^" && symbol != "\$") {
                result[symbol] = listOf(i.toLong())
            }
        }
        return result
    }

    private fun readFirstTokenId(obj: JSONObject, key: String): Long? {
        return readTokenIds(obj, key).firstOrNull()
    }

    private fun readTokenIds(obj: JSONObject, key: String): List<Long> {
        if (!obj.has(key)) return emptyList()
        return parseJsonIds(obj.opt(key), key)
    }

    private fun parseJsonIds(value: Any?, label: String): List<Long> {
        return when (value) {
            is Number -> listOf(value.toLong())
            is String -> listOf(parseLong(value, label))
            is JSONArray -> buildList {
                for (i in 0 until value.length()) {
                    add(parseJsonId(value.opt(i), "$label[$i]"))
                }
            }
            else -> emptyList()
        }
    }

    private fun parseJsonId(value: Any?, label: String): Long {
        return when (value) {
            is Number -> value.toLong()
            is String -> parseLong(value, label)
            else -> throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_id, label))
        }
    }

    private fun parseIds(raw: String, label: String): List<Long> {
        return raw.split(',', ';', ' ', '\n', '\t')
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { parseLong(it, label) }
    }

    private fun parseLong(raw: String, label: String): Long {
        return raw.trim().toLongOrNull()
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_id, label))
    }

    private fun optionalHeaderIds(key: String): List<Long>? {
        val raw = config.headers[key]?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return parseIds(raw, key)
    }

    private fun optionalHeaderLong(key: String): Long? {
        val raw = config.headers[key]?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return raw.toLongOrNull()
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_id, key))
    }

    private fun optionalHeaderInt(key: String): Int? {
        val raw = config.headers[key]?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return raw.toIntOrNull()
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_int, key))
    }

    private fun optionalHeaderFloat(key: String): Float? {
        val raw = config.headers[key]?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return raw.toFloatOrNull()
            ?: throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_float, key))
    }

    private fun optionalHeaderBool(key: String): Boolean? {
        val raw = config.headers[key]?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return when (raw.lowercase()) {
            "true", "1", "yes", "y" -> true
            "false", "0", "no", "n" -> false
            else -> throw TtsException(context.getString(R.string.onnx_tts_error_config_invalid_bool, key))
        }
    }

    private fun JSONObject.optionalInt(key: String): Int? {
        if (!has(key)) return null
        val value = opt(key)
        return when (value) {
            is Number -> value.toInt()
            is String -> value.trim().toIntOrNull()
            else -> null
        }
    }

    private fun JSONObject.optionalFloat(key: String): Float? {
        if (!has(key)) return null
        val value = opt(key)
        return when (value) {
            is Number -> value.toFloat()
            is String -> value.trim().toFloatOrNull()
            else -> null
        }
    }

    private fun isCurrentPlayback(generation: Long): Boolean {
        return synchronized(stateLock) { playbackGeneration == generation && currentAudioTrack != null }
    }

    private fun isPlaybackPaused(generation: Long): Boolean {
        return synchronized(stateLock) { playbackGeneration == generation && paused }
    }

    private fun normalizeLocalPath(raw: String): String {
        return raw.trim().removePrefix("file://")
    }

    private fun tokenizeSymbolsByMap(text: String, tokenMap: Map<String, List<Long>>): List<String> {
        if (tokenMap.isEmpty()) return emptyList()
        val sortedKeys = tokenMap.keys
            .filter { it.isNotEmpty() }
            .sortedByDescending { it.length }
        val result = ArrayList<String>()
        var index = 0
        while (index < text.length) {
            val matched = sortedKeys.firstOrNull { key ->
                text.regionMatches(index, key, 0, key.length, ignoreCase = false)
            }
            if (matched != null) {
                result.add(matched)
                index += matched.length
            } else {
                val codePoint = text.codePointAt(index)
                result.add(String(Character.toChars(codePoint)))
                index += Character.charCount(codePoint)
            }
        }
        return result
    }

    private fun printableSymbol(symbol: String): String {
        return when (symbol) {
            "\n" -> "\\n"
            "\r" -> "\\r"
            "\t" -> "\\t"
            " " -> "space"
            else -> symbol
        }
    }

    private fun speechPreview(text: String): String {
        return text.replace("\n", "\\n").take(SPEECH_PREVIEW_MAX)
    }
}
