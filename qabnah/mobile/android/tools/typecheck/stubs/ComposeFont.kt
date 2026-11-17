// Android-only ui-text API (androidx.compose.ui.text.font.Font(resId, ...)) that desktop Compose lacks.
package androidx.compose.ui.text.font

fun Font(
    resId: Int,
    weight: FontWeight = FontWeight.Normal,
    style: FontStyle = FontStyle.Normal,
    loadingStrategy: FontLoadingStrategy = FontLoadingStrategy.Blocking,
): Font = TODO()
