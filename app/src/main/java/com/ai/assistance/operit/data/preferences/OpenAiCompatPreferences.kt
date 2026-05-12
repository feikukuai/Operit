package com.ai.assistance.operit.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

private val Context.openAiCompatDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "openai_compat_preferences"
)

data class OpenAiCompatConfig(
    val enabled: Boolean,
    val port: Int,
    val apiKey: String
)

class OpenAiCompatPreferences private constructor(private val context: Context) {

    val enabledFlow: Flow<Boolean> =
        context.openAiCompatDataStore.data.map { preferences ->
            preferences[KEY_ENABLED] ?: false
        }

    val portFlow: Flow<Int> =
        context.openAiCompatDataStore.data.map { preferences ->
            preferences[KEY_PORT] ?: DEFAULT_PORT
        }

    val apiKeyFlow: Flow<String> =
        context.openAiCompatDataStore.data.map { preferences ->
            preferences[KEY_API_KEY].orEmpty()
        }

    suspend fun setEnabled(enabled: Boolean) {
        context.openAiCompatDataStore.edit { preferences ->
            preferences[KEY_ENABLED] = enabled
        }
    }

    suspend fun setPort(port: Int) {
        require(isValidPort(port)) { "Invalid port: $port" }
        context.openAiCompatDataStore.edit { preferences ->
            preferences[KEY_PORT] = port
        }
    }

    suspend fun ensureApiKey(): String {
        val existing = getConfig().apiKey
        if (existing.isNotBlank()) {
            return existing
        }
        val generated = generateApiKey()
        context.openAiCompatDataStore.edit { preferences ->
            preferences[KEY_API_KEY] = generated
        }
        return generated
    }

    suspend fun resetApiKey(): String {
        val generated = generateApiKey()
        context.openAiCompatDataStore.edit { preferences ->
            preferences[KEY_API_KEY] = generated
        }
        return generated
    }

    suspend fun getConfig(): OpenAiCompatConfig {
        val preferences = context.openAiCompatDataStore.data.first()
        return OpenAiCompatConfig(
            enabled = preferences[KEY_ENABLED] ?: false,
            port = preferences[KEY_PORT] ?: DEFAULT_PORT,
            apiKey = preferences[KEY_API_KEY].orEmpty()
        )
    }

    fun getConfigSync(): OpenAiCompatConfig = runBlocking {
        getConfig()
    }

    fun getEnabled(): Boolean = runBlocking {
        enabledFlow.first()
    }

    fun getPort(): Int = runBlocking {
        portFlow.first()
    }

    fun getApiKey(): String = runBlocking {
        apiKeyFlow.first()
    }

    companion object {
        const val DEFAULT_PORT = 8095

        private val KEY_ENABLED = booleanPreferencesKey("openai_compat_enabled")
        private val KEY_PORT = intPreferencesKey("openai_compat_port")
        private val KEY_API_KEY = stringPreferencesKey("openai_compat_api_key")

        @Volatile
        private var INSTANCE: OpenAiCompatPreferences? = null

        fun getInstance(context: Context): OpenAiCompatPreferences {
            return INSTANCE ?: synchronized(this) {
                val instance = OpenAiCompatPreferences(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }

        fun isValidPort(port: Int): Boolean {
            return port in 1..65535
        }

        private fun generateApiKey(): String {
            return "sk-operit-${UUID.randomUUID().toString().replace("-", "").take(32)}"
        }
    }
}
