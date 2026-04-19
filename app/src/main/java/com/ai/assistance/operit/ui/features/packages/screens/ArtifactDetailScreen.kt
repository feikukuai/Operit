package com.ai.assistance.operit.ui.features.packages.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Update
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.ai.assistance.operit.R
import com.ai.assistance.operit.data.api.GitHubComment
import com.ai.assistance.operit.data.api.GitHubIssue
import com.ai.assistance.operit.data.api.GitHubReaction
import com.ai.assistance.operit.data.preferences.GitHubUser
import com.ai.assistance.operit.ui.components.CustomScaffold
import com.ai.assistance.operit.ui.features.packages.market.ArtifactMarketItem
import com.ai.assistance.operit.ui.features.packages.market.ArtifactMarketScope
import com.ai.assistance.operit.ui.features.packages.market.PublishArtifactType
import com.ai.assistance.operit.ui.features.packages.screens.artifact.viewmodel.ArtifactMarketViewModel
import com.ai.assistance.operit.ui.features.packages.utils.ArtifactIssueParser
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtifactDetailScreen(issue: GitHubIssue, onNavigateBack: () -> Unit = {}) {
    val info = remember(issue) { ArtifactIssueParser.parseArtifactInfo(issue) }
    val artifactType = info.type
    if (artifactType == null) {
        InvalidArtifactMetadataScreen()
        return
    }
    val context = LocalContext.current
    val viewModel: ArtifactMarketViewModel =
        viewModel(
            key = "artifact-detail-${artifactType.wireValue}",
            factory = ArtifactMarketViewModel.Factory(
                context.applicationContext,
                if (artifactType == PublishArtifactType.PACKAGE) ArtifactMarketScope.PACKAGE_ONLY else ArtifactMarketScope.SCRIPT_ONLY
            )
        )

    val isLoggedIn by viewModel.isLoggedIn.collectAsState()
    val currentUser by viewModel.currentUser.collectAsState()
    val comments by viewModel.issueComments.collectAsState()
    val isLoadingComments by viewModel.isLoadingComments.collectAsState()
    val isPostingComment by viewModel.isPostingComment.collectAsState()
    val issueReactions by viewModel.issueReactions.collectAsState()
    val isLoadingReactions by viewModel.isLoadingReactions.collectAsState()
    val isReacting by viewModel.isReacting.collectAsState()
    val installedIds by viewModel.installedArtifactIds.collectAsState()
    val installingIds by viewModel.installingIds.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    var commentText by remember { mutableStateOf("") }
    var showCommentDialog by remember { mutableStateOf(false) }
    var showCompatibilityDialog by remember { mutableStateOf(false) }

    LaunchedEffect(issue.number) {
        viewModel.loadIssueComments(issue.number, artifactType)
        viewModel.loadIssueReactions(issue.number, artifactType)
        viewModel.refreshInstalledArtifacts()
    }

    errorMessage?.let { error ->
        LaunchedEffect(error) {
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    CustomScaffold(
        floatingActionButton = {
            if (isLoggedIn) {
                FloatingActionButton(onClick = { showCommentDialog = true }) {
                    Icon(Icons.Default.AddComment, contentDescription = stringResource(R.string.mcp_plugin_add_comment))
                }
            }
        }
    ) { paddingValues ->
        val currentComments = comments[issue.number] ?: emptyList()
        val isInstalled = installedIds.contains(info.normalizedId)
        val isInstalling = installingIds.contains(info.normalizedId)
        val isCompatible = info.metadata?.let(viewModel::isCompatible) ?: true

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            item { ArtifactHeader(issue = issue, info = info, viewModel = viewModel) }
            item {
                ArtifactActions(
                    artifactType = artifactType,
                    info = info,
                    issue = issue,
                    isInstalled = isInstalled,
                    isInstalling = isInstalling,
                    onInstall = {
                        val metadata = info.metadata
                        if (metadata != null) {
                            if (viewModel.isCompatible(metadata)) {
                                viewModel.installArtifact(ArtifactMarketItem(issue = issue, metadata = metadata))
                            } else {
                                showCompatibilityDialog = true
                            }
                        }
                    },
                    onOpenAsset = {
                        if (info.downloadUrl.isNotBlank()) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(info.downloadUrl)))
                        }
                    }
                )
            }
            if (!isCompatible) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Text(
                            text = stringResource(
                                R.string.unsupported_artifact_version_message,
                                info.title,
                                viewModel.currentAppVersion,
                                info.metadata?.let(viewModel::supportedVersionLabel).orEmpty()
                            ),
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }
            if (info.description.isNotBlank()) {
                item {
                    Card {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(stringResource(R.string.description_label), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(info.description, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            item { ArtifactMetadataCard(issue = issue, info = info, viewModel = viewModel) }
            item {
                ArtifactReactions(
                    issue = issue,
                    currentUser = currentUser,
                    issueReactions = issueReactions[issue.number] ?: emptyList(),
                    isLoading = isLoadingReactions.contains(issue.number),
                    isReacting = isReacting.contains(issue.number),
                    onReact = { reaction -> viewModel.addReactionToIssue(issue.number, artifactType, reaction) }
                )
            }
            item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }
            item {
                CommentsHeader(
                    commentCount = currentComments.size,
                    isLoading = isLoadingComments.contains(issue.number),
                    onRefresh = { viewModel.loadIssueComments(issue.number, artifactType) }
                )
            }
            if (currentComments.isEmpty() && !isLoadingComments.contains(issue.number)) {
                item { EmptyCommentsCard() }
            } else {
                items(currentComments, key = { it.id }) { comment ->
                    CommentCard(comment)
                }
            }
        }
    }

    if (showCommentDialog) {
        CommentInputDialog(
            commentText = commentText,
            onCommentTextChange = { commentText = it },
            onDismiss = {
                showCommentDialog = false
                commentText = ""
            },
            onPost = {
                if (commentText.isNotBlank()) {
                    viewModel.postIssueComment(issue.number, artifactType, commentText)
                    showCommentDialog = false
                    commentText = ""
                }
            },
            isPosting = isPostingComment.contains(issue.number)
        )
    }

    if (showCompatibilityDialog && info.metadata != null) {
        AlertDialog(
            onDismissRequest = { showCompatibilityDialog = false },
            title = { Text(stringResource(R.string.unsupported_artifact_version_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.unsupported_artifact_version_message,
                        info.title,
                        viewModel.currentAppVersion,
                        viewModel.supportedVersionLabel(info.metadata)
                    )
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.installArtifact(ArtifactMarketItem(issue = issue, metadata = info.metadata))
                    showCompatibilityDialog = false
                }) {
                    Text(stringResource(R.string.continue_download_anyway))
                }
            },
            dismissButton = {
                TextButton(onClick = { showCompatibilityDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
}

@Composable
private fun ArtifactHeader(
    issue: GitHubIssue,
    info: ArtifactIssueParser.ParsedArtifactInfo,
    viewModel: ArtifactMarketViewModel
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(info.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val avatarUrl by viewModel.userAvatarCache.collectAsState()
            LaunchedEffect(info.publisherLogin) {
                if (info.publisherLogin.isNotBlank()) {
                    viewModel.fetchUserAvatar(info.publisherLogin)
                }
            }
            val publisherAvatar = avatarUrl[info.publisherLogin]
            if (publisherAvatar != null) {
                Image(painter = rememberAsyncImagePainter(publisherAvatar), contentDescription = null, modifier = Modifier.size(24.dp).clip(CircleShape), contentScale = ContentScale.Crop)
            } else {
                Icon(Icons.Default.AccountCircle, contentDescription = null, modifier = Modifier.size(24.dp))
            }
            Text(stringResource(R.string.publisher_colon, info.publisherLogin.ifBlank { "-" }), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Image(painter = rememberAsyncImagePainter(issue.user.avatarUrl), contentDescription = null, modifier = Modifier.size(20.dp).clip(CircleShape), contentScale = ContentScale.Crop)
            Text(stringResource(R.string.market_registrar_colon, issue.user.login), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ArtifactActions(
    artifactType: PublishArtifactType,
    info: ArtifactIssueParser.ParsedArtifactInfo,
    issue: GitHubIssue,
    isInstalled: Boolean,
    isInstalling: Boolean,
    onInstall: () -> Unit,
    onOpenAsset: () -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val installText = when {
            isInstalled -> stringResource(R.string.downloaded_already)
            isInstalling -> stringResource(R.string.downloading)
            artifactType == PublishArtifactType.SCRIPT -> stringResource(R.string.download_script)
            else -> stringResource(R.string.download_package)
        }
        Button(onClick = onInstall, modifier = Modifier.weight(1f), enabled = issue.state == "open" && !isInstalled && !isInstalling) {
            when {
                isInstalling -> CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                isInstalled -> Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                else -> Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(installText)
        }
        OutlinedButton(onClick = onOpenAsset, modifier = Modifier.weight(1f), enabled = info.downloadUrl.isNotBlank()) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.open_asset))
        }
    }
}

@Composable
private fun ArtifactMetadataCard(
    issue: GitHubIssue,
    info: ArtifactIssueParser.ParsedArtifactInfo,
    viewModel: ArtifactMarketViewModel
) {
    Card {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.metadata_title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            MetadataRow(
                Icons.Default.Tag,
                stringResource(R.string.type_label),
                when (info.type) {
                    PublishArtifactType.PACKAGE -> stringResource(R.string.artifact_type_package)
                    PublishArtifactType.SCRIPT -> stringResource(R.string.artifact_type_script)
                    null -> info.metadata?.type ?: "-"
                }
            )
            MetadataRow(Icons.Default.Update, stringResource(R.string.version_label), info.version.ifBlank { "-" })
            MetadataRow(Icons.Default.Info, stringResource(R.string.supported_app_versions), info.metadata?.let(viewModel::supportedVersionLabel) ?: "-")
            MetadataRow(Icons.Default.Info, stringResource(R.string.current_app_version_label), viewModel.currentAppVersion)
            MetadataRow(Icons.Default.Info, stringResource(R.string.asset_file_label), info.assetName.ifBlank { "-" })
            MetadataRow(Icons.Default.Info, stringResource(R.string.forge_repo_label), info.forgeRepo.ifBlank { "-" })
            MetadataRow(Icons.Default.Info, stringResource(R.string.release_tag_label), info.releaseTag.ifBlank { "-" })
            MetadataRow(Icons.Default.Info, stringResource(R.string.sha256_label), info.sha256.ifBlank { "-" })
            MetadataRow(Icons.Default.CalendarToday, stringResource(R.string.updated_at_label), formatDisplayDate(issue.updated_at))
            MetadataRow(Icons.Default.Info, stringResource(R.string.source_file_label), info.sourceFileName.ifBlank { "-" })
        }
    }
}

@Composable
private fun MetadataRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ArtifactReactions(
    issue: GitHubIssue,
    currentUser: GitHubUser?,
    issueReactions: List<GitHubReaction>,
    isLoading: Boolean,
    isReacting: Boolean,
    onReact: (String) -> Unit
) {
    val thumbsUpCount = remember(issueReactions) { issueReactions.count { it.content == "+1" } }
    val heartCount = remember(issueReactions) { issueReactions.count { it.content == "heart" } }

    var hasThumbsUp by remember { mutableStateOf(false) }
    var hasHeart by remember { mutableStateOf(false) }

    LaunchedEffect(issueReactions, currentUser) {
        currentUser?.let { user ->
            hasThumbsUp = issueReactions.any { it.content == "+1" && it.user.login == user.login }
            hasHeart = issueReactions.any { it.content == "heart" && it.user.login == user.login }
        } ?: run {
            hasThumbsUp = false
            hasHeart = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.reactions_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            }
        }

        if (currentUser == null) {
            Text(
                text = stringResource(R.string.mcp_plugin_login_required),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            ArtifactReactionButton(
                icon = Icons.Default.ThumbUp,
                count = thumbsUpCount,
                isReacted = hasThumbsUp,
                enabled = currentUser != null && !isReacting,
                onClick = {
                    if (!hasThumbsUp) {
                        onReact("+1")
                    }
                },
                reactedColor = MaterialTheme.colorScheme.primary
            )
            ArtifactReactionButton(
                icon = Icons.Default.Favorite,
                count = heartCount,
                isReacted = hasHeart,
                enabled = currentUser != null && !isReacting,
                onClick = {
                    if (!hasHeart) {
                        onReact("heart")
                    }
                },
                reactedColor = Color(0xFFE91E63)
            )
        }
    }
}

@Composable
private fun ArtifactReactionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    isReacted: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    reactedColor: Color
) {
    val buttonColors =
        if (isReacted) {
            ButtonDefaults.filledTonalButtonColors(
                containerColor = reactedColor.copy(alpha = 0.12f),
                contentColor = reactedColor
            )
        } else {
            ButtonDefaults.filledTonalButtonColors()
        }

    FilledTonalButton(
        onClick = onClick,
        enabled = enabled && !isReacted,
        colors = buttonColors,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = count.toString(),
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun CommentsHeader(commentCount: Int, isLoading: Boolean, onRefresh: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(R.string.comments_with_count, commentCount), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        IconButton(onClick = onRefresh, enabled = !isLoading) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Default.Refresh, contentDescription = null)
            }
        }
    }
}

@Composable
private fun EmptyCommentsCard() {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.no_comments_yet), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.be_first_comment_here), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CommentCard(comment: GitHubComment) {
    Card {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(painter = rememberAsyncImagePainter(comment.user.avatarUrl), contentDescription = null, modifier = Modifier.size(28.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                Column {
                    Text(comment.user.login, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Text(formatDisplayDate(comment.updated_at), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(comment.body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CommentInputDialog(
    commentText: String,
    onCommentTextChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onPost: () -> Unit,
    isPosting: Boolean
) {
    AlertDialog(
        onDismissRequest = { if (!isPosting) onDismiss() },
        title = { Text(stringResource(R.string.mcp_plugin_add_comment)) },
        text = {
            OutlinedTextField(
                value = commentText,
                onValueChange = onCommentTextChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.comment_label)) },
                minLines = 4
            )
        },
        confirmButton = {
            TextButton(onClick = onPost, enabled = commentText.isNotBlank() && !isPosting) {
                if (isPosting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.publish_action))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isPosting) {
                Text(stringResource(R.string.cancel))
            }
        }
    )
}

@Composable
private fun InvalidArtifactMetadataScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = stringResource(R.string.invalid_artifact_metadata),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun formatDisplayDate(raw: String): String {
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        formatter.format(parser.parse(raw) ?: return raw)
    } catch (_: Exception) {
        raw.take(10)
    }
}
