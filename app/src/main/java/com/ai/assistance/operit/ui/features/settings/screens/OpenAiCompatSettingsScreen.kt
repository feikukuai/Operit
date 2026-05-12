package com.ai.assistance.operit.ui.features.settings.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Api
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.ToggleOn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.ai.assistance.operit.R
import com.ai.assistance.operit.api.chat.AIForegroundService
import com.ai.assistance.operit.data.preferences.OpenAiCompatPreferences
import com.ai.assistance.operit.integrations.http.ExternalChatHttpNetworkInfo
import com.ai.assistance.operit.integrations.openai.OpenAiCompatHttpState
import com.ai.assistance.operit.ui.components.CustomScaffold
import kotlinx.coroutines.launch

@Composable
fun OpenAiCompatSettingsScreen(onBackPressed: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val preferences = remember { OpenAiCompatPreferences.getInstance(context) }

    val enabled by preferences.enabledFlow.collectAsState(initial = false)
    val savedPort by preferences.portFlow.collectAsState(initial = OpenAiCompatPreferences.DEFAULT_PORT)
    val apiKey by preferences.apiKeyFlow.collectAsState(initial = "")
    val serviceState by AIForegroundService.openAiCompatState.collectAsState()

    var portText by remember { mutableStateOf(savedPort.toString()) }
    LaunchedEffect(savedPort) {
        portText = savedPort.toString()
    }

    val accessUrls = remember(savedPort) {
        ExternalChatHttpNetworkInfo.getLocalIpv4Addresses().map { ip ->
            "http://$ip:$savedPort"
        }
    }
    val displayApiKey = apiKey.ifBlank {
        context.getString(R.string.openai_compat_api_key_not_generated)
    }
    val curlApiKey = apiKey.ifBlank { "<api-key>" }
    val sampleBaseUrl = accessUrls.firstOrNull() ?: "http://127.0.0.1:$savedPort"
    val modelsUrl = "$sampleBaseUrl/v1/models"
    val chatUrl = "$sampleBaseUrl/v1/chat/completions"
    val listModelsCurl = remember(sampleBaseUrl, curlApiKey) {
        """curl "$sampleBaseUrl/v1/models" -H "Authorization: Bearer $curlApiKey" """.trimIndent()
    }
    val chatCurl = remember(sampleBaseUrl, curlApiKey) {
        """
curl "$sampleBaseUrl/v1/chat/completions" \
  -H "Authorization: Bearer $curlApiKey" \
  -H "Content-Type: application/json" \
  -d '{"model":"cloud/default/deepseek-chat","messages":[{"role":"user","content":"你好"}],"stream":false}'
        """.trimIndent()
    }
    val streamCurl = remember(sampleBaseUrl, curlApiKey) {
        """
curl "$sampleBaseUrl/v1/chat/completions" \
  -H "Authorization: Bearer $curlApiKey" \
  -H "Content-Type: application/json" \
  -d '{"model":"cloud/default/deepseek-chat","messages":[{"role":"user","content":"你好"}],"stream":true}'
        """.trimIndent()
    }

    val sectionContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.22f)
    val exampleContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    val cardBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)

    fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    fun copyText(text: String, label: String, successMessage: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
        showToast(successMessage)
    }

    fun savePort() {
        scope.launch {
            val parsedPort = portText.toIntOrNull()
            if (parsedPort == null || !OpenAiCompatPreferences.isValidPort(parsedPort)) {
                showToast(context.getString(R.string.openai_compat_invalid_port))
                return@launch
            }
            preferences.setPort(parsedPort)
            if (enabled) {
                AIForegroundService.ensureRunningForOpenAiCompat(context)
            }
            showToast(context.getString(R.string.openai_compat_port_saved))
        }
    }

    CustomScaffold { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Enable/Disable
            SettingsCard(
                title = stringResource(R.string.openai_compat_enable),
                subtitle = stringResource(R.string.openai_compat_enable_desc),
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.ToggleOn, contentDescription = null) }
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (enabled) {
                            stringResource(R.string.openai_compat_service_enabled)
                        } else {
                            stringResource(R.string.openai_compat_service_disabled)
                        },
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Switch(
                        checked = enabled,
                        onCheckedChange = { checked ->
                            scope.launch {
                                if (checked) {
                                    preferences.ensureApiKey()
                                    preferences.setEnabled(true)
                                    AIForegroundService.ensureRunningForOpenAiCompat(context)
                                    showToast(context.getString(R.string.openai_compat_service_enabled))
                                } else {
                                    preferences.setEnabled(false)
                                    AIForegroundService.stopOpenAiCompat(context)
                                    showToast(context.getString(R.string.openai_compat_service_disabled))
                                }
                            }
                        }
                    )
                }
            }

            // Port
            SettingsCard(
                title = stringResource(R.string.openai_compat_port),
                subtitle = stringResource(R.string.openai_compat_port_desc),
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Router, contentDescription = null) }
            ) {
                OutlinedTextField(
                    value = portText,
                    onValueChange = { newValue ->
                        portText = newValue.filter { it.isDigit() }.take(5)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.openai_compat_port)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = ::savePort) {
                        Text(stringResource(R.string.openai_compat_save_port))
                    }
                    if (enabled) {
                        TextButton(onClick = { AIForegroundService.ensureRunningForOpenAiCompat(context) }) {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                            Text(stringResource(R.string.openai_compat_restart_service))
                        }
                    }
                }
            }

            // API Key
            SettingsCard(
                title = stringResource(R.string.openai_compat_api_key),
                subtitle = stringResource(R.string.openai_compat_api_key_desc),
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Key, contentDescription = null) }
            ) {
                OutlinedTextField(
                    value = displayApiKey,
                    onValueChange = {},
                    modifier = Modifier.fillMaxWidth(),
                    readOnly = true,
                    label = { Text(stringResource(R.string.openai_compat_api_key)) }
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = {
                            if (apiKey.isBlank()) {
                                showToast(context.getString(R.string.openai_compat_api_key_not_generated))
                            } else {
                                copyText(
                                    text = apiKey,
                                    label = "openai-compat-api-key",
                                    successMessage = context.getString(R.string.openai_compat_api_key_copied)
                                )
                            }
                        }
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null)
                        Text(stringResource(R.string.openai_compat_copy_api_key))
                    }
                    TextButton(
                        onClick = {
                            scope.launch {
                                val newKey = preferences.resetApiKey()
                                copyText(
                                    text = newKey,
                                    label = "openai-compat-api-key",
                                    successMessage = context.getString(R.string.openai_compat_api_key_reset)
                                )
                            }
                        }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Text(stringResource(R.string.openai_compat_reset_api_key))
                    }
                }
            }

            // Status
            SettingsCard(
                title = stringResource(R.string.openai_compat_status),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Api, contentDescription = null) }
            ) {
                val statusText = when {
                    serviceState.isRunning -> stringResource(
                        R.string.openai_compat_status_running,
                        serviceState.port ?: savedPort
                    )
                    !serviceState.lastError.isNullOrBlank() -> stringResource(
                        R.string.openai_compat_status_error,
                        serviceState.lastError ?: ""
                    )
                    else -> stringResource(R.string.openai_compat_status_stopped)
                }
                Text(text = statusText, style = MaterialTheme.typography.bodyLarge)
            }

            // Access URLs
            SettingsCard(
                title = stringResource(R.string.openai_compat_access_urls),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Api, contentDescription = null) }
            ) {
                Text(
                    text = stringResource(
                        R.string.openai_compat_bind_hint,
                        serviceState.port ?: savedPort
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                if (accessUrls.isEmpty()) {
                    Text(
                        text = stringResource(R.string.openai_compat_no_lan_ip),
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else {
                    accessUrls.forEach { url ->
                        SelectionContainer {
                            Text(text = url, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }

            // API Endpoints
            SettingsCard(
                title = stringResource(R.string.openai_compat_endpoints_title),
                subtitle = stringResource(R.string.openai_compat_endpoints_desc),
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Api, contentDescription = null) }
            ) {
                Text(
                    text = stringResource(R.string.openai_compat_models_endpoint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                SelectionContainer {
                    Text(text = modelsUrl, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.openai_compat_chat_endpoint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                SelectionContainer {
                    Text(text = chatUrl, style = MaterialTheme.typography.bodyMedium)
                }
            }

            // List Models Example
            SettingsCard(
                title = stringResource(R.string.openai_compat_list_models_example),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Info, contentDescription = null) }
            ) {
                ExampleBlock(listModelsCurl, exampleContainerColor)
                TextButton(
                    onClick = {
                        copyText(
                            text = listModelsCurl,
                            label = "openai-compat-list-models",
                            successMessage = context.getString(R.string.openai_compat_example_copied)
                        )
                    }
                ) {
                    Text(stringResource(R.string.openai_compat_copy_example))
                }
            }

            // Chat Example
            SettingsCard(
                title = stringResource(R.string.openai_compat_chat_example),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Info, contentDescription = null) }
            ) {
                ExampleBlock(chatCurl, exampleContainerColor)
                TextButton(
                    onClick = {
                        copyText(
                            text = chatCurl,
                            label = "openai-compat-chat",
                            successMessage = context.getString(R.string.openai_compat_example_copied)
                        )
                    }
                ) {
                    Text(stringResource(R.string.openai_compat_copy_example))
                }
            }

            // Stream Example
            SettingsCard(
                title = stringResource(R.string.openai_compat_stream_example),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Info, contentDescription = null) }
            ) {
                ExampleBlock(streamCurl, exampleContainerColor)
                TextButton(
                    onClick = {
                        copyText(
                            text = streamCurl,
                            label = "openai-compat-stream",
                            successMessage = context.getString(R.string.openai_compat_example_copied)
                        )
                    }
                ) {
                    Text(stringResource(R.string.openai_compat_copy_example))
                }
            }

            // Description / Help
            SettingsCard(
                title = stringResource(R.string.openai_compat_description_title),
                subtitle = null,
                containerColor = sectionContainerColor,
                borderColor = cardBorderColor,
                icon = { Icon(Icons.Default.Info, contentDescription = null) }
            ) {
                Text(
                    text = stringResource(R.string.openai_compat_description_content),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun SettingsCard(
    title: String,
    subtitle: String?,
    containerColor: Color,
    borderColor: Color,
    icon: @Composable () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = androidx.compose.foundation.BorderStroke(1.dp, borderColor)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CompositionLocalProvider(
                    LocalContentColor provides MaterialTheme.colorScheme.primary
                ) {
                    icon()
                }
                Column {
                    Text(text = title, style = MaterialTheme.typography.titleMedium)
                    if (!subtitle.isNullOrBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            HorizontalDivider()
            content()
        }
    }
}

@Composable
private fun ExampleBlock(
    text: String,
    containerColor: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        SelectionContainer {
            Text(
                text = text,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
