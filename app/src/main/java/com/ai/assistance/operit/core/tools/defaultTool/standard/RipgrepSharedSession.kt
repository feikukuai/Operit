package com.ai.assistance.operit.core.tools.defaultTool.standard

import android.content.Context
import com.ai.assistance.operit.core.tools.system.Terminal
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object RipgrepSharedSession {
    private const val SESSION_NAME = "rg_shared"

    @Volatile
    private var sharedSessionId: String? = null

    private val mutex = Mutex()

    suspend fun getOrCreateSharedSession(context: Context): String? {
        sharedSessionId?.let { existingId ->
            val terminal = Terminal.getInstance(context)
            if (terminal.terminalState.value.sessions.any { it.id == existingId }) {
                return existingId
            }
        }

        return mutex.withLock {
            val terminal = Terminal.getInstance(context)

            sharedSessionId?.let { existingId ->
                if (terminal.terminalState.value.sessions.any { it.id == existingId }) {
                    return@withLock existingId
                }
            }

            val existingSession =
                terminal.terminalState.value.sessions.find { it.title == SESSION_NAME }
            if (existingSession != null) {
                sharedSessionId = existingSession.id
                return@withLock existingSession.id
            }

            val newSessionId = terminal.createSession(SESSION_NAME)
            sharedSessionId = newSessionId
            newSessionId
        }
    }
}
