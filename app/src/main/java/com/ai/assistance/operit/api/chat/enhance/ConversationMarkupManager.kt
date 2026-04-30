package com.ai.assistance.operit.api.chat.enhance

import android.content.Context
import com.ai.assistance.operit.R
import com.ai.assistance.operit.util.ChatMarkupRegex
import com.ai.assistance.operit.data.model.ToolResult

/**
 * Manages the markup elements used in conversations with the AI assistant.
 *
 * This class handles the generation of standardized XML-formatted status messages, tool invocation
 * formats, and tool results to be displayed in the conversation.
 */
class ConversationMarkupManager {

    companion object {
        /**
         * Creates an 'error' status markup element for a tool.
         *
         * @param toolName The name of the tool that produced the error
         * @param errorMessage The error message
         * @return The formatted status element
         */
        fun createToolErrorStatus(toolName: String, errorMessage: String): String {
            return createToolResultXml(
                toolName = toolName,
                status = "error",
                content = "<content><error>${errorMessage}</error></content>"
            )
        }

        /**
         * Creates a 'warning' status markup element.
         *
         * @param warningMessage The warning message to display
         * @return The formatted status element
         */
        fun createWarningStatus(warningMessage: String): String {
            return "<status type=\"warning\">$warningMessage</status>"
        }


        /**
         * Formats a tool result message for sending to the AI.
         *
         * @param result The tool execution result
         * @return The formatted tool result message
         */
        fun formatToolResultForMessage(result: ToolResult): String {
            return if (result.success) {
                createToolResultXml(
                    toolName = result.toolName,
                    status = "success",
                    content = "<content>${result.result}</content>"
                )
            } else {
                createToolResultXml(
                    toolName = result.toolName,
                    status = "error",
                    content = "<content><error>${result.error ?: "Unknown error"}</error></content>"
                )
            }
        }

        /**
         * Formats a message indicating multiple tool invocations were found but only one will be
         * processed.
         *
         * @param context The context to access string resources
         * @param toolName The name of the tool that will be processed
         * @return The formatted warning message
         */
        fun createMultipleToolsWarning(context: Context, toolName: String): String {
            return createWarningStatus(
                    context.getString(R.string.conversation_markup_multiple_tools_warning, toolName)
            )
        }

        /**
         * Creates a message for when a tool is not available.
         *
         * @param toolName The name of the unavailable tool
         * @param details Optional detailed error message
         * @return The formatted error message
         */
        fun createToolNotAvailableError(toolName: String, details: String? = null): String {
            val errorMessage = details ?: "The tool `$toolName` is not available."
            return createToolErrorStatus(toolName, errorMessage)
        }

        private fun createToolResultXml(toolName: String, status: String, content: String): String {
            val tagName = ChatMarkupRegex.generateRandomToolResultTagName()
            return """<$tagName name="$toolName" status="$status">$content</$tagName>""".trimIndent()
        }

    }
}
