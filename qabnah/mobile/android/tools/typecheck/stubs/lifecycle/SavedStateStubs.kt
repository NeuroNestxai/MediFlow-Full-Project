package androidx.savedstate

class SavedState
class SavedStateRegistry {
    fun interface SavedStateProvider { fun saveState(): SavedState }
    fun consumeRestoredStateForKey(key: String): SavedState? = null
    fun registerSavedStateProvider(key: String, provider: SavedStateProvider) {}
    fun unregisterSavedStateProvider(key: String) {}
    val isRestored: Boolean get() = false
}
interface SavedStateRegistryOwner : androidx.lifecycle.LifecycleOwner { val savedStateRegistry: SavedStateRegistry }
class SavedStateRegistryController private constructor() {
    val savedStateRegistry: SavedStateRegistry get() = TODO()
    fun performAttach() {}
    fun performRestore(savedState: SavedState?) {}
    fun performSave(outBundle: SavedState) {}
    companion object { fun create(owner: SavedStateRegistryOwner): SavedStateRegistryController = TODO() }
}
fun savedState(): SavedState = SavedState()
