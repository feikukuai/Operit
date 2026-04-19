package com.ai.assistance.operit.ui.features.packages.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberAsyncImagePainter
import com.ai.assistance.operit.R
import com.ai.assistance.operit.data.api.GitHubIssue
import com.ai.assistance.operit.data.preferences.GitHubUser
import com.ai.assistance.operit.ui.features.packages.market.ArtifactMarketItem
import com.ai.assistance.operit.ui.features.packages.market.ArtifactMarketScope
import com.ai.assistance.operit.ui.features.packages.market.PublishArtifactType
import com.ai.assistance.operit.ui.features.packages.screens.artifact.viewmodel.ArtifactMarketViewModel
import com.ai.assistance.operit.ui.features.packages.utils.ArtifactIssueParser

@Composable
fun ArtifactMarketScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToPublish: () -> Unit = {},
    onNavigateToManage: () -> Unit = {},
    onNavigateToDetail: ((GitHubIssue) -> Unit)? = null
) {
    val context = LocalContext.current
    val viewModel: ArtifactMarketViewModel =
        viewModel(
            key = "artifact-market-all",
            factory = ArtifactMarketViewModel.Factory(context.applicationContext, ArtifactMarketScope.ALL)
        )

    val isLoggedIn by viewModel.isLoggedIn.collectAsState()
    val currentUser by viewModel.currentUser.collectAsState()
    val items by viewModel.marketItems.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val installingIds by viewModel.installingIds.collectAsState()
    val installedArtifactIds by viewModel.installedArtifactIds.collectAsState()

    var selectedTab by remember { mutableStateOf(0) }
    var showLoginDialog by remember { mutableStateOf(false) }
    var pendingUnsupportedInstall by remember { mutableStateOf<ArtifactMarketItem?>(null) }

    LaunchedEffect(Unit) {
        viewModel.loadMarketData()
        viewModel.refreshInstalledArtifacts()
    }

    errorMessage?.let { error ->
        LaunchedEffect(error) {
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 4.dp) {
            Column {
                if (!isLoggedIn) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showLoginDialog = true }
                            .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.1f))
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = stringResource(R.string.login_github_to_manage_artifacts),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                }

                TabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
                    Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text(stringResource(R.string.browse)) })
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(stringResource(R.string.my_tab))
                                if (isLoggedIn && currentUser != null) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Image(
                                        painter = rememberAsyncImagePainter(currentUser!!.avatarUrl),
                                        contentDescription = stringResource(R.string.user_avatar),
                                        modifier = Modifier.size(20.dp).clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                            }
                        }
                    )
                }
            }
        }

        Box(modifier = Modifier.weight(1f)) {
            when (selectedTab) {
                0 -> ArtifactBrowseTab(
                    items = items,
                    isLoading = isLoading,
                    searchQuery = searchQuery,
                    onSearchQueryChanged = viewModel::onSearchQueryChanged,
                    onRefresh = {
                        viewModel.loadMarketData()
                        viewModel.refreshInstalledArtifacts()
                    },
                    onViewDetails = { issue ->
                        if (onNavigateToDetail != null) {
                            onNavigateToDetail(issue)
                        } else {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(issue.html_url)))
                        }
                    },
                    viewModel = viewModel,
                    installingIds = installingIds,
                    installedArtifactIds = installedArtifactIds,
                    onInstallRequest = { item ->
                        if (viewModel.isCompatible(item.metadata)) {
                            viewModel.installArtifact(item)
                        } else {
                            pendingUnsupportedInstall = item
                        }
                    }
                )

                1 -> ArtifactMyTab(
                    isLoggedIn = isLoggedIn,
                    currentUser = currentUser,
                    onLogin = { showLoginDialog = true },
                    onLogout = { viewModel.logoutFromGitHub() },
                    onNavigateToPublish = onNavigateToPublish,
                    onNavigateToManage = onNavigateToManage
                )
            }
        }
    }

    if (showLoginDialog) {
        ArtifactGitHubLoginDialog(
            isLoggedIn = isLoggedIn,
            currentUser = currentUser,
            onDismiss = { showLoginDialog = false },
            onLogin = {
                viewModel.initiateGitHubLogin(context)
                showLoginDialog = false
            },
            onLogout = {
                viewModel.logoutFromGitHub()
                showLoginDialog = false
            }
        )
    }

    pendingUnsupportedInstall?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingUnsupportedInstall = null },
            title = { Text(stringResource(R.string.unsupported_artifact_version_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.unsupported_artifact_version_message,
                        item.metadata.displayName,
                        viewModel.currentAppVersion,
                        viewModel.supportedVersionLabel(item.metadata)
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.installArtifact(item)
                        pendingUnsupportedInstall = null
                    }
                ) {
                    Text(stringResource(R.string.continue_download_anyway))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingUnsupportedInstall = null }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
}

@Composable
private fun ArtifactBrowseTab(
    items: List<ArtifactMarketItem>,
    isLoading: Boolean,
    searchQuery: String,
    onSearchQueryChanged: (String) -> Unit,
    onRefresh: () -> Unit,
    onViewDetails: (GitHubIssue) -> Unit,
    viewModel: ArtifactMarketViewModel,
    installingIds: Set<String>,
    installedArtifactIds: Set<String>,
    onInstallRequest: (ArtifactMarketItem) -> Unit
) {
    val listState = rememberLazyListState()
    val isLoadingMore by viewModel.isLoadingMore.collectAsState()
    val hasMore by viewModel.hasMore.collectAsState()

    LaunchedEffect(listState, items.size, searchQuery, hasMore, isLoadingMore) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
            .collect { lastVisibleIndex ->
                if (searchQuery.isNotBlank()) return@collect
                val lastIssueIndex = 1 + items.size - 1
                if (hasMore && !isLoadingMore && items.isNotEmpty() && lastVisibleIndex >= (lastIssueIndex - 2)) {
                    viewModel.loadMoreMarketData()
                }
            }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChanged,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            placeholder = { Text(stringResource(R.string.artifact_market_search_placeholder)) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { onSearchQueryChanged("") }) {
                        Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.clear_search))
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(16.dp)
        )

        Box(modifier = Modifier.fillMaxSize()) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = listState,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (searchQuery.isBlank()) {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(R.string.available_artifacts_market),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                IconButton(onClick = onRefresh) {
                                    Icon(Icons.Default.Refresh, contentDescription = null)
                                }
                            }
                        }
                    }

                    items(items, key = { it.issue.id }) { item ->
                        val info = remember(item.issue) { ArtifactIssueParser.parseArtifactInfo(item.issue) }
                        ArtifactIssueCard(
                            item = item,
                            info = info,
                            viewModel = viewModel,
                            isInstalling = installingIds.contains(info.normalizedId),
                            isInstalled = installedArtifactIds.contains(info.normalizedId),
                            onInstall = { onInstallRequest(item) },
                            onViewDetails = { onViewDetails(item.issue) }
                        )
                    }

                    if (isLoadingMore) {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            }
                        }
                    }

                    if (items.isEmpty() && !isLoading) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Icon(
                                        if (searchQuery.isNotBlank()) Icons.Default.SearchOff else Icons.Default.Store,
                                        contentDescription = null,
                                        modifier = Modifier.size(48.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = stringResource(if (searchQuery.isNotBlank()) R.string.no_matching_artifacts_found else R.string.no_artifacts_available),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = stringResource(if (searchQuery.isNotBlank()) R.string.try_changing_keywords else R.string.refresh_or_try_again_later),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ArtifactMyTab(
    isLoggedIn: Boolean,
    currentUser: GitHubUser?,
    onLogin: () -> Unit,
    onLogout: () -> Unit,
    onNavigateToPublish: () -> Unit,
    onNavigateToManage: () -> Unit
) {
    if (!isLoggedIn) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Icon(Icons.Default.AccountCircle, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.please_login_github_first), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.after_logging_in_you_can_view_and_manage_your_artifacts), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onLogin) {
                    Icon(Icons.Default.Login, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.login_github))
                }
            }
        }
    } else {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (currentUser != null) {
                    Image(
                        painter = rememberAsyncImagePainter(currentUser.avatarUrl),
                        contentDescription = stringResource(R.string.user_avatar),
                        modifier = Modifier.size(64.dp).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.primary, CircleShape),
                        contentScale = ContentScale.Crop
                    )
                    Text(currentUser.name ?: currentUser.login, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("@${currentUser.login}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onNavigateToPublish, modifier = Modifier.fillMaxWidth(0.8f)) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.publish_new_artifact))
                }
                OutlinedButton(onClick = onNavigateToManage, modifier = Modifier.fillMaxWidth(0.8f)) {
                    Icon(Icons.Default.Settings, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.manage_my_artifacts))
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(0.8f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.logout))
                }
            }
        }
    }
}

@Composable
private fun ArtifactIssueCard(
    item: ArtifactMarketItem,
    info: ArtifactIssueParser.ParsedArtifactInfo,
    viewModel: ArtifactMarketViewModel,
    isInstalling: Boolean,
    isInstalled: Boolean,
    onInstall: () -> Unit,
    onViewDetails: () -> Unit
) {
    val avatarUrl by viewModel.userAvatarCache.collectAsState()
    val artifactType = info.type
    val isCompatible = item.metadata.let(viewModel::isCompatible)
    val compatibilityLabel = item.metadata.let(viewModel::supportedVersionLabel)

    LaunchedEffect(info.repositoryOwner) {
        if (info.repositoryOwner.isNotBlank()) {
            viewModel.fetchUserAvatar(info.repositoryOwner)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable { onViewDetails() },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(info.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (info.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(info.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }

                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    ArtifactBadge(
                        label =
                            when (artifactType) {
                                PublishArtifactType.SCRIPT -> stringResource(R.string.artifact_type_script)
                                PublishArtifactType.PACKAGE -> stringResource(R.string.artifact_type_package)
                                null -> item.metadata.type
                            },
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    ArtifactBadge(
                        label = stringResource(R.string.supported_app_versions_short, compatibilityLabel),
                        containerColor = if (isCompatible) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.errorContainer,
                        contentColor = if (isCompatible) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onErrorContainer
                    )
                }

                val thumbsUpCount = item.issue.reactions?.thumbs_up ?: 0
                val heartCount = item.issue.reactions?.heart ?: 0
                val publisherAvatar = avatarUrl[info.repositoryOwner]

                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (publisherAvatar != null) {
                        Image(
                            painter = rememberAsyncImagePainter(publisherAvatar),
                            contentDescription = null,
                            modifier = Modifier.size(18.dp).clip(CircleShape),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                    Image(
                        painter = rememberAsyncImagePainter(item.issue.user.avatarUrl),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                    if (thumbsUpCount > 0) {
                        Icon(Icons.Default.ThumbUp, contentDescription = null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(thumbsUpCount.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    if (heartCount > 0) {
                        Icon(Icons.Default.Favorite, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFFE91E63))
                        Text(heartCount.toString(), style = MaterialTheme.typography.labelSmall, color = Color(0xFFE91E63))
                    }
                }
            }

            val containerColor = when {
                isInstalled -> MaterialTheme.colorScheme.secondaryContainer
                isInstalling -> MaterialTheme.colorScheme.primaryContainer
                item.issue.state == "open" -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
            val contentColor = when {
                isInstalled -> MaterialTheme.colorScheme.onSecondaryContainer
                isInstalling -> MaterialTheme.colorScheme.onPrimaryContainer
                item.issue.state == "open" -> MaterialTheme.colorScheme.onPrimary
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }

            Surface(shape = CircleShape, color = containerColor) {
                IconButton(
                    onClick = {
                        if (item.issue.state == "open" && !isInstalled && !isInstalling) {
                            onInstall()
                        }
                    },
                    modifier = Modifier.size(34.dp)
                ) {
                    when {
                        isInstalling -> CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = contentColor)
                        isInstalled -> Icon(Icons.Default.Check, contentDescription = null, tint = contentColor, modifier = Modifier.size(18.dp))
                        item.issue.state == "open" -> Icon(Icons.Default.Download, contentDescription = null, tint = contentColor, modifier = Modifier.size(18.dp))
                        else -> Icon(Icons.Default.Warning, contentDescription = null, tint = contentColor, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ArtifactBadge(
    label: String,
    containerColor: Color,
    contentColor: Color
) {
    Surface(shape = RoundedCornerShape(999.dp), color = containerColor) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = contentColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ArtifactGitHubLoginDialog(
    isLoggedIn: Boolean,
    currentUser: GitHubUser?,
    onDismiss: () -> Unit,
    onLogin: () -> Unit,
    onLogout: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isLoggedIn) stringResource(R.string.github_account) else stringResource(R.string.login_github)) },
        text = {
            if (isLoggedIn && currentUser != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Image(
                        painter = rememberAsyncImagePainter(currentUser.avatarUrl),
                        contentDescription = stringResource(R.string.user_avatar),
                        modifier = Modifier.size(64.dp).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.primary, CircleShape),
                        contentScale = ContentScale.Crop
                    )
                    Text(currentUser.name ?: currentUser.login, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("@${currentUser.login}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                Column {
                    Text(stringResource(R.string.after_logging_in_you_can))
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("• ${stringResource(R.string.publish_new_artifact)}")
                    Text("• ${stringResource(R.string.manage_my_artifacts)}")
                    Text("• OperitForge 直连发布")
                }
            }
        },
        confirmButton = {
            if (isLoggedIn) {
                Button(onClick = onLogout) { Text(stringResource(R.string.logout)) }
            } else {
                Button(onClick = onLogin) {
                    Icon(Icons.Default.Login, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.login_github))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel))
            }
        }
    )
}
